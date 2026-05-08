/**
 * mcp connector — spawns a stdio MCP server (from ~/.claude.json) and calls a tool.
 *
 * Step shape:
 *   { name: "x", mcp: "neo4j-memory.search_memories", args: { query: "X" } }
 *   { name: "y", mcp: "neo4j-cypher.read_neo4j_cypher", args: { query: "MATCH (n) RETURN count(n)" } }
 *
 * Limits:
 *   - stdio MCP servers only (`type: "stdio"` in ~/.claude.json)
 *   - OAuth-flow servers (e.g., claude.ai-hosted Linear, Airtable) are NOT supported here.
 *     Use direct API connectors for those.
 *
 * Implements minimal JSON-RPC 2.0 over stdio per MCP spec.
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const CLAUDE_CONFIG = path.join(os.homedir(), ".claude.json");

function loadServerConfig(serverId) {
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(CLAUDE_CONFIG, "utf-8"));
  } catch {
    throw new Error(`Could not read ${CLAUDE_CONFIG}`);
  }
  const servers = cfg.mcpServers || {};
  const server = servers[serverId];
  if (!server) throw new Error(`MCP server "${serverId}" not in ${CLAUDE_CONFIG}. Available: ${Object.keys(servers).join(", ")}`);
  if (server.type && server.type !== "stdio") throw new Error(`MCP server "${serverId}" has type "${server.type}". Only stdio supported.`);
  return server;
}

// Env vars that belong to OUR app and could confuse spawned MCP servers
// (e.g., NEO4J_URL is our HTTP endpoint; mcp-neo4j-cypher misreads it as Bolt).
const APP_ENV_PREFIXES = ["NEO4J_", "OPENROUTER_", "SIGNALS_"];

function buildEnv(server) {
  const base = { ...process.env };
  // Strip our app-specific vars unless explicitly re-set by the server's own config
  const explicit = new Set(Object.keys(server.env || {}));
  for (const k of Object.keys(base)) {
    if (APP_ENV_PREFIXES.some(p => k.startsWith(p)) && !explicit.has(k)) {
      delete base[k];
    }
  }
  return { ...base, ...(server.env || {}) };
}

class StdioMcpClient {
  constructor(server) {
    this.proc = spawn(server.command, server.args || [], {
      env: buildEnv(server),
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.buf = "";
    this.pending = new Map();
    this.id = 0;

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
        } catch { /* non-JSON line, skip */ }
      }
    });

    // Capture stderr for diagnostic on errors
    this.stderr = "";
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
      // Timeout safety
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP timeout: ${method}\nstderr: ${this.stderr.slice(-300)}`));
        }
      }, 30000);
    });
  }

  async initialize() {
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "signals-flow", version: "0.1.0" },
    });
    // notifications/initialized is fire-and-forget
    this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  }

  async callTool(name, args) {
    return this.request("tools/call", { name, arguments: args || {} });
  }

  close() {
    try { this.proc.stdin.end(); } catch {}
    try { this.proc.kill(); } catch {}
  }
}

export default {
  async run(step) {
    const ref = step.mcp;
    if (typeof ref !== "string" || !ref.includes(".")) {
      throw new Error('mcp step needs "<server>.<tool>" reference, e.g. "neo4j-cypher.read_neo4j_cypher"');
    }
    const [serverId, ...toolParts] = ref.split(".");
    const tool = toolParts.join(".");
    const server = loadServerConfig(serverId);

    const client = new StdioMcpClient(server);
    try {
      await client.initialize();
      const result = await client.callTool(tool, step.args || {});
      return result;
    } finally {
      client.close();
    }
  },
};
