import "dotenv/config";
import { handleText } from "../src/agent.ts";
import { getSpace } from "../src/store.ts";
const st = getSpace("t1");
const ctx = { state: st, senderId: "krish", members: ["krish"], send: async (t: string) => { console.log("SEND>", t.replace(/\n/g," | ")); return "m" + Math.random(); } };
for (const msg of ["hey im krish, find me a usb-c cable under 25", "add the cheapest one", "ok split it and request payment", "pay", "what's my balance"]) {
  const t0 = Date.now();
  console.log("\nUSER>", msg);
  console.log("BOT>", await handleText(ctx, msg), `(${Date.now() - t0}ms)`);
}
