#!/usr/bin/env node
/**
 * pnpm flow run <name> [--key value ...]    — run a workflow
 * pnpm flow list                             — list available workflows
 *
 * CLI keys parse as strings; `--limit 5` becomes { limit: "5" }. Workflows
 * coerce types as needed in their `inputs` / step args.
 */

import "../src/lib/env.mjs";
import { runFlow, loadFlow, listFlows } from "../src/flows/runner.mjs";

function parseCli(argv) {
  const [, , cmd, name, ...rest] = argv;
  const inputs = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith("--")) {
      inputs[key] = true;
    } else {
      inputs[key] = next;
      i++;
    }
  }
  return { cmd, name, inputs };
}

async function main() {
  const { cmd, name, inputs } = parseCli(process.argv);

  if (cmd === "list" || (!cmd && !name)) {
    const flows = listFlows();
    console.log("Available flows:");
    for (const f of flows) console.log("  " + f);
    return;
  }

  if (cmd === "run") {
    if (!name) { console.error("Usage: pnpm flow run <name> [--key value ...]"); process.exit(1); }
    const flow = await loadFlow(name);
    await runFlow(flow, inputs);
    return;
  }

  console.error(`Unknown command: ${cmd}. Use "list" or "run".`);
  process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
