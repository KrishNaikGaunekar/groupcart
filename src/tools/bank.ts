// Capital One Nessie client (mock bank). Every chat member gets a checking account, every chat gets a
// pool account; shares move member -> pool via transfers, checkout is a pool -> retailer purchase.
// OWNER: payments worktree.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Retailer } from "../types.js";

const BASE = "https://api.nessieisreal.com";
const FILE = "data/bank.json";
const STARTING_BALANCE = 500;
const ADDRESS = { street_number: "201", street_name: "S Columbia St", city: "Chapel Hill", state: "NC", zip: "27599" };

interface BankState {
  users: Record<string, { customerId: string; accountId: string }>;
  pools: Record<string, string>; // spaceId -> accountId
  merchants: Partial<Record<Retailer, string>>;
}

const bank: BankState = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : { users: {}, pools: {}, merchants: {} };
const persist = () => {
  mkdirSync("data", { recursive: true });
  writeFileSync(FILE, JSON.stringify(bank, null, 2));
};

export const bankEnabled = () => !!process.env.NESSIE_API_KEY;

async function nessie<T = any>(method: string, path: string, body?: object): Promise<T> {
  const res = await fetch(`${BASE}${path}${path.includes("?") ? "&" : "?"}key=${process.env.NESSIE_API_KEY}`, {
    method,
    headers: { "content-type": "application/json", accept: "application/json" },
    body: body && JSON.stringify(body),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Nessie ${method} ${path} ${res.status}: ${data.message ?? ""} ${JSON.stringify(data.culprit ?? "")}`);
  return (data.objectCreated ?? data) as T;
}

async function newAccount(first: string, last: string, nickname: string, balance: number) {
  const customer = await nessie<{ _id: string }>("POST", "/customers", { first_name: first, last_name: last, address: ADDRESS });
  const account = await nessie<{ _id: string }>("POST", `/customers/${customer._id}/accounts`, {
    type: "Checking",
    nickname,
    rewards: 0,
    balance,
  });
  return { customerId: customer._id, accountId: account._id };
}

export async function ensureUserAccount(userId: string, name: string) {
  if (!bank.users[userId]) {
    const [first, ...rest] = name.replace(/[^\w ]/g, "").trim().split(/\s+/);
    bank.users[userId] = await newAccount(first || "Hacker", rest.join(" ") || "NC", `${name} checking`, STARTING_BALANCE);
    persist();
  }
  return bank.users[userId];
}

export async function ensurePool(spaceId: string) {
  if (!bank.pools[spaceId]) {
    bank.pools[spaceId] = (await newAccount("GroupCart", "Pool", `pool ${spaceId.slice(-8)}`, 0)).accountId;
    persist();
  }
  return bank.pools[spaceId];
}

export async function getBalance(accountId: string): Promise<number> {
  return (await nessie<{ balance: number }>("GET", `/accounts/${accountId}`)).balance;
}

export async function transfer(fromAccount: string, toAccount: string, amount: number, description: string) {
  return nessie<{ _id: string; status: string }>("POST", `/accounts/${fromAccount}/transfers`, {
    medium: "balance",
    payee_id: toAccount,
    amount,
    transaction_date: new Date().toISOString().slice(0, 10),
    description,
  });
}

async function ensureMerchant(retailer: Retailer) {
  if (!bank.merchants[retailer]) {
    const m = await nessie<{ _id: string }>("POST", "/merchants", {
      name: retailer[0].toUpperCase() + retailer.slice(1),
      category: ["shopping"],
      address: ADDRESS,
      geocode: { lat: 35.9132, lng: -79.0558 },
    });
    bank.merchants[retailer] = m._id;
    persist();
  }
  return bank.merchants[retailer]!;
}

export async function purchase(fromAccount: string, retailer: Retailer, amount: number, description: string) {
  return nessie<{ _id: string }>("POST", `/accounts/${fromAccount}/purchases`, {
    merchant_id: await ensureMerchant(retailer),
    medium: "balance",
    amount,
    purchase_date: new Date().toISOString().slice(0, 10),
    description,
  });
}
