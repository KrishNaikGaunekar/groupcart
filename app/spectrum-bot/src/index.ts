import "dotenv/config";
import { Spectrum, type Space } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { terminal } from "spectrum-ts/providers/terminal";
import { addToCart, cartSummary, handleText, settle } from "./agent.js";
import { startServer } from "./server.js";
import { allSpaces, displayName, getSpace, save } from "./store.js";

const MODE = process.env.MODE || (process.env.SPECTRUM_PROJECT_ID ? "imessage" : "terminal");
const BOT_NAME = process.env.BOT_NAME || "cart";
const PAY_RE = new RegExp(`^(@?(${BOT_NAME}|groupcart)[,\\s]+)?(pay|pay me|pay my share|i'?ll pay)\\W*$`, "i");
const LIKE = new Set(["👍", "❤️", "like", "love"]);

const app = await Spectrum({
  providers: [
    ...(MODE !== "terminal" ? [imessage.config()] : []),
    ...(MODE !== "imessage" ? [terminal.config({ commands: [{ name: "/as", description: "/as <name> — speak as another group member" }] })] : []),
  ],
});
startServer();

const queues = new Map<string, Promise<void>>(); // serialize work per conversation
const termAlias = new Map<string, string>(); // terminal space -> impersonated sender

function isGroupSpace(space: Space): boolean {
  if (space.__platform === "terminal") return /group/i.test(space.id);
  return (space as { type?: string }).type === "group";
}

async function members(space: Space, fallback: string[]): Promise<string[]> {
  try {
    const m = await space.getMembers();
    if (m.length) return m.map((u) => u.id);
  } catch {}
  return fallback;
}

for await (const [space, message] of app.messages) {
  if (message.direction === "outbound") continue;
  const prev = queues.get(space.id) ?? Promise.resolve();
  queues.set(
    space.id,
    prev.then(() => handle(space, message)).catch((e) => console.error("handler error:", e)),
  );
}

async function handle(space: Space, message: any) {
  const group = isGroupSpace(space);
  const state = getSpace(space.id, group);
  let senderId: string = message.sender?.id ?? "unknown";
  if (space.__platform === "terminal" && termAlias.has(space.id)) senderId = termAlias.get(space.id)!;

  // 👍 on an option = add it for whoever tapped. 👍 on your own "you owe" message = pay it.
  if (message.content.type === "reaction") {
    if (!LIKE.has(message.content.emoji)) return;
    const targetId = message.content.target?.id;
    const product = state.offers[targetId];
    const payment = state.cart.payments.find((p) => p.messageId === targetId && p.status === "pending");
    if (product) {
      addToCart(state, product, senderId);
      const s = cartSummary(state);
      await space.send(`added for ${displayName(state, senderId)} ✓ cart is $${s.subtotal.toFixed(2)} (${s.items.length} items)`);
    } else if (payment && payment.userId === senderId) {
      await space.responding(async () => space.send(settleMessage(await settle(state, senderId))));
    }
    return;
  }
  if (message.content.type !== "text") return;
  const text: string = message.content.text.trim();

  const as = text.match(/^\/as\s+(.+)$/i);
  if (as && space.__platform === "terminal") {
    const name = as[1].trim();
    termAlias.set(space.id, `term-${name.toLowerCase()}`);
    state.names[`term-${name.toLowerCase()}`] = name;
    save();
    await space.send(`(now speaking as ${name})`);
    return;
  }

  // "pay" is deterministic: skip the LLM so it's instant and can't be misread.
  const mine = state.cart.payments.find((p) => p.userId === senderId && p.status === "pending");
  if (mine && PAY_RE.test(text)) {
    await space.responding(async () => space.send(settleMessage(await settle(state, senderId))));
    return;
  }

  // In groups only chime in when called by name.
  if (group && !new RegExp(`\\b(${BOT_NAME}|groupcart)\\b`, "i").test(text)) return;

  await space.responding(async () => {
    const known = [...new Set([senderId, ...state.cart.items.map((i) => i.addedBy)])];
    let reply: string;
    try {
      reply = await handleText(
        {
          state,
          senderId,
          members: group ? await members(space, known) : [senderId],
          send: async (t) => (await space.send(t))?.id,
        },
        text,
      );
    } catch (e) {
      console.error("agent failed:", e);
      reply = "sorry, i'm a little overloaded rn 😅 try again in a minute";
    }
    await space.send(reply);
  });
}

function settleMessage(r: Record<string, any>): string {
  if (r.error) return `couldn't pay: ${r.error}`;
  const waiting = r.payments.filter((p: any) => p.status !== "paid").map((p: any) => p.name);
  let out = `💸 ${r.paid} paid $${r.amount.toFixed(2)}` + (waiting.length ? ` — waiting on ${waiting.join(", ")}` : "");
  if (r.order?.ok) out += `\neveryone's in 🎉 order placed:\n` + r.order.links.map((l: any) => `${l.retailer}: ${l.url}`).join("\n");
  return out;
}
