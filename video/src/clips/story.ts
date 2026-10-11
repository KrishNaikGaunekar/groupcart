// The one example every clip tells, with the numbers app/spectrum-bot would produce for it:
// each person pays for what they added, plus 7.25% tax in proportion; shipping is free from $35.
// The texts GroupCart sends are worded as the bot words them (app/spectrum-bot/src).

export const GROUP = "movie night";
export const CODE = "MOVI2";
export const ASK = "cart movie night find snacks under $15";

export const OFFERS = {
  popcorn: "Walmart · $8.98 · 4.6★\nButter Popcorn, 12 ct\nwalmart.com/ip/butter-popcorn-12ct",
  cola: "Walmart · $12.98 · 4.5★\nCola Mini Cans, 30 pk\nwalmart.com/ip/cola-mini-cans-30",
  gummy: "Amazon · $13.49 · 4.7★\nSour Gummy Worms, 5 lb\namazon.com/dp/sour-gummy-worms",
};

export const PEOPLE = [
  { name: "William", item: "Butter Popcorn, 12 ct", store: "Walmart", price: 8.98, owes: 9.63, tint: "#0A7CFF" },
  { name: "Justin", item: "Sour Gummy Worms, 5 lb", store: "Amazon", price: 13.49, owes: 14.47, tint: "#34C759" },
  { name: "Krish", item: "Cola Mini Cans, 30 pk", store: "Walmart", price: 12.98, owes: 13.92, tint: "#AF52DE" },
];
export const SUBTOTAL = 35.45;
export const TAX = 2.57;
export const TOTAL = 38.02;
export const TO_STORES = [
  { store: "Walmart", amount: 23.55 },
  { store: "Amazon", amount: 14.47 },
];

export const youOwe = (name: string, amount: number) => `${name}: you owe $${amount.toFixed(2)} — 👍 this to pay from your Capital One account`;
export const added = (name: string, total: number, count: number) => `added for ${name} to ${GROUP} ✓ cart is $${total.toFixed(2)} (${count} items). reply "remove" to that option to undo`;
export const usd = (n: number) => `$${n.toFixed(2)}`;
