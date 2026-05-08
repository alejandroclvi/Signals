/**
 * Open a list of URLs as tabs in the macOS default browser.
 * Each call is `open -g <url>` (background, doesn't steal focus on first; -g
 * after the first prevents constant focus-stealing).
 *
 * Args: { urls: string[], cap?=10, dryRun?=false }
 * Returns: { opened: number, skipped: number }
 */

import { spawn } from "node:child_process";

function openOne(url, background) {
  return new Promise(resolve => {
    const args = background ? ["-g", url] : [url];
    const proc = spawn("open", args, { stdio: "ignore" });
    proc.on("exit", () => resolve());
    proc.on("error", () => resolve());
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export default async function openTabs({ urls = [], cap = 10, dryRun = false } = {}) {
  // Accept urls as plain strings OR objects with .post_url / .url
  const list = (Array.isArray(urls) ? urls : [])
    .map(u => {
      if (typeof u === "string") return u;
      if (u && typeof u === "object") return u.post_url || u.url || null;
      return null;
    })
    .filter(u => typeof u === "string" && u.startsWith("http"));
  const limited = list.slice(0, cap);
  if (dryRun) {
    return { opened: 0, skipped: list.length, dryRun: true, would_open: limited };
  }
  // First tab brings focus, the rest open in background to avoid window thrashing
  for (let i = 0; i < limited.length; i++) {
    await openOne(limited[i], i > 0);
    await sleep(150);
  }
  return { opened: limited.length, skipped: Math.max(0, list.length - cap) };
}
