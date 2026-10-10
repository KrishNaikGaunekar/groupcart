// Shared contracts. Every worktree codes against these — change them only on main.

export type Retailer = "amazon" | "walmart" | "target" | "other";

export interface Product {
  id: string; // ASIN for amazon, us_item_id for walmart, otherwise a hash
  retailer: Retailer;
  title: string;
  price: number; // USD
  url: string;
  image?: string;
  rating?: number;
}

export interface CartItem {
  product: Product;
  qty: number;
  addedBy: string; // user id (phone/email handle)
  shared: boolean; // true = split evenly across all members
}

export type PaymentStatus = "pending" | "paid";

export interface Payment {
  userId: string;
  amount: number;
  url: string;
  externalId: string; // stripe checkout session id, or mock id
  status: PaymentStatus;
}

export interface Share {
  userId: string;
  items: number; // subtotal of their own items + their part of shared items
  fees: number; // proportional tax + shipping
  total: number;
}

export interface Cart {
  spaceId: string;
  items: CartItem[];
  status: "open" | "collecting" | "checked_out";
  payments: Payment[];
}

export interface SpaceState {
  spaceId: string;
  isGroup: boolean;
  cart: Cart;
  names: Record<string, string>; // userId -> display name
  // bot message id -> product it showed, so a 👍 tapback adds that product
  offers: Record<string, Product>;
}
