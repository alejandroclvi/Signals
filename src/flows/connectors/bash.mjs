/**
 * bash connector — runs a shell command, captures stdout, streams output for visibility.
 *
 * Step shape:
 *   { name: "x", bash: "pnpm graph:sync ${context}" }
 *   { name: "y", bash: "echo hi", silent: true }   // suppress stdout streaming
 */

import { spawn } from "node:child_process";

export default {
  async run(step) {
    const cmd = step.bash;
    if (typeof cmd !== "string" || !cmd.trim()) throw new Error("bash step requires a string command");

    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, { shell: true, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", chunk => {
        const s = chunk.toString();
        stdout += s;
        if (!step.silent) process.stdout.write(s.split("\n").map(l => l ? "       " + l : l).join("\n"));
      });
      proc.stderr.on("data", chunk => {
        const s = chunk.toString();
        stderr += s;
        if (!step.silent) process.stderr.write(s.split("\n").map(l => l ? "       " + l : l).join("\n"));
      });
      proc.on("error", reject);
      proc.on("close", code => {
        if (code === 0) return resolve(stdout.trim());
        reject(new Error(`Command failed (exit ${code}): ${cmd}\n${stderr.trim().slice(0, 300)}`));
      });
    });
  },
};
