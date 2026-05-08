/**
 * Load a JSON file containing pills (pain | solution | insight | knowledge).
 * Returns the array as-is, validated minimally.
 *
 * Canonical pill format:
 *   [
 *     { "quote": "actual user text",
 *       "url": "https://...",
 *       "date": "YYYY-MM-DD",            // optional
 *       "community": "r/ClaudeCode",     // optional
 *       "source": "reddit"|"hackernews"|"news"|...,
 *       "note": "why this pill matters"  // optional
 *     }
 *   ]
 *
 * For solutions: replace "quote" with "name" + "description":
 *   [
 *     { "name": "Markplane",
 *       "url": "https://...",
 *       "description": "Project state in repo for AI coding assistants",
 *       "addresses": [1, 3]              // optional pain pill numbers
 *     }
 *   ]
 *
 * Args: { path?: string, kind?: "pain"|"solution"|"insight"|"knowledge" }
 * Returns: { pills: [...], source: "file"|"none" }
 */

import { readFileSync, existsSync } from "node:fs";
import os from "node:os";

export default async function loadPills({ path = "", kind = "pain" } = {}) {
  if (!path) return { pills: [], source: "none" };
  const expanded = path.replace(/^~/, os.homedir());
  if (!existsSync(expanded)) {
    throw new Error(`Pill file not found: ${expanded}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(expanded, "utf-8"));
  } catch (err) {
    throw new Error(`Could not parse JSON in ${expanded}: ${err.message}`);
  }
  const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.pills) ? parsed.pills : null;
  if (!arr) throw new Error(`Pill file must be an array or { pills: [...] }`);

  // Minimal validation per kind
  const requiredFields = kind === "solution" ? ["name", "url"] : ["url"];
  const cleaned = arr.filter(p => p && typeof p === "object" && requiredFields.every(f => p[f]));
  return { pills: cleaned, source: "file", path: expanded, kind };
}
