/**
 * file connector — read or write a file.
 *
 * Step shapes:
 *   { name: "x", file: { path: "out/foo.md", content: "${draft}" } }   // write
 *   { name: "y", file: { path: "out/foo.md", read: true } }            // read, returns content
 */

import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export default {
  async run(step) {
    const cfg = step.file;
    if (!cfg || typeof cfg !== "object") throw new Error("file step requires { path, content|read }");
    if (!cfg.path) throw new Error("file step requires `path`");

    if (cfg.read) {
      return readFileSync(cfg.path, "utf-8");
    }
    if (cfg.content === undefined || cfg.content === null) {
      throw new Error("file step write requires `content`");
    }
    mkdirSync(path.dirname(cfg.path), { recursive: true });
    const text = typeof cfg.content === "string" ? cfg.content : JSON.stringify(cfg.content, null, 2);
    writeFileSync(cfg.path, text);
    return cfg.path;
  },
};
