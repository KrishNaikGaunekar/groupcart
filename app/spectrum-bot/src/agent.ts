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
  /** Send a standalone message; resolves to its message id (used to map tapbacks to offers). */
  send(text: string): Promise<string | undefined>;
}

const SYSTEM = `You are GroupCart, a shopping agent that lives in iMessage. People text you what they want and you
find it at Amazon, Walmart, or Target, build a cart, split the bill, and collect money before checkout.

Style: this is texting. Short, warm, lowercase-friendly, no markdown, no bullet symbols other than plain lines.
Never more than ~4 short lines unless listing a cart.

Rules:
- When someone wants a product, call search_products. It sends each option as its own message, so do NOT
  repeat the options; just say something like "tap 👍 on the one you want, or tell me which".
- In group chats, track who added what. Items for everyone (snacks, decor) should be added with shared=true.
- After adding items, if a retailer's free_shipping_gap is between 0 and 15 dollars, nudge the group to add
  something small to hit free shipping.
- Money moves through each person's Capital One account (Nessie). request_payments sends each person a
  "👍 to pay" message; they can also just say "pay" and you call pay_my_share. When the last person pays,
  checkout happens automatically. Never check out before everyone has paid.
- If someone introduces themselves ("i'm sam"), call set_my_name.
- Prices come only from tools. Never invent products, prices, or links.
- Messages are prefixed with [sender name]. Address people by name in groups.`;

export async function handleText(ctx: TurnContext, text: string): Promise<string> {
  const { state, senderId } = ctx;
  const who = displayName(state, senderId);
  const reply = await runAgent({
    key: state.spaceId,
    system: SYSTEM + (state.isGroup ? "\nThis is a GROUP chat." : "\nThis is a 1:1 chat."),
    userText: `[${who}] ${text}`,
    tools: buildTools(ctx),
  });
  save();
  return reply || "done ✓";
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
          const id = await ctx.send(offerText(p));
          if (id) state.offers[id] = p;
          else state.offers[`local-${p.id}`] = p;
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
          const id = await ctx.send(`${displayName(state, p.userId)}: you owe $${p.amount.toFixed(2)} — 👍 this to pay from your Capital One account`);
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
