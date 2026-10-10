import "dotenv/config";
import { Spectrum, type Space } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { terminal } from "spectrum-ts/providers/terminal";
import { addToCart, cartSummary, checkout, handleText } from "./agent.js";
import { startServer } from "./server.js";
import { allSpaces, displayName, getSpace, save } from "./store.js";
import { refreshPayments } from "./tools/payments.js";

const MODE = process.env.MODE ?? (process.env.SPECTRUM_PROJECT_ID ? "imessage" : "terminal");
const BOT_NAME = process.env.BOT_NAME ?? "cart";
const LIKE = new Set(["👍", "❤️", "like", "love"]);

const app = await Spectrum({
  providers: [
    ...(MODE !== "terminal" ? [imessage.config()] : []),
    ...(MODE !== "imessage" ? [terminal.config({ commands: [{ name: "/as", description: "/as <name> — speak as another group member" }] })] : []),
  ],
});
startServer();

const liveSpaces = new Map<string, Space>(); // for proactive messages from the payment poller
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
  liveSpaces.set(space.id, space);
  const group = isGroupSpace(space);
  const state = getSpace(space.id, group);
  let senderId: string = message.sender?.id ?? "unknown";
  if (space.__platform === "terminal" && termAlias.has(space.id)) senderId = termAlias.get(space.id)!;

  // 👍 on an option = add it to the cart for whoever tapped.
  if (message.content.type === "reaction") {
    const product = state.offers[message.content.target?.id];
    if (product && LIKE.has(message.content.emoji)) {
      addToCart(state, product, senderId);
      const s = cartSummary(state);
      await space.send(`added for ${displayName(state, senderId)} ✓ cart is $${s.subtotal.toFixed(2)} (${s.items.length} items)`);
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

  // In groups only chime in when called by name.
  if (group && !new RegExp(`\\b(${BOT_NAME}|groupcart)\\b`, "i").test(text)) return;

  await space.responding(async () => {
    const known = [...new Set([senderId, ...state.cart.items.map((i) => i.addedBy)])];
    const reply = await handleText(
      {
        state,
        senderId,
        members: group ? await members(space, known) : [senderId],
        send: async (t) => (await space.send(t))?.id,
      },
      text,
    );
    if (reply) await space.send(reply);
  });
}

// Watch open payment requests; announce payments and auto-checkout when everyone has paid.
setInterval(async () => {
  for (const state of allSpaces()) {
    if (state.cart.status !== "collecting") continue;
    const space = liveSpaces.get(state.spaceId);
    if (!space) continue;
    try {
      const before = new Set(state.cart.payments.filter((p) => p.status === "paid").map((p) => p.userId));
      if (!(await refreshPayments(state.cart))) continue;
      for (const p of state.cart.payments) {
        if (p.status === "paid" && !before.has(p.userId)) await space.send(`💸 ${displayName(state, p.userId)} paid $${p.amount.toFixed(2)}`);
      }
      const result = await checkout(state);
      if ("ok" in result) {
        await space.send(
          `everyone's paid 🎉 order's ready:\n` + result.links!.map((l) => `${l.retailer}: ${l.url}`).join("\n"),
        );
      } else if ("waiting_on" in result) {
        await space.send(`waiting on ${result.waiting_on!.join(", ")}`);
      }
      save();
    } catch (e) {
      console.error("poller:", e);
    }
  }
}, 10_000);
