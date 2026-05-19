/**
 * Google Search producer — Intent layer.
 *
 * Captures the top organic results Google returns for each context query.
 * Each result becomes one evidence packet: title + snippet + URL + position.
 *
 * Intent signal: what content is competing to satisfy these queries, and
 * how recent / authoritative the surface is. Result diversity = demand
 * breadth; result freshness = recency of intent.
 *
 * Uses Playwright with persistent browser state (data/browser-state) — the
 * same store used by discover-reddit-threads.mjs, so a CAPTCHA solved once
 * stays solved for subsequent runs. Headless: false by default so a human
 * can solve any new challenges in-window.
 *
 * Polite delay between queries (~2–4s, jittered). The producer is async
 * but Playwright pages are sequential within a single browser context.
 *
 * NOTE: This producer requires an open display (cannot run on a headless
 * server without further configuration). For CI-only runs, refactor with
 * { headless: true } once the Google session cookie is warm.
 */

import path from "node:path";
import { existsSync } from "node:fs";
import crypto from "node:crypto";

const USER_DATA_DIR = path.resolve("data", "browser-state");
const RESULTS_PER_QUERY_DEFAULT = 10;
const DELAY_MIN = 2000;
const DELAY_MAX = 4500;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function jitter(min, max) { return min + Math.floor(Math.random() * (max - min)); }

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return "unknown"; }
}

function stableId(s) {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
}

function calibrateWeight(position) {
  // Result-position weight. Position 1 ≈ 2.0, top-3 ≈ 1.5+, decay to 0.6 by position 10.
  if (position <= 1) return 2.0;
  if (position <= 3) return 1.5;
  if (position <= 5) return 1.2;
  if (position <= 8) return 0.9;
  return 0.6;
}

function normalizeResult({ position, title, url, snippet, query }, contextId) {
  const domain = domainOf(url);
  const sid = stableId(query + "::" + url);
  return {
    id: `google:${sid}`,
    context_id: contextId,
    source_id: "google",
    source_kind: "search_result",
    source_layer: "intent",
    source_item_id: `g_${sid}`,
    url,
    title: title || "(no title)",
    body: snippet || "",
    author_ref: `domain:${domain}`,
    community: `google:${domain}`,
    observed_at: new Date().toISOString(),
    published_at: new Date().toISOString(), // Google rarely surfaces a parseable date
    metrics: JSON.stringify({ position, domain, query, source: "google" }),
    topics: JSON.stringify([query]),
    raw_ref: JSON.stringify({ position, domain }),
    content_hash: null,
    intent: null,
    awareness_level: null,
    evidence_weight: calibrateWeight(position),
    quality_score: null,
    sentiment: null,
    evidence_state: null,
  };
}

async function importPlaywright() {
  try {
    const mod = await import("playwright");
    return mod.chromium;
  } catch (err) {
    throw new Error("Playwright not installed or unavailable. Run `pnpm install` and `npx playwright install chromium`.");
  }
}

async function runSearches({ queries, resultsPerQuery, afterDate, beforeDate, headless }) {
  const chromium = await importPlaywright();
  const browserContext = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless,
    args: ["--disable-blink-features=AutomationControlled"],
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });
  const page = browserContext.pages()[0] || await browserContext.newPage();

  // Warm up — go to Google home so any CAPTCHA challenge surfaces before
  // we hammer it with N queries.
  try {
    await page.goto("https://www.google.com", { waitUntil: "networkidle", timeout: 30000 });
    try { await page.click('[id="L2AGLb"], button:has-text("Accept all")', { timeout: 3000 }); } catch {}
    await page.waitForSelector('textarea[name="q"], input[name="q"]', { timeout: 30000 });
  } catch (err) {
    // If headless and no search box, browser-state probably needs a one-time
    // human-solve session.
    if (headless) {
      await browserContext.close();
      throw new Error("Google home not ready in headless mode. Run once with headless=false to warm browser-state.");
    }
  }

  const all = [];
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    let searchQuery = q;
    if (afterDate)  searchQuery += ` after:${afterDate}`;
    if (beforeDate) searchQuery += ` before:${beforeDate}`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=${Math.min(resultsPerQuery, 30)}`;

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });

      // CAPTCHA check — same pattern as discover-reddit-threads.mjs
      const title = await page.title();
      if (title.includes("sorry") || title.includes("unusual")) {
        if (headless) throw new Error(`CAPTCHA in headless mode (query: "${q}"). Re-run with headless=false.`);
        console.log(`[google] CAPTCHA at query ${i + 1}/${queries.length} — solve in browser, then press Enter…`);
        await new Promise(r => process.stdin.once("data", r));
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      }

      const results = await page.evaluate(() => {
        const out = [];
        // Google result blocks have evolved; this selector hits the standard organic results
        // while avoiding "People also ask", featured snippets, knowledge panels.
        const blocks = document.querySelectorAll("div.g, div[data-hveid][data-ved] > div > div > div");
        let position = 0;
        const seen = new Set();
        for (const block of blocks) {
          const link = block.querySelector("a[href]:not([href*='google.com/search'])");
          const h3   = block.querySelector("h3");
          if (!link || !h3) continue;
          const href = (link.href || "").split("#")[0];
          if (!href || seen.has(href)) continue;
          seen.add(href);
          const title = h3.textContent.trim();
          // Snippet — multiple possible containers; pick the longest reasonable one.
          let snippet = "";
          for (const sel of ['div[data-sncf="1"]', 'div[style*="-webkit-line-clamp"]', 'span.aCOpRe', 'div.VwiC3b']) {
            const el = block.querySelector(sel);
            if (el && el.textContent.trim().length > snippet.length) snippet = el.textContent.trim();
          }
          position += 1;
          out.push({ position, title, url: href, snippet });
          if (position >= 15) break;
        }
        return out;
      });

      for (const r of results.slice(0, resultsPerQuery)) {
        all.push({ ...r, query: q });
      }
    } catch (err) {
      console.error(`[google] query "${q}" failed: ${err.message?.slice(0, 100)}`);
    }

    await sleep(jitter(DELAY_MIN, DELAY_MAX));
  }

  await browserContext.close();
  return all;
}

/**
 * Producer interface — search mode.
 *
 * opts:
 *   contextId    required
 *   queries      required array
 *   limit        results per query (default 10)
 *   afterDate    ISO date string, appended as `after:YYYY-MM-DD` to query
 *   beforeDate   ISO date string, appended as `before:YYYY-MM-DD`
 *   headless     default false (need human-solvable CAPTCHA path)
 */
export const google = {
  id: "google",
  layer: "intent",
  kind: "search",
  async search({ contextId, queries, limit, afterDate, beforeDate, headless = false }) {
    if (!contextId) throw new Error("contextId required");
    if (!existsSync(USER_DATA_DIR)) {
      console.warn(`[google] persistent state ${USER_DATA_DIR} not found — first run will need CAPTCHA solve.`);
    }
    const resultsPerQuery = Math.max(3, Math.min(limit ?? RESULTS_PER_QUERY_DEFAULT, 30));
    const raw = await runSearches({ queries, resultsPerQuery, afterDate, beforeDate, headless });
    return raw.map(r => normalizeResult(r, contextId));
  },
};
