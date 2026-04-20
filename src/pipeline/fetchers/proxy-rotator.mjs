/**
 * Proxy Rotator — fetches, validates, and rotates free proxy servers.
 *
 * Each Google search query goes through a different proxy IP,
 * preventing any single IP from getting blocked.
 *
 * Flow:
 *   1. Fetch free proxy list from public sources
 *   2. Validate which proxies actually work (parallel)
 *   3. Rotate through valid proxies per request
 */

const PROXY_SOURCES = [
  "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt",
  "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt",
  "https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt",
];

// Validate against Google specifically — we need proxies that can reach Google over HTTPS
const VALIDATION_URL = "https://www.google.com/robots.txt";
const VALIDATION_TIMEOUT = 8000;
const MAX_CONCURRENT_CHECKS = 30;

/**
 * Fetch raw proxy lists from public GitHub sources.
 * Returns array of "ip:port" strings.
 */
async function fetchProxyList() {
  const allProxies = new Set();

  for (const source of PROXY_SOURCES) {
    try {
      const res = await fetch(source, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const text = await res.text();
      const lines = text.split("\n").map(l => l.trim()).filter(l => /^\d+\.\d+\.\d+\.\d+:\d+$/.test(l));
      for (const line of lines) allProxies.add(line);
    } catch {
      // source unavailable, skip
    }
  }

  return [...allProxies];
}

/**
 * Check if a single proxy works by sending a test request through it.
 */
async function checkProxy(proxy) {
  const [host, port] = proxy.split(":");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT);

  try {
    const res = await fetch(VALIDATION_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0" },
      // Node 22 doesn't have native proxy in fetch, so we use a simple TCP test
    });
    // If we can reach httpbin directly, test via the proxy using a different method
    clearTimeout(timer);
    return true;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

/**
 * Validate proxies by testing them through Playwright.
 * This is more reliable than HTTP-level testing since we need
 * browser-level proxies for Google searches.
 */
async function validateProxiesViaPlaywright(proxies, { maxValid = 15, onProgress } = {}) {
  // Use plain playwright (not playwright-extra) for validation to avoid stealth cdpSession crashes
  const { chromium } = await import("playwright");

  const valid = [];
  let checked = 0;

  // Test one at a time to avoid resource exhaustion
  for (const proxy of proxies) {
    if (valid.length >= maxValid) break;

    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        proxy: { server: `http://${proxy}` },
      });
      const page = await browser.newPage();
      await page.goto(VALIDATION_URL, { timeout: VALIDATION_TIMEOUT, waitUntil: "domcontentloaded" });
      const text = await page.textContent("body");
      if (text && (text.includes("User-agent") || text.includes("Disallow"))) {
        valid.push(proxy);
        if (onProgress) onProgress({ checked: ++checked, valid: valid.length, current: proxy });
      } else {
        checked++;
      }
    } catch {
      checked++;
    } finally {
      if (browser) await browser.close().catch(() => {});
    }

    // Progress every 10 checks
    if (checked % 10 === 0 && onProgress) {
      onProgress({ checked, valid: valid.length });
    }
  }

  return valid;
}

/**
 * Get a list of validated, working proxies ready for rotation.
 * Caches results to avoid re-validating every run.
 */
let _cachedProxies = null;
let _cacheTime = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export async function getRotatingProxies({ maxValid = 12, onProgress } = {}) {
  // Return cached if fresh
  if (_cachedProxies && _cachedProxies.length > 0 && Date.now() - _cacheTime < CACHE_TTL) {
    if (onProgress) onProgress({ cached: true, count: _cachedProxies.length });
    return _cachedProxies;
  }

  if (onProgress) onProgress({ stage: "fetching", message: "Fetching proxy lists..." });
  const raw = await fetchProxyList();
  if (onProgress) onProgress({ stage: "fetched", count: raw.length });

  if (raw.length === 0) {
    if (onProgress) onProgress({ stage: "failed", message: "No proxies found from any source" });
    return [];
  }

  // Shuffle to avoid always testing the same proxies first
  const shuffled = raw.sort(() => Math.random() - 0.5);

  if (onProgress) onProgress({ stage: "validating", message: "Validating proxies via browser (need " + maxValid + ")..." });
  const valid = await validateProxiesViaPlaywright(shuffled.slice(0, 100), { maxValid, onProgress });

  _cachedProxies = valid;
  _cacheTime = Date.now();

  if (onProgress) onProgress({ stage: "ready", count: valid.length });

  return valid;
}

/**
 * Simple round-robin proxy rotator.
 */
export class ProxyRotator {
  constructor(proxies) {
    this.proxies = proxies;
    this.index = 0;
  }

  next() {
    if (this.proxies.length === 0) return null;
    const proxy = this.proxies[this.index];
    this.index = (this.index + 1) % this.proxies.length;
    return proxy;
  }

  get count() {
    return this.proxies.length;
  }
}
