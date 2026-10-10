// Bill splitting + payment collection. Uses Stripe test mode when STRIPE_SECRET_KEY is set,
// otherwise mock links served by our own http server (see src/server.ts).
// OWNER: payments worktree.
import Stripe from "stripe";
import type { Cart, Payment, Share } from "../types.js";

const TAX_RATE = 0.0725; // NC base + Orange County, close enough for a demo
const SHIPPING_FLAT = 5.99;
const FREE_SHIPPING_AT = 35;

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
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

export async function createPaymentLinks(cart: Cart, shares: Share[], names: Record<string, string>): Promise<Payment[]> {
  const base = process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  return Promise.all(
    shares.map(async (s): Promise<Payment> => {
      if (!stripe) {
        const id = `mock_${cart.spaceId.replace(/\W/g, "")}_${s.userId.replace(/\W/g, "")}_${Date.now()}`;
        return { userId: s.userId, amount: s.total, url: `${base}/pay/${id}`, externalId: id, status: "pending" };
      }
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: Math.round(s.total * 100),
              product_data: { name: `GroupCart share for ${names[s.userId] ?? s.userId}` },
            },
          },
        ],
        success_url: `${base}/paid`,
        metadata: { spaceId: cart.spaceId, userId: s.userId },
      });
      return { userId: s.userId, amount: s.total, url: session.url!, externalId: session.id, status: "pending" };
    }),
  );
}

const mockPaid = new Set<string>();
export function markMockPaid(id: string) {
  mockPaid.add(id);
}

/** Refresh statuses in place. Returns true if anything changed. */
export async function refreshPayments(cart: Cart): Promise<boolean> {
  let changed = false;
  for (const p of cart.payments) {
    if (p.status === "paid") continue;
    const paid = stripe
      ? (await stripe.checkout.sessions.retrieve(p.externalId)).payment_status === "paid"
      : mockPaid.has(p.externalId);
    if (paid) {
      p.status = "paid";
      changed = true;
    }
  }
  return changed;
}
