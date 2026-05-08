/**
 * Run LinkedIn people-search via the linkedin MCP for each topic keyword.
 * Returns deduped list of profiles. NO write actions to LinkedIn.
 *
 * Args: { keywords: string[], location?: string, perKeyword?: 5 }
 * Returns: array of { name, headline, url, location, source_keyword }
 *
 * Requires the linkedin MCP registered in ~/.claude.json. First call will
 * trigger Patchright browser login.
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
  constructor(server, timeoutMs = 60000) {
    this.timeoutMs = timeoutMs;
    this.proc = spawn(server.command, server.args || [], {
      env: buildEnv(server),
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.buf = "";
    this.pending = new Map();
    this.id = 0;
    this.stderr = "";
    this.proc.stdout.on("data", chunk => {
      this.buf += chunk.toString();
      let nl;
      while ((nl = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, nl).trim();
        this.buf = this.buf.slice(nl + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined && this.pending.has(msg.id)) {
            const { resolve, reject } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            else resolve(msg.result);
          }
        } catch { /* skip non-JSON */ }
      }
    });
    this.proc.stderr.on("data", c => { this.stderr += c.toString(); });
    this.proc.on("error", err => {
      for (const { reject } of this.pending.values()) reject(err);
    });
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
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "signals-flow", version: "0.1.0" },
    });
    this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  }
  callTool(name, args) {
    return this.request("tools/call", { name, arguments: args || {} });
  }
  close() {
    try { this.proc.stdin.end(); } catch {}
    try { this.proc.kill(); } catch {}
  }
}

function loadServer(id) {
  const cfg = JSON.parse(readFileSync(CLAUDE_CONFIG, "utf-8"));
  const server = cfg.mcpServers?.[id];
  if (!server) throw new Error(`MCP server "${id}" not in ${CLAUDE_CONFIG}`);
  return server;
}

function normalizeProfiles(rawText) {
  // The MCP returns text content; try to extract profile URLs + names
  // Pattern is lenient because the scraper output format varies
  const profiles = [];
  const linkedinUrlRe = /https?:\/\/(?:www\.)?linkedin\.com\/in\/([a-z0-9\-_%]+)/gi;
  const seen = new Set();
  let m;
  while ((m = linkedinUrlRe.exec(rawText)) !== null) {
    const url = m[0].replace(/[)\].,;]+$/, "");
    const slug = m[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    // Look back ~200 chars for a likely name (capitalized word sequence)
    const window = rawText.slice(Math.max(0, m.index - 240), m.index);
    const nameMatch = window.match(/([A-Z][a-zA-Z'\-]+(?:\s[A-Z][a-zA-Z'\-]+){1,3})\s*[\n,—|·]?[^A-Za-z0-9]{0,3}$/);
    profiles.push({
      name: nameMatch ? nameMatch[1] : slug.replace(/-/g, " "),
      url,
      slug,
    });
  }
  return profiles;
}

export default async function linkedinAudienceSearch({ keywords = [], location = "", perKeyword = 5 } = {}) {
  const kws = Array.isArray(keywords) ? keywords : (typeof keywords === "string" ? keywords.split(",").map(s => s.trim()) : []);
  if (!kws.length) throw new Error("keywords array required");

  const server = loadServer("linkedin");
  const client = new StdioMcpClient(server, 120000);
  try {
    await client.initialize();
    const all = [];
    for (const kw of kws) {
      try {
        // search_people only accepts keywords + optional location (per upstream schema)
        const result = await client.callTool("search_people", {
          keywords: kw,
          ...(location ? { location } : {}),
        });
        const texts = (result?.content || []).filter(c => c.type === "text").map(c => c.text).join("\n\n");
        if (result?.isError) {
          all.push({ keyword: kw, error: texts.slice(0, 200) });
          continue;
        }
        const profiles = normalizeProfiles(texts).slice(0, perKeyword);
        for (const p of profiles) all.push({ ...p, source_keyword: kw });
      } catch (err) {
        all.push({ keyword: kw, error: err.message });
      }
    }
    // Dedupe by slug, keep first source_keyword
    const seen = new Set();
    const deduped = [];
    for (const p of all) {
      if (p.error || !p.slug) { deduped.push(p); continue; }
      if (seen.has(p.slug)) continue;
      seen.add(p.slug);
      deduped.push(p);
    }
    return { profiles: deduped, totalKeywords: kws.length, totalProfiles: deduped.filter(p => p.slug).length };
  } finally {
    client.close();
  }
}
