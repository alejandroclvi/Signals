/**
 * js connector — dynamically imports a module and calls its default export
 * with the step's `args` object. The function may be async.
 *
 * Step shape:
 *   { name: "x", js: "src/flows/steps/extract-top.mjs", args: { context: "...", lens: "..." } }
 *
 * Module shape (the called file):
 *   export default async function (args) { return ... }
 */

import { pathToFileURL } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");

export default {
  async run(step) {
    const file = step.js;
    if (typeof file !== "string") throw new Error("js step requires a path string");
    const abs = path.isAbsolute(file) ? file : path.resolve(repoRoot, file);
    const mod = await import(pathToFileURL(abs).href);
    const fn = mod.default;
    if (typeof fn !== "function") throw new Error(`js step ${file} must default-export a function`);
    return await fn(step.args || {});
  },
};
