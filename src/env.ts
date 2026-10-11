// Load .env before any other module reads process.env. Imported first in index.ts; imports run in order,
// so this beats llm.ts reading its keys at load. override: .env wins over stale shell variables.
import { appendFileSync, mkdirSync } from "node:fs";
import { format } from "node:util";
import { config } from "dotenv";

config({ override: true });

// Mirror console output to data/bot.log (timestamped) so logs survive the terminal window.
mkdirSync("data", { recursive: true });
for (const level of ["log", "info", "warn", "error"] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    original(...args);
    try {
      appendFileSync("data/bot.log", `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${format(...args)}\n`);
    } catch {}
  };
}
