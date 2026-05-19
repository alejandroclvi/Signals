#!/usr/bin/env node
/**
 * pnpm stop — find and stop the Signals dev server.
 *
 * Looks for a node process bound to PORT (default 3000) and sends SIGTERM.
 * Use this if you forgot which terminal you started `pnpm dev` in.
 */

import { execSync } from "node:child_process";

const PORT = process.env.PORT || "3000";

let pids = [];
try {
  const out = execSync(`lsof -ti tcp:${PORT}`, { encoding: "utf8" }).trim();
  if (out) pids = out.split("\n").filter(Boolean);
} catch {
  // lsof returns non-zero when nothing is listening — that's fine
}

if (!pids.length) {
  console.log(`No process listening on port ${PORT}.`);
  process.exit(0);
}

for (const pid of pids) {
  try {
    process.kill(parseInt(pid, 10), "SIGTERM");
    console.log(`✓ Stopped pid ${pid} (port ${PORT}).`);
  } catch (e) {
    console.error(`✗ Failed to kill pid ${pid}: ${e.message}`);
  }
}
