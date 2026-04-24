/**
 * Google Discovery Fetcher — searches Google for Reddit threads using
 * Playwright stealth + proxy rotation.
 *
 * Each search query goes through a different proxy IP to avoid blocking.
 * Uses playwright-extra with stealth plugin to appear as a real browser.
 *
 * Flow:
 *   pain phrases → Google (site:reddit.com) via rotating proxies → Reddit URLs
 */

import { getRotatingProxies, ProxyRotator } from "./proxy-rotator.mjs";

const SEARCH_DELAY_MS = 3000;

/**
 * Search Google for Reddit threads matching pain phrases.
 * Returns array of { url, title, snippet, query, subreddit }.
 */
export async function discoverRedditThreads(queries, { onProgress, resultsPerQuery, afterDate, beforeDate } = {}) {
  const limit = resultsPerQuery || 10;

  // Step 1: Get validated proxies
  if (onProgress) onProgress({ stage: "proxies", message: "Finding working proxies..." });
  const proxies = await getRotatingProxies({
    maxValid: Math.min(queries.length + 2, 15),
    onProgress: (info) => {
      if (onProgress && info.stage) onProgress({ stage: "proxies", message: info.message || info.stage + " — " + (info.count || info.valid || 0) });
    },
  });

  if (proxies.length === 0) {
    if (onProgress) onProgress({ stage: "proxies", message: "No working proxies found. Trying direct connection..." });
  }

  const rotator = new ProxyRotator(proxies);

  // Step 2: Search Google for each pain phrase
  const { chromium } = await import("playwright-extra");
  const StealthPlugin = (await import("puppeteer-extra-plugin-stealth")).default;
  chromium.use(StealthPlugin());

  const allResults = [];

  for (const query of queries) {
    const proxy = rotator.next();
    let browser;

    try {
      const launchOpts = {
        headless: true,
        args: ["--disable-blink-features=AutomationControlled"],
      };
      if (proxy) launchOpts.proxy = { server: `http://${proxy}` };

      browser = await chromium.launch(launchOpts);
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        locale: "en-US",
        timezoneId: "America/New_York",
      });
      const page = await ctx.newPage();

      let searchQuery = query.includes("site:reddit.com") ? query : `${query} site:reddit.com`;
      if (afterDate) searchQuery += ` after:${afterDate}`;
      if (beforeDate) searchQuery += ` before:${beforeDate}`;
      const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=${limit}`;

      await page.goto(googleUrl, { waitUntil: "domcontentloaded", timeout: 15000 });

      // Check if we got real results or a CAPTCHA/sorry page
      const pageTitle = await page.title();
      const isCaptcha = pageTitle.includes("sorry") || pageTitle.includes("unusual traffic") ||
                        pageTitle.startsWith("http") || pageTitle.includes("Before you continue");

      if (isCaptcha) {
        if (onProgress) onProgress({ query, found: 0, error: "CAPTCHA/blocked (proxy: " + (proxy || "direct") + ")" });
        await browser.close();
        continue;
      }

      // Extract Reddit thread links
      const results = await page.evaluate(() => {
        const items = [];
        const links = document.querySelectorAll("a[href]");
        for (const link of links) {
          const href = link.href || "";
          if (!href.includes("reddit.com/r/") || !href.includes("/comments/")) continue;
          if (href.includes("google.com")) continue;

          const h3 = link.querySelector("h3");
          const title = h3 ? h3.textContent.trim() : "";
          if (!title) continue;

          const container = link.closest(".g") || link.parentElement?.parentElement?.parentElement;
          const snippetEl = container?.querySelector(".VwiC3b, [data-sncf]");
          const snippet = snippetEl ? snippetEl.textContent.trim() : "";

          items.push({ url: href.split("?")[0].split("#")[0], title, snippet: snippet.slice(0, 300) });
        }

        const seen = new Set();
        return items.filter(item => {
          if (seen.has(item.url)) return false;
          seen.add(item.url);
          return true;
        });
      });

      for (const r of results) {
        r.query = query;
        const match = r.url.match(/reddit\.com\/r\/([^/]+)/);
        r.subreddit = match ? match[1] : "unknown";
      }

      allResults.push(...results);
      if (onProgress) onProgress({ query, found: results.length, proxy: proxy || "direct" });

    } catch (err) {
      if (onProgress) onProgress({ query, found: 0, error: err.message?.slice(0, 80), proxy: proxy || "direct" });
    } finally {
      if (browser) await browser.close().catch(() => {});
    }

    await new Promise(r => setTimeout(r, SEARCH_DELAY_MS));
  }

  // Deduplicate across queries
  const seen = new Set();
  const deduped = allResults.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  if (onProgress) onProgress({ stage: "discovery-complete", total: deduped.length, duplicatesRemoved: allResults.length - deduped.length });

  return deduped;
}

/**
 * Convert a Reddit thread URL to its JSON API endpoint.
 */
export function redditJsonUrl(threadUrl) {
  let clean = threadUrl.replace(/\/$/, "");
  if (!clean.endsWith(".json")) clean += ".json";
  return clean + "?raw_json=1&limit=20&depth=1";
}
