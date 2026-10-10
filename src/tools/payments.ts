// Bill splitting + collecting shares. Money moves through Capital One Nessie when NESSIE_API_KEY is set
// (member checking -> group pool -> retailer purchase); otherwise payments are simulated.
// OWNER: payments worktree.
import type { Cart, Payment, Share, SpaceState } from "../types.js";
import { bankEnabled, ensurePool, ensureUserAccount, getBalance, purchase, transfer } from "./bank.js";

const TAX_RATE = 0.0725; // NC base + Orange County, close enough for a demo
const SHIPPING_FLAT = 5.99;
const FREE_SHIPPING_AT = 35;

const round = (n: number) => Math.round(n * 100) / 100;

export function cartSubtotal(cart: Cart): number {
  return round(cart.items.reduce((s, it) => s + it.product.price * it.qty, 0));
}

/** Own items go to whoever added them; shared items split evenly; tax + shipping proportional. */
export function splitBill(cart: Cart, members: string[]): Share[] {
  const people = [...new Set([...members, ...cart.items.map((i) => i.addedBy)])];
  const items: Record<string, number> = Object.fromEntries(people.map((p) => [p, 0]));
  for (const it of cart.items) {
    const cost = it.product.price * it.qty;
    if (it.shared) for (const p of people) items[p] += cost / people.length;
    else items[it.addedBy] += cost;
  }
  const subtotal = cartSubtotal(cart);
  const fees = subtotal * TAX_RATE + (subtotal >= FREE_SHIPPING_AT ? 0 : SHIPPING_FLAT);
  return people
    .filter((p) => items[p] > 0)
    .map((p) => {
      const f = subtotal ? (items[p] / subtotal) * fees : 0;
      return { userId: p, items: round(items[p]), fees: round(f), total: round(items[p] + f) };
    });
}

export function requestPayments(shares: Share[]): Payment[] {
  return shares.map((s) => ({ userId: s.userId, amount: s.total, status: "pending" }));
}

/** Pay one member's share into the group's pool. Throws a readable error on failure. */
export async function payShare(state: SpaceState, userId: string, name: string): Promise<Payment> {
  const p = state.cart.payments.find((x) => x.userId === userId);
  if (!p) throw new Error(`${name} doesn't owe anything on this cart`);
  if (p.status === "paid") return p;
  if (bankEnabled()) {
    const acct = await ensureUserAccount(userId, name);
    const pool = await ensurePool(state.spaceId);
    const balance = await getBalance(acct.accountId);
    if (balance < p.amount) throw new Error(`${name}'s balance is $${balance.toFixed(2)}, short of $${p.amount.toFixed(2)}`);
    const t = await transfer(acct.accountId, pool, p.amount, `GroupCart share (${state.cart.items.length} items)`);
    p.transferId = t._id;
  }
  p.status = "paid";
  return p;
}

export function allPaid(cart: Cart): boolean {
  return cart.payments.length > 0 && cart.payments.every((p) => p.status === "paid");
}

/** Pool pays each retailer its portion of the collected money. */
export async function payRetailers(state: SpaceState): Promise<string[]> {
  if (!bankEnabled()) return [];
  const pool = await ensurePool(state.spaceId);
  const collected = state.cart.payments.reduce((s, p) => s + p.amount, 0);
  const subtotal = cartSubtotal(state.cart);
  const byRetailer = new Map<string, number>();
  for (const it of state.cart.items) byRetailer.set(it.product.retailer, (byRetailer.get(it.product.retailer) ?? 0) + it.product.price * it.qty);
  const ids: string[] = [];
  for (const [retailer, sub] of byRetailer) {
    const r = await purchase(pool, retailer as any, round((sub / subtotal) * collected), `GroupCart order`);
    ids.push(r._id);
  }
  return ids;
}
