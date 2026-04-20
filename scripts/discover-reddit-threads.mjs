#!/usr/bin/env node

/**
 * Reddit Thread Discovery via Google Search.
 *
 * Opens a visible browser window. If Google shows a CAPTCHA, solve it once.
 * Then the script runs all pain queries and saves discovered Reddit URLs.
 *
 * Usage:
 *   node scripts/discover-reddit-threads.mjs --context market-blindness
 *   node scripts/discover-reddit-threads.mjs --context market-blindness --limit 10
 *
 * Output: writes discovered URLs to data/discovered-{contextId}.json
 *         then you can run ingest to fetch those threads.
 */

import { chromium } from "playwright";
import { getDb } from "../src/db/connection.mjs";
import "../src/db/migrate.mjs";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
function flag(name) {
  const idx = args.indexOf("--" + name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const contextId = flag("context");
if (!contextId) {
  console.error("Usage: node scripts/discover-reddit-threads.mjs --context <context-id> [--limit N]");
  process.exit(1);
}

const limit = parseInt(flag("limit") || "10", 10);

const db = getDb();
const context = db.prepare("SELECT * FROM contexts WHERE id = ?").get(contextId);
if (!context) {
  console.error("Context not found: " + contextId);
  process.exit(1);
}

const queries = JSON.parse(context.queries || "[]");
if (!queries.length) {
  console.error("Context has no queries");
  process.exit(1);
}

console.log(`\nDiscovering Reddit threads for "${context.label}" (${queries.length} queries, ${limit} results each)\n`);
console.log("A browser window will open. If Google shows a CAPTCHA, solve it.");
console.log("After that, the script will run all queries automatically.\n");

// Launch visible browser with persistent state
const userDataDir = path.resolve("data", "browser-state");
const browserContext = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: ["--disable-blink-features=AutomationControlled"],
  viewport: { width: 1280, height: 800 },
  locale: "en-US",
});

const page = browserContext.pages()[0] || await browserContext.newPage();

// Go to Google first — let user solve CAPTCHA if needed
await page.goto("https://www.google.com", { waitUntil: "networkidle", timeout: 30000 });

// Accept cookies if shown
try { await page.click('[id="L2AGLb"], button:has-text("Accept all")', { timeout: 3000 }); } catch {}

// Wait for search box to be available (confirms we're past any CAPTCHA)
console.log("Waiting for Google to be ready...");
try {
  await page.waitForSelector('textarea[name="q"], input[name="q"]', { timeout: 60000 });
  console.log("Google is ready. Starting discovery.\n");
} catch {
  console.log("\nCould not detect Google search box. Please solve the CAPTCHA in the browser window.");
  console.log("Press Enter here when done...");
  await new Promise(resolve => {
    process.stdin.once("data", resolve);
  });
}

const allResults = [];

for (let i = 0; i < queries.length; i++) {
  const query = queries[i];
  const searchQuery = `${query} site:reddit.com`;

  process.stdout.write(`[${i + 1}/${queries.length}] "${query.slice(0, 55)}" `);

  try {
    await page.goto(
      `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=${limit}`,
      { waitUntil: "domcontentloaded", timeout: 15000 }
    );

    // Check for CAPTCHA
    const title = await page.title();
    if (title.includes("sorry") || title.startsWith("http") || title.includes("unusual")) {
      console.log("→ CAPTCHA! Solve it in the browser, then press Enter...");
      await new Promise(resolve => process.stdin.once("data", resolve));
      // Retry the search
      await page.goto(
        `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=${limit}`,
        { waitUntil: "domcontentloaded", timeout: 15000 }
      );
    }

    // Extract Reddit links
    const results = await page.evaluate(() => {
      const items = [];
      for (const link of document.querySelectorAll("a[href]")) {
        const href = link.href || "";
        if (!href.includes("reddit.com/r/") || !href.includes("/comments/")) continue;
        if (href.includes("google.com")) continue;
        const h3 = link.querySelector("h3");
        if (!h3) continue;
        const url = href.split("?")[0].split("#")[0];
        const title = h3.textContent.trim();
        if (!items.some(i => i.url === url)) {
          items.push({ url, title });
        }
      }
      return items;
    });

    for (const r of results) {
      r.query = query;
      r.subreddit = r.url.match(/reddit\.com\/r\/([^/]+)/)?.[1] || "unknown";
    }

    allResults.push(...results);
    console.log(`→ ${results.length} threads (${results.map(r => "r/" + r.subreddit).join(", ") || "none"})`);

    // Polite delay between searches
    await page.waitForTimeout(2000 + Math.random() * 2000);

  } catch (err) {
    console.log(`→ ERROR: ${err.message?.slice(0, 60)}`);
  }
}

await browserContext.close();

// Deduplicate
const seen = new Set();
const deduped = allResults.filter(r => {
  if (seen.has(r.url)) return false;
  seen.add(r.url);
  return true;
});

// Save results
const outPath = path.resolve("data", `discovered-${contextId}.json`);
fs.writeFileSync(outPath, JSON.stringify(deduped, null, 2));

// Summary
const communities = {};
for (const r of deduped) {
  communities[r.subreddit] = (communities[r.subreddit] || 0) + 1;
}

console.log(`\n${"=".repeat(60)}`);
console.log(`Discovered ${deduped.length} unique Reddit threads (${allResults.length - deduped.length} duplicates removed)`);
console.log(`\nCommunities found:`);
Object.entries(communities).sort((a, b) => b[1] - a[1]).forEach(([sub, count]) => {
  console.log(`  r/${sub}: ${count}`);
});
console.log(`\nSaved to: ${outPath}`);
console.log(`\nNext step: node scripts/ingest-discovered.mjs --context ${contextId}`);
