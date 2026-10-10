// Product search + checkout links. Uses SerpAPI when SERPAPI_KEY is set, otherwise mock data.
// OWNER: commerce worktree.
import type { CartItem, Product, Retailer } from "../types.js";

const SERP = "https://serpapi.com/search.json";

async function serp(params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ ...params, api_key: process.env.SERPAPI_KEY! });
  const res = await fetch(`${SERP}?${qs}`);
  if (!res.ok) throw new Error(`SerpAPI ${res.status}: ${await res.text()}`);
  return res.json();
}

async function searchAmazon(q: string): Promise<Product[]> {
  const data = await serp({ engine: "amazon", k: q, amazon_domain: "amazon.com" });
  return (data.organic_results ?? [])
    .filter((r: any) => r.asin && r.extracted_price)
    .slice(0, 4)
    .map((r: any) => ({
      id: r.asin,
      retailer: "amazon" as const,
      title: r.title,
      price: r.extracted_price,
      url: `https://www.amazon.com/dp/${r.asin}`,
      image: r.thumbnail,
      rating: r.rating,
    }));
}

async function searchWalmart(q: string): Promise<Product[]> {
  const data = await serp({ engine: "walmart", query: q });
  return (data.organic_results ?? [])
    .filter((r: any) => r.us_item_id && r.primary_offer?.offer_price)
    .slice(0, 4)
    .map((r: any) => ({
      id: String(r.us_item_id),
      retailer: "walmart" as const,
      title: r.title,
      price: r.primary_offer.offer_price,
      url: r.product_page_url ?? `https://www.walmart.com/ip/${r.us_item_id}`,
      image: r.thumbnail,
      rating: r.rating,
    }));
}

function mockSearch(q: string): Product[] {
  const base = 5 + (q.length % 7) * 3;
  const mk = (retailer: Retailer, i: number, mult: number): Product => ({
    id: `${retailer}-${q.replace(/\W+/g, "-")}-${i}`,
    retailer,
    title: `${q} (${["Value", "Popular", "Premium"][i]} pick)`,
    price: Math.round(base * mult * 100) / 100,
    url: `https://www.${retailer}.com/s?k=${encodeURIComponent(q)}`,
    rating: 4 + i / 10,
  });
  return [mk("walmart", 0, 0.9), mk("amazon", 1, 1), mk("target", 2, 1.25)];
}

/** Search across retailers, return the cheapest few, deduped by retailer variety. */
export async function searchProducts(query: string, maxPrice?: number): Promise<Product[]> {
  let results: Product[];
  if (!process.env.SERPAPI_KEY) {
    results = mockSearch(query);
  } else {
    const settled = await Promise.allSettled([searchAmazon(query), searchWalmart(query)]);
    results = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
    for (const s of settled) if (s.status === "rejected") console.warn("search failed:", s.reason);
  }
  if (maxPrice) results = results.filter((p) => p.price <= maxPrice);
  return results.sort((a, b) => a.price - b.price).slice(0, 3);
}

/** One link per retailer that loads all of that retailer's items into the user's cart. */
export function checkoutLinks(items: CartItem[]): { retailer: Retailer; url: string }[] {
  const by = new Map<Retailer, CartItem[]>();
  for (const it of items) by.set(it.product.retailer, [...(by.get(it.product.retailer) ?? []), it]);
  const links: { retailer: Retailer; url: string }[] = [];
  for (const [retailer, list] of by) {
    if (retailer === "amazon") {
      const qs = list.map((it, i) => `ASIN.${i + 1}=${it.product.id}&Quantity.${i + 1}=${it.qty}`).join("&");
      links.push({ retailer, url: `https://www.amazon.com/gp/aws/cart/add.html?${qs}` });
    } else if (retailer === "walmart") {
      const qs = list.map((it) => `${it.product.id}|${it.qty}`).join(",");
      links.push({ retailer, url: `https://affil.walmart.com/cart/addToCart?items=${qs}` });
    } else {
      for (const it of list) links.push({ retailer, url: it.product.url });
    }
  }
  return links;
}

// Free-shipping thresholds used for the group-buy nudge.
export const FREE_SHIPPING: Partial<Record<Retailer, number>> = { amazon: 35, walmart: 35, target: 35 };
