// The shopping agent: system prompt + tools bound to one conversation.
// OWNER: agent worktree (tool *implementations* live in src/tools/*).
import { runAgent, type Tool } from "./llm.js";
import { displayName, save } from "./store.js";
import { checkoutLinks, FREE_SHIPPING, searchProducts } from "./tools/commerce.js";
import { cartSubtotal, createPaymentLinks, refreshPayments, splitBill } from "./tools/payments.js";
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
- Never check out until everyone has paid. Use request_payments, then payment_status. checkout only works when all paid.
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
  return reply;
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
      description: "Create a payment link for each person and send them to the chat. Locks the cart.",
      parameters: { type: "object", properties: {} },
      async run() {
        if (!state.cart.items.length) return { error: "cart is empty" };
        const shares = splitBill(state.cart, ctx.members);
        state.cart.payments = await createPaymentLinks(state.cart, shares, state.names);
        state.cart.status = "collecting";
        save();
        for (const p of state.cart.payments) {
          await ctx.send(`${displayName(state, p.userId)}: $${p.amount.toFixed(2)}\n${p.url}`);
        }
        return { sent_to_chat: true, payments: state.cart.payments.map((p) => ({ name: displayName(state, p.userId), amount: p.amount })) };
      },
    },
    {
      name: "payment_status",
      description: "Check who has paid.",
      parameters: { type: "object", properties: {} },
      async run() {
        await refreshPayments(state.cart);
        save();
        return state.cart.payments.map((p) => ({ name: displayName(state, p.userId), amount: p.amount, status: p.status }));
      },
    },
    {
      name: "checkout",
      description: "Place the order once everyone has paid. Returns retailer cart links.",
      parameters: { type: "object", properties: {} },
      async run() {
        return checkout(state);
      },
    },
  ];
}

export async function checkout(state: SpaceState) {
  await refreshPayments(state.cart);
  const unpaid = state.cart.payments.filter((p) => p.status !== "paid");
  if (!state.cart.payments.length) return { error: "request_payments first" };
  if (unpaid.length) return { error: "not everyone has paid", waiting_on: unpaid.map((p) => displayName(state, p.userId)) };
  const links = checkoutLinks(state.cart.items);
  state.cart.status = "checked_out";
  save();
  return { ok: true, links };
}
