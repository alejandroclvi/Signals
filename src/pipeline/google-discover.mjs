/**
 * Google Discovery — searches Google with visible Playwright browser
 * to find Reddit threads. Reusable from API or CLI.
 *
 * Opens a visible Chrome window. User solves CAPTCHA once (if needed),
 * then the script runs all queries automatically.
 *
 * Returns discovered thread URLs.
 */

import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

/**
 * Discover Reddit threads via Google search.
 *
 * @param {Object} options
 * @param {string[]} options.queries - Search queries
 * @param {string} options.contextId - Context ID (for saving results)
 * @param {number} options.limit - Results per query (default 10)
 * @param {function} options.onProgress - Progress callback
 * @returns {Promise<{threads: object[], communities: object}>}
 */
export async function discoverRedditThreads({ queries, contextId, limit = 10, onProgress }) {
  const userDataDir = path.resolve("data", "browser-state");

  // Ensure dir exists
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

  const browserContext = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });

  const page = browserContext.pages()[0] || await browserContext.newPage();

  // Navigate to Google
  await page.goto("https://www.google.com", { waitUntil: "networkidle", timeout: 30000 });

  // Accept cookies
  try { await page.click('[id="L2AGLb"], button:has-text("Accept all")', { timeout: 3000 }); } catch {}

  // Wait for search box (confirms past CAPTCHA)
  try {
    await page.waitForSelector('textarea[name="q"], input[name="q"]', { timeout: 60000 });
  } catch {
    // CAPTCHA — wait for user to solve it
    if (onProgress) onProgress({ stage: "captcha", message: "Solve CAPTCHA in the browser window" });
    // Wait up to 2 minutes for the search box to appear
    await page.waitForSelector('textarea[name="q"], input[name="q"]', { timeout: 120000 });
  }

  if (onProgress) onProgress({ stage: "ready", message: "Google ready, starting discovery" });

  const allResults = [];

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const searchQuery = `${query} site:reddit.com`;

    if (onProgress) onProgress({ stage: "search", message: `[${i + 1}/${queries.length}] "${query.slice(0, 50)}"`, index: i, total: queries.length });

    try {
      await page.goto(
        `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=${limit}`,
        { waitUntil: "domcontentloaded", timeout: 15000 }
      );

      // Check for CAPTCHA
      const title = await page.title();
      if (title.includes("sorry") || title.startsWith("http") || title.includes("unusual")) {
        if (onProgress) onProgress({ stage: "captcha", message: "CAPTCHA detected — solve it in the browser" });
        await page.waitForSelector('textarea[name="q"], input[name="q"]', { timeout: 120000 });
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
          const titleText = h3.textContent.trim();
          if (!items.some(i => i.url === url)) {
            items.push({ url, title: titleText });
          }
        }
        return items;
      });

      for (const r of results) {
        r.query = query;
        r.subreddit = r.url.match(/reddit\.com\/r\/([^/]+)/)?.[1] || "unknown";
      }

      allResults.push(...results);

      if (onProgress) onProgress({
        stage: "result",
        message: `${results.length} threads found`,
        communities: results.map(r => "r/" + r.subreddit),
        index: i,
      });

      await page.waitForTimeout(2000 + Math.random() * 2000);
    } catch (err) {
      if (onProgress) onProgress({ stage: "error", message: err.message?.slice(0, 60), index: i });
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

  // Save to file
  if (contextId) {
    const dataDir = path.resolve("data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const outPath = path.resolve(dataDir, `discovered-${contextId}.json`);
    fs.writeFileSync(outPath, JSON.stringify(deduped, null, 2));
  }

  // Community counts
  const communities = {};
  for (const r of deduped) {
    communities["r/" + r.subreddit] = (communities["r/" + r.subreddit] || 0) + 1;
  }

  return { threads: deduped, communities, duplicatesRemoved: allResults.length - deduped.length };
}
