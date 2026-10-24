import { toCents, type Offer } from "@snagwise/core";

/*
  Channel3 product search: https://docs.trychannel3.com/api-reference/v1/search
  We keep only the fields the app uses and flatten each product to its cheapest in-stock offer.
*/

const BASE = "https://api.trychannel3.com/v1";

interface C3Price {
  price: number;
  currency: string;
  compare_at_price?: number | null;
}

interface C3Product {
  id: string;
  title: string;
  images?: { url?: string }[];
  offers?: { url: string; domain: string; price: C3Price; availability?: string }[];
}

export async function searchProducts(apiKey: string, query: string, limit = 10): Promise<Offer[]> {
  const res = await fetch(`${BASE}/search`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({ query, limit }),
  });
  if (!res.ok) throw new Error(`Channel3 search failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { products: C3Product[] };

  const offers: Offer[] = [];
  for (const p of body.products) {
    const inStock = (p.offers ?? []).filter((o) => o.availability === undefined || o.availability === "InStock");
    const cheapest = inStock.sort((a, b) => a.price.price - b.price.price)[0];
    if (!cheapest) continue;
    const offer: Offer = {
      productId: p.id,
      title: p.title,
      url: cheapest.url,
      domain: cheapest.domain,
      priceCents: toCents(cheapest.price.price),
      currency: cheapest.price.currency,
    };
    if (cheapest.price.compare_at_price) offer.compareAtCents = toCents(cheapest.price.compare_at_price);
    const image = p.images?.[0]?.url;
    if (image) offer.imageUrl = image;
    offers.push(offer);
  }
  return offers;
}
