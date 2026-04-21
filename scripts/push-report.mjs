#!/usr/bin/env node

/**
 * Push an intelligence report to the dashboard via SSE.
 *
 * Usage:
 *   # Generate and push a research brief as a report:
 *   node scripts/push-report.mjs --context market-blindness
 *
 *   # Push a custom message:
 *   node scripts/push-report.mjs --title "Custom Report" --body "## Content here"
 *
 *   # Push a toast only:
 *   node scripts/push-report.mjs --toast "Analysis complete"
 *
 *   # Trigger reload:
 *   node scripts/push-report.mjs --reload
 */

import "../src/db/migrate.mjs";
import { generateBriefFromIntelligence } from "../src/agents/research-brief.mjs";

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf("--" + name);
  if (idx === -1) return null;
  return args[idx + 1];
}

function hasFlag(name) {
  return args.includes("--" + name);
}

const BASE = process.env.SIGNALS_URL || "http://localhost:3000";

async function pushToast(message, type = "info") {
  const res = await fetch(`${BASE}/api/toast`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, type }),
  });
  const data = await res.json();
  console.log(`Toast sent to ${data.clients} client(s): "${message}"`);
}

async function pushReport(title, body, format = "markdown") {
  const res = await fetch(`${BASE}/api/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, body, format }),
  });
  const data = await res.json();
  console.log(`Report pushed to ${data.clients} client(s): "${title}"`);
}

async function pushReload(reason) {
  const res = await fetch(`${BASE}/api/reload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  const data = await res.json();
  console.log(`Reload triggered for ${data.clients} client(s)`);
}

async function main() {
  const contextId = getArg("context");
  const title = getArg("title");
  const body = getArg("body");
  const toast = getArg("toast");
  const reload = hasFlag("reload");

  if (toast) {
    await pushToast(toast);
    return;
  }

  if (reload) {
    await pushReload("manual trigger");
    return;
  }

  if (contextId) {
    // Generate brief from evidence and push as report
    await pushToast("Generating intelligence report...");

    const result = await generateBriefFromIntelligence(contextId);

    await pushReport(
      `Research Brief: ${contextId}`,
      result.content,
      "markdown"
    );

    await pushReload("research brief generated");
    console.log(`\nBrief generated (${result.evidenceCount} packets, ${result.communityCount} communities)`);
    return;
  }

  if (title && body) {
    await pushReport(title, body);
    return;
  }

  console.error("Usage:");
  console.error("  node scripts/push-report.mjs --context <id>     # Generate + push research brief");
  console.error("  node scripts/push-report.mjs --toast 'message'  # Push toast notification");
  console.error("  node scripts/push-report.mjs --reload           # Trigger data reload");
  console.error("  node scripts/push-report.mjs --title 'X' --body '## markdown'  # Push custom report");
  process.exit(1);
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
