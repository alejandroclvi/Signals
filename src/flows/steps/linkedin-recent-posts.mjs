/**
 * For a list of LinkedIn profile slugs, call `get_person_profile` with the
 * `posts` section to extract recent post URLs + body excerpts.
 *
 * Args: { profiles: [{slug, name, url, source_keyword?}], maxScrolls?=5 }
 * Returns: { posts: [{ author_name, author_slug, post_url, snippet }] }
 *
 * Each profile call is rate-limited (~3s gap) to avoid LinkedIn's automation
 * heuristics. The tool's first call may return setup-in-progress until
 * Patchright finishes downloading.
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const CLAUDE_CONFIG = path.join(os.homedir(), ".claude.json");
const APP_ENV_PREFIXES = ["NEO4J_", "OPENROUTER_", "SIGNALS_"];

function buildEnv(server) {
  const base = { ...process.env };
  const explicit = new Set(Object.keys(server.env || {}));
  for (const k of Object.keys(base)) {
    if (APP_ENV_PREFIXES.some(p => k.startsWith(p)) && !explicit.has(k)) delete base[k];
  }
  return { ...base, ...(server.env || {}) };
}

class StdioMcpClient {
  constructor(server, timeoutMs = 90000) {
    this.timeoutMs = timeoutMs;
    this.proc = spawn(server.command, server.args || [], { env: buildEnv(server), stdio: ["pipe", "pipe", "pipe"] });
    this.buf = ""; this.pending = new Map(); this.id = 0; this.stderr = "";
    this.proc.stdout.on("data", chunk => {
      this.buf += chunk.toString();
      let nl;
      while ((nl = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, nl).trim(); this.buf = this.buf.slice(nl + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined && this.pending.has(msg.id)) {
            const { resolve, reject } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            else resolve(msg.result);
          }
        } catch {}
      }
    });
    this.proc.stderr.on("data", c => { this.stderr += c.toString(); });
  }
  request(method, params) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP timeout: ${method}\nstderr: ${this.stderr.slice(-300)}`));
        }
      }, this.timeoutMs);
    });
  }
  async initialize() {
    await this.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "signals-flow", version: "0.1.0" } });
    this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  }
  callTool(name, args) { return this.request("tools/call", { name, arguments: args || {} }); }
  close() { try { this.proc.stdin.end(); } catch {}; try { this.proc.kill(); } catch {}; }
}

function loadServer(id) {
  const cfg = JSON.parse(readFileSync(CLAUDE_CONFIG, "utf-8"));
  const server = cfg.mcpServers?.[id];
  if (!server) throw new Error(`MCP server "${id}" not in ${CLAUDE_CONFIG}`);
  return server;
}

const POST_URL_RE = /https?:\/\/(?:www\.)?linkedin\.com\/(?:posts|feed\/update)\/[^\s)\]"<>]+/gi;

function extractPostsFromProfileText(text) {
  const seen = new Set();
  const posts = [];
  let m;
  while ((m = POST_URL_RE.exec(text)) !== null) {
    const url = m[0].replace(/[)\].,;]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    // grab a snippet around the URL
    const start = Math.max(0, m.index - 360);
    const end = Math.min(text.length, m.index + 200);
    const snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
    posts.push({ post_url: url, snippet });
  }
  return posts;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export default async function linkedinRecentPosts({ profiles = [], maxScrolls = 5 } = {}) {
  const valid = (Array.isArray(profiles) ? profiles : []).filter(p => p?.slug);
  if (!valid.length) return { posts: [], reason: "no profiles supplied" };

  const server = loadServer("linkedin");
  const client = new StdioMcpClient(server);
  const allPosts = [];
  try {
    await client.initialize();
    for (const p of valid) {
      try {
        const result = await client.callTool("get_person_profile", {
          linkedin_username: p.slug,
          sections: "posts",
          max_scrolls: maxScrolls,
        });
        const text = (result?.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");
        if (result?.isError) {
          allPosts.push({ author_name: p.name, author_slug: p.slug, error: text.slice(0, 200) });
          continue;
        }
        const posts = extractPostsFromProfileText(text);
        for (const post of posts) {
          allPosts.push({
            author_name: p.name || p.slug,
            author_slug: p.slug,
            author_profile: p.url,
            source_keyword: p.source_keyword || null,
            post_url: post.post_url,
            snippet: post.snippet.slice(0, 320),
          });
        }
      } catch (err) {
        allPosts.push({ author_name: p.name, author_slug: p.slug, error: err.message.slice(0, 200) });
      }
      await sleep(2500);  // be polite to LinkedIn
    }
    return { posts: allPosts.filter(x => !x.error), errors: allPosts.filter(x => x.error) };
  } finally {
    client.close();
  }
}
