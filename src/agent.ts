// The shopping agent: system prompt + tools bound to one conversation.
// OWNER: agent worktree (tool *implementations* live in src/tools/*).
import { runAgent, type Tool } from "./llm.js";
import { displayName, save } from "./store.js";
import { checkoutLinks, FREE_SHIPPING, searchProducts } from "./tools/commerce.js";
import { bankEnabled, ensureUserAccount, getBalance } from "./tools/bank.js";
import { allPaid, cartSubtotal, payRetailers, payShare, requestPayments, splitBill } from "./tools/payments.js";
import type { Product, SpaceState } from "./types.js";

export interface TurnContext {
  state: SpaceState;
  senderId: string;
  members: string[];
  /** Send a standalone message; resolves to its message id(s) (used to map tapbacks to offers).
   *  A hub group fans out to every member's chat, so it returns one id per copy. */
  send(text: string): Promise<string | string[] | undefined>;
  /** Send to one member only (a hub group's "you owe" prompt goes to that person's own chat). */
  sendTo?(userId: string, text: string): Promise<string | undefined>;
  /** For a personal chat: the sender's groups and their carts, so the model can point them there. */
  groups?: { name: string; cart: SpaceState }[];
}

const ids = (r: string | string[] | undefined): string[] => (r === undefined ? [] : Array.isArray(r) ? r : [r]);

const SYSTEM = `You are GroupCart, a shopping agent that lives in iMessage. People text you what they want and you
find it at Amazon, Walmart, or Target, build a cart, split the bill, and collect money before checkout.

Style: this is texting. Short, warm, lowercase-friendly, no markdown, no bullet symbols other than plain lines.
Never more than ~4 short lines unless listing a cart.

Rules:
- When someone wants a product, call search_products. It sends each option as its own message, so do NOT
  repeat the options; just say something like "tap 👍 on the one you want, or tell me which".
- In group chats, track who added what. Items for everyone (snacks, decor) should be added with shared=true.
  Items added by a 👍/❤️ start out personal to whoever reacted. When people say who pays for what ("split the
  snacks", "the blanket is mine", "I'll cover half"), fix it with update_cart_item, then call split_bill and
  show each person's total. Use view_cart first if you need product_ids.
- Removing a reaction can't be seen by you. If someone "unliked" something, ask which item to remove (or remove
  the one they name) with remove_from_cart. They can also reply "remove" to the option's message.
- A message that starts with (replying to "...") is a threaded reply to that earlier message; use it as context.
- After adding items, if a retailer's free_shipping_gap is between 0 and 15 dollars, nudge the group to add
  something small to hit free shipping.
- Money moves through each person's Capital One account (Nessie). request_payments sends each person a
  "👍 to pay" message; they can also just say "pay" and you call pay_my_share. When the last person pays,
  checkout happens automatically. Never check out before everyone has paid.
- If someone introduces themselves ("i'm sam"), call set_my_name.
- Prices come only from tools. Never invent products, prices, or links.
- Messages are prefixed with [sender name]. Address people by name in groups.
- This 1:1 chat is personal by default: what people text here is only for them. Group orders run through
  named groups (you can't be added to iMessage group chats). If someone asks how to shop with friends, give
  the exact texts: "start group movie night" (gives a join code), "add 919-555-1234" to text a friend in (or
  the friend texts their GroupCart "join <code>"), then "cart movie night find pillows" to act for the group.
  "groups" lists their groups, "leave movie night" exits. Each person gets their own "you owe" text.
- A message starting with [for the group "X"] is a request for that group's shared cart; everyone in X sees
  your reply. Anything else is the sender's personal cart.
- Every message ends with a (live cart: ...) note. It is the TRUTH about the cart right now. People add items
  with 👍 tapbacks and replies you never see, so never answer "what's in the cart" from memory: use that note
  (or view_cart). Search results are options, not cart items. In a personal chat it also lists the sender's
  groups' carts; if they ask about a group's cart, answer from it and remind them to start with
  "cart <group name> ..." to change it.`;

export async function handleText(ctx: TurnContext, text: string): Promise<string> {
  const { state, senderId } = ctx;
  const who = displayName(state, senderId);
  const reply = await runAgent({
    key: state.spaceId,
    system: SYSTEM + (state.isGroup ? "\nThis is a GROUP chat." : "\nThis is a 1:1 chat."),
    userText: `[${who}] ${text}\n\n${liveCart(ctx)}`,
    tools: buildTools(ctx),
  });
  save();
  return reply || fallbackReply(state);
}

/** One-line cart snapshot appended to every turn (tapback adds happen outside the model's history). */
function liveCart(ctx: TurnContext): string {
  const line = (st: SpaceState) => {
    const { items, subtotal, status } = cartSummary(st);
    if (!items.length) return "empty";
    const list = items.map((i) => `${i.qty > 1 ? `${i.qty}x ` : ""}${i.title.slice(0, 50)} $${i.price.toFixed(2)} (${i.shared ? "shared" : i.added_by}) [${i.product_id}]`);
    return `${items.length} item${items.length === 1 ? "" : "s"}, $${subtotal.toFixed(2)}${status !== "open" ? `, ${status}` : ""}: ${list.join("; ")}`;
  };
  const parts = [`(live cart: ${line(ctx.state)})`];
  for (const g of ctx.groups ?? []) parts.push(`(group "${g.name}" cart: ${line(g.cart)})`);
  return parts.join("\n");
}

/** Used when the model ran its tools but said nothing: describe where the cart stands instead. */
function fallbackReply(state: SpaceState): string {
  const { cart } = state;
  if (cart.status === "collecting") {
    const waiting = cart.payments.filter((p) => p.status !== "paid").map((p) => displayName(state, p.userId));
    return waiting.length ? `waiting on ${waiting.join(", ")} to pay` : "everyone's paid ✓";
  }
  if (cart.items.length) {
    const n = cart.items.reduce((s, i) => s + i.qty, 0);
    return `cart's at $${cartSubtotal(cart).toFixed(2)} (${n} item${n === 1 ? "" : "s"}). anything else?`;
  }
  return "got it. what are you shopping for?";
}

export function offerText(p: Product): string {
  const store = p.retailer[0].toUpperCase() + p.retailer.slice(1);
  return `${store} · $${p.price.toFixed(2)}${p.rating ? ` · ${p.rating}★` : ""}\n${p.title}\n${p.url}`;
}

/** Add a product to the cart (used by both the add_to_cart tool and 👍 tapbacks). */
export function addToCart(state: SpaceState, product: Product, userId: string, qty = 1, shared = false) {
  if (state.cart.status === "checked_out") state.cart = { spaceId: state.spaceId, items: [], status: "open", payments: [] };
  const existing = state.cart.items.find((i) => i.product.id === product.id && i.addedBy === userId);
  if (existing) existing.qty += qty;
  else state.cart.items.push({ product, qty, addedBy: userId, shared });
  save();
}

export function cartSummary(state: SpaceState) {
  const gaps: Record<string, number> = {};
  for (const [r, min] of Object.entries(FREE_SHIPPING)) {
    const sub = state.cart.items.filter((i) => i.product.retailer === r).reduce((s, i) => s + i.product.price * i.qty, 0);
    if (sub > 0) gaps[r] = Math.max(0, Math.round((min! - sub) * 100) / 100);
  }
  return {
    status: state.cart.status,
    items: state.cart.items.map((i) => ({
      product_id: i.product.id,
      title: i.product.title,
      retailer: i.product.retailer,
      price: i.product.price,
      qty: i.qty,
      added_by: displayName(state, i.addedBy),
      shared: i.shared,
    })),
    subtotal: cartSubtotal(state.cart),
    free_shipping_gap: gaps,
  };
}

function findProduct(state: SpaceState, productId: string): Product | undefined {
  return Object.values(state.offers).find((p) => p.id === productId) ?? state.cart.items.find((i) => i.product.id === productId)?.product;
}

function buildTools(ctx: TurnContext): Tool[] {
  const { state, senderId } = ctx;
  return [
    {
      name: "search_products",
      description: "Search retailers for a product. Sends the top options to the chat as separate messages.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to search for, e.g. 'airpods pro 2'" },
          max_price: { type: "number", description: "Optional budget cap in USD" },
        },
        required: ["query"],
      },
      async run({ query, max_price }) {
        const products = await searchProducts(query, max_price);
        if (!products.length) return { products: [], note: "nothing found" };
        for (const p of products) {
          const sent = ids(await ctx.send(offerText(p)));
          for (const id of sent) state.offers[id] = p;
          if (!sent.length) state.offers[`local-${p.id}`] = p;
        }
        save();
        return { sent_to_chat: true, products: products.map((p) => ({ product_id: p.id, retailer: p.retailer, title: p.title, price: p.price })) };
      },
    },
    {
      name: "add_to_cart",
      description: "Add a previously shown product to the shared cart.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          qty: { type: "integer", minimum: 1 },
          shared: { type: "boolean", description: "true if the item is for the whole group" },
        },
        required: ["product_id"],
      },
      async run({ product_id, qty = 1, shared = false }) {
        const p = findProduct(state, product_id);
        if (!p) return { error: "unknown product_id; search first" };
        addToCart(state, p, senderId, qty, shared);
        return cartSummary(state);
      },
    },
    {
      name: "remove_from_cart",
      description: "Remove a product from the cart.",
      parameters: { type: "object", properties: { product_id: { type: "string" } }, required: ["product_id"] },
      async run({ product_id }) {
        state.cart.items = state.cart.items.filter((i) => i.product.id !== product_id);
        save();
        return cartSummary(state);
      },
    },
    {
      name: "update_cart_item",
      description:
        "Change an item already in the cart: mark it shared (split evenly across everyone) or personal, change its quantity, or reassign who it's for. Use for 'split the snacks', 'the blanket is mine', 'make it 2'.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          shared: { type: "boolean", description: "true = split across everyone; false = only the owner pays" },
          qty: { type: "integer", minimum: 1 },
          owner_name: { type: "string", description: "Name of the person this item is for (makes it personal to them)" },
        },
        required: ["product_id"],
      },
      async run({ product_id, shared, qty, owner_name }) {
        const matches = state.cart.items.filter((i) => i.product.id === product_id);
        if (!matches.length) return { error: "that product isn't in the cart; call view_cart for product_ids" };
        let owner: string | undefined;
        if (owner_name) {
          owner = Object.entries(state.names).find(([, n]) => n.toLowerCase() === String(owner_name).toLowerCase())?.[0];
          if (!owner) return { error: `don't know who "${owner_name}" is`, known_names: Object.values(state.names) };
        }
        // Collapse duplicates of the same product into one line before editing it.
        const item = matches[0];
        item.qty = qty ?? matches.reduce((s, i) => s + i.qty, 0);
        state.cart.items = state.cart.items.filter((i) => i.product.id !== product_id || i === item);
        if (owner) {
          item.addedBy = owner;
          item.shared = false;
        }
        if (shared !== undefined) item.shared = shared;
        save();
        return cartSummary(state);
      },
    },
    {
      name: "view_cart",
      description: "Show the current cart, subtotal, and free-shipping gaps.",
      parameters: { type: "object", properties: {} },
      async run() {
        return cartSummary(state);
      },
    },
    {
      name: "set_my_name",
      description: "Remember the sender's display name.",
      parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
      async run({ name }) {
        state.names[senderId] = name;
        save();
        return { ok: true };
      },
    },
    {
      name: "split_bill",
      description: "Preview what each person owes (own items + share of shared items + proportional tax/shipping).",
      parameters: { type: "object", properties: {} },
      async run() {
        return splitBill(state.cart, ctx.members).map((s) => ({ ...s, name: displayName(state, s.userId) }));
      },
    },
    {
      name: "request_payments",
      description: "Lock the cart and ask each person to pay their share (sends a 👍-to-pay message per person).",
      parameters: { type: "object", properties: {} },
      async run() {
        if (!state.cart.items.length) return { error: "cart is empty" };
        if (state.cart.status === "collecting") return { error: "already collecting", payments: paymentList(state) };
        state.cart.payments = requestPayments(splitBill(state.cart, ctx.members));
        state.cart.status = "collecting";
        for (const p of state.cart.payments) {
          const text = `${displayName(state, p.userId)}: you owe $${p.amount.toFixed(2)} — 👍 this to pay from your Capital One account`;
          const id = ctx.sendTo ? await ctx.sendTo(p.userId, text) : ids(await ctx.send(text))[0];
          if (id) p.messageId = id;
        }
        save();
        return { sent_to_chat: true, payments: paymentList(state) };
      },
    },
    {
      name: "pay_my_share",
      description: "Pay the sender's share from their bank account into the group pool.",
      parameters: { type: "object", properties: {} },
      async run() {
        return settle(state, senderId);
      },
    },
    {
      name: "payment_status",
      description: "Check who has paid.",
      parameters: { type: "object", properties: {} },
      async run() {
        return paymentList(state);
      },
    },
    {
      name: "my_balance",
      description: "The sender's bank balance.",
      parameters: { type: "object", properties: {} },
      async run() {
        if (!bankEnabled()) return { note: "bank not connected (demo mode)" };
        const acct = await ensureUserAccount(senderId, displayName(state, senderId));
        return { balance: await getBalance(acct.accountId) };
      },
    },
  ];
}

function paymentList(state: SpaceState) {
  return state.cart.payments.map((p) => ({ name: displayName(state, p.userId), amount: p.amount, status: p.status }));
}

/** Pay a member's share; if that was the last one, place the order. Used by the tool and by 👍 tapbacks. */
export async function settle(state: SpaceState, userId: string) {
  const name = displayName(state, userId);
  try {
    const p = await payShare(state, userId, name);
    save();
    const result: Record<string, unknown> = { paid: name, amount: p.amount, payments: paymentList(state) };
    if (allPaid(state.cart)) result.order = await checkout(state);
    return result;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function checkout(state: SpaceState) {
  if (!allPaid(state.cart)) {
    return { error: "not everyone has paid", waiting_on: state.cart.payments.filter((p) => p.status !== "paid").map((p) => displayName(state, p.userId)) };
  }
  const purchases = await payRetailers(state);
  const links = checkoutLinks(state.cart.items);
  state.cart.status = "checked_out";
  save();
  return { ok: true, nessie_purchases: purchases.length, links };
}

