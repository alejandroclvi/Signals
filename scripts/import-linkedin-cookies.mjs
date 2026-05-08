#!/usr/bin/env node
/**
 * Install a downloaded `linkedin-cookies.json` (from the browser-console
 * extractor) into the linkedin-mcp-server's expected layout, then verify
 * with `linkedin_mcp_server --status`.
 *
 * Layout the MCP expects:
 *   ~/.linkedin-mcp/cookies.json        — the Playwright cookies array
 *   ~/.linkedin-mcp/source_state.json   — session metadata
 *   ~/.linkedin-mcp/profile/            — Chromium user-data-dir (must exist + non-empty)
 *
 * This script writes all three so the MCP considers the session valid.
 *
 * Usage:
 *   node scripts/import-linkedin-cookies.mjs <path-to-cookies.json>
 *   node scripts/import-linkedin-cookies.mjs ~/Downloads/linkedin-cookies.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const HOME = os.homedir();
const ROOT = path.join(HOME, ".linkedin-mcp");
const PROFILE_DIR = path.join(ROOT, "profile");
const COOKIES_PATH = path.join(ROOT, "cookies.json");
const STATE_PATH = path.join(ROOT, "source_state.json");

const args = process.argv.slice(2);
if (!args[0]) {
  console.error("Usage: node scripts/import-linkedin-cookies.mjs <path-to-cookies.json>");
  process.exit(1);
}
const inputPath = args[0].replace(/^~/, HOME);
if (!existsSync(inputPath)) {
  console.error(`File not found: ${inputPath}`);
  process.exit(1);
}

let raw;
try {
  raw = JSON.parse(readFileSync(inputPath, "utf-8"));
} catch (err) {
  console.error(`Could not parse JSON: ${err.message}`);
  process.exit(1);
}

const cookies = Array.isArray(raw)
  ? raw
  : Array.isArray(raw?.cookies)
    ? raw.cookies
    : null;
if (!cookies) {
  console.error("Expected an array of cookies, or { cookies: [...] }. Got:", typeof raw);
  process.exit(1);
}

const liAt = cookies.find(c => c.name === "li_at");
if (!liAt || !liAt.value) {
  console.error('Required cookie "li_at" missing from input. Re-run the browser extractor.');
  process.exit(1);
}

// Normalize: ensure required Playwright fields are present
const normalized = cookies.map(c => ({
  name: String(c.name),
  value: String(c.value),
  domain: c.domain || ".linkedin.com",
  path: c.path || "/",
  expires: typeof c.expires === "number" ? c.expires : Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
  httpOnly: c.httpOnly === true,
  secure: c.secure !== false,  // default true for linkedin.com
  sameSite: ["Strict", "Lax", "None"].includes(c.sameSite) ? c.sameSite : "None",
}));

mkdirSync(ROOT, { recursive: true });
mkdirSync(PROFILE_DIR, { recursive: true });

// 1) cookies.json
writeFileSync(COOKIES_PATH, JSON.stringify(normalized, null, 2) + "\n");
console.log(`✓ wrote ${normalized.length} cookies → ${COOKIES_PATH}`);
console.log(`  li_at length: ${liAt.value.length}`);

// 2) source_state.json (matches SourceState dataclass shape)
const arch = process.arch === "arm64" ? "arm64" : "x86_64";
const runtimeId = `macos-${arch}-host`;
const state = {
  version: 1,
  source_runtime_id: runtimeId,
  login_generation: randomUUID(),
  created_at: new Date().toISOString(),
  profile_path: PROFILE_DIR,
  cookies_path: COOKIES_PATH,
};
writeFileSync(STATE_PATH, JSON.stringify(state, Object.keys(state).sort(), 2) + "\n");
console.log(`✓ wrote source_state.json → ${STATE_PATH}`);
console.log(`  runtime_id: ${runtimeId}`);

// 3) profile/ must exist and be non-empty for the MCP's profile_exists() check.
// Drop a placeholder. Patchright will populate the dir on its first launch.
const placeholder = path.join(PROFILE_DIR, ".imported-via-cookie-injection");
writeFileSync(placeholder, `Imported ${new Date().toISOString()}\n`);
const dirEntries = readdirSync(PROFILE_DIR);
console.log(`✓ profile dir present (${dirEntries.length} entries)`);

console.log("");
console.log("Verifying with: uv run -m linkedin_mcp_server --status");
console.log("");

// 4) verify with --status
const proc = spawn(
  "uv",
  ["run", "-m", "linkedin_mcp_server", "--status"],
  { cwd: "/Users/manuel/Dev/linkedin/linkedin-mcp-server", stdio: "inherit" }
);
proc.on("exit", code => {
  console.log("");
  if (code === 0) {
    console.log("Session is valid. Run the radar now:");
    console.log("  pnpm flow run linkedin-engagement-radar --signalId live:cost-management --context claude-code-knowledge-gap");
  } else {
    console.log("--status returned non-zero. The session may not be accepted.");
    console.log("Common causes:");
    console.log("  - li_at value truncated (was the input quoted? expected ~280+ chars)");
    console.log("  - LinkedIn invalidated the cookie because the user-agent doesn't match");
    console.log("  - profile/ dir is too sparse — Patchright may need to populate it on first launch");
    console.log("  - re-export cookies from your real Chrome and try again");
  }
  process.exit(code ?? 1);
});
