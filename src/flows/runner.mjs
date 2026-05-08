/**
 * Flow runner — load a workflow from flows/<name>.mjs, validate inputs,
 * execute steps sequentially with variable interpolation.
 *
 * Workflow shape:
 *   export default {
 *     name: "weekly-publish",
 *     description: "...",
 *     inputs: { context: { required: true }, lens: { default: "content" } },
 *     steps: [ { name, bash|js|file|mcp, args?, capture? }, ... ],
 *   };
 *
 * Step exec:
 *   1. Recursively interpolate every string in the step against the live scope
 *   2. Dispatch to the matching connector based on the single typed key
 *   3. If `capture: "name"`, store the connector's return value under scope[name]
 *
 * Variable rules:
 *   "${var}"        — single reference, returns the raw scope value (preserves type)
 *   "prefix ${var}" — string substitution
 *   recursive       — into arrays and objects
 */

import "../lib/env.mjs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { existsSync, readdirSync } from "node:fs";

import bash from "./connectors/bash.mjs";
import js   from "./connectors/js.mjs";
import file from "./connectors/file.mjs";
import mcp  from "./connectors/mcp.mjs";

const CONNECTORS = { bash, js, file, mcp };
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FLOWS_DIR = path.resolve(__dirname, "../../flows");

// ── Variable interpolation ───────────────────────────────────────────────────

const FULL_REF = /^\$\{([^}]+)\}$/;
const PARTIAL_REF = /\$\{([^}]+)\}/g;

function interp(value, scope) {
  if (typeof value !== "string") return value;
  const full = FULL_REF.exec(value);
  if (full) {
    const key = full[1].trim();
    if (!(key in scope)) throw new Error(`Unknown variable: \${${key}}`);
    return scope[key];
  }
  return value.replace(PARTIAL_REF, (_, key) => {
    const k = key.trim();
    if (!(k in scope)) throw new Error(`Unknown variable: \${${k}}`);
    const v = scope[k];
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  });
}

function interpDeep(value, scope) {
  if (typeof value === "string") return interp(value, scope);
  if (Array.isArray(value)) return value.map(v => interpDeep(v, scope));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, interpDeep(v, scope)]));
  }
  return value;
}

// ── Workflow loading ─────────────────────────────────────────────────────────

export async function loadFlow(name) {
  const candidates = [
    path.join(FLOWS_DIR, `${name}.mjs`),
    path.join(FLOWS_DIR, name, "index.mjs"),
  ];
  const found = candidates.find(p => existsSync(p));
  if (!found) throw new Error(`Flow not found: ${name} (tried ${candidates.join(", ")})`);
  const mod = await import(pathToFileURL(found).href);
  if (!mod.default) throw new Error(`Flow ${name} must default-export a workflow object`);
  return mod.default;
}

export function listFlows() {
  if (!existsSync(FLOWS_DIR)) return [];
  return readdirSync(FLOWS_DIR)
    .filter(f => f.endsWith(".mjs"))
    .map(f => f.replace(/\.mjs$/, ""))
    .sort();
}

// ── Execution ────────────────────────────────────────────────────────────────

function resolveInputs(workflow, cliInputs) {
  const scope = {};
  for (const [key, spec] of Object.entries(workflow.inputs || {})) {
    if (cliInputs[key] !== undefined) {
      scope[key] = cliInputs[key];
    } else if (spec.required) {
      throw new Error(`Missing required input: --${key}`);
    } else if (spec.default !== undefined) {
      scope[key] = typeof spec.default === "function" ? spec.default() : spec.default;
    }
  }
  // Allow extra inputs for ad-hoc variables
  for (const [k, v] of Object.entries(cliInputs)) {
    if (!(k in scope)) scope[k] = v;
  }
  return scope;
}

function dispatchType(step) {
  const types = Object.keys(step).filter(k => k in CONNECTORS);
  if (types.length === 0) throw new Error(`Step "${step.name || "?"}" has no connector key`);
  if (types.length > 1) throw new Error(`Step "${step.name || "?"}" has multiple connector keys: ${types.join(", ")}`);
  return types[0];
}

function fmtElapsed(ms) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export async function runFlow(workflow, cliInputs = {}) {
  const scope = resolveInputs(workflow, cliInputs);
  console.log(`▶ ${workflow.name}`);
  console.log(`  inputs: ${Object.entries(scope).map(([k, v]) => `${k}=${v}`).join("  ")}`);
  console.log();

  const t0 = Date.now();
  const stepResults = [];

  for (let i = 0; i < workflow.steps.length; i++) {
    const raw = workflow.steps[i];
    const stepName = raw.name || `step-${i + 1}`;
    const type = dispatchType(raw);
    const stepStart = Date.now();

    process.stdout.write(`  [${String(i + 1).padStart(2)}/${workflow.steps.length}] ${stepName.padEnd(22)} (${type}) `);

    try {
      const interpolated = {};
      for (const [k, v] of Object.entries(raw)) {
        if (k === "name" || k === "capture") continue;
        interpolated[k] = interpDeep(v, scope);
      }
      const result = await CONNECTORS[type].run(interpolated, { scope });
      const elapsed = Date.now() - stepStart;

      if (raw.capture) {
        scope[raw.capture] = result;
        const preview = typeof result === "string"
          ? `"${result.slice(0, 32).replace(/\n/g, " ")}…"`
          : Array.isArray(result) ? `[${result.length} items]`
          : typeof result === "object" && result !== null ? `{${Object.keys(result).length} keys}`
          : String(result);
        console.log(`✓ ${fmtElapsed(elapsed)}  →  ${raw.capture}=${preview}`);
      } else {
        console.log(`✓ ${fmtElapsed(elapsed)}`);
      }
      stepResults.push({ step: stepName, ok: true, elapsed });
    } catch (err) {
      const elapsed = Date.now() - stepStart;
      console.log(`✗ ${fmtElapsed(elapsed)}`);
      console.log(`     error: ${err.message}`);
      stepResults.push({ step: stepName, ok: false, elapsed, error: err.message });
      throw err;
    }
  }

  const total = Date.now() - t0;
  console.log();
  console.log(`✓ ${workflow.name} complete in ${fmtElapsed(total)}`);
  return { scope, stepResults, totalMs: total };
}
