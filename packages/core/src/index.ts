/*
  Pure rules shared by the API and the web app. Money is always integer cents,
  so budgets never drift by floating-point rounding.
*/

export interface Transaction {
  id: string;
  date: string; // ISO 8601
  amountCents: number; // positive = money spent
  currency: string;
  merchant: string;
  category: string;
}

export interface WishItem {
  id: string;
  query: string; // what the user asked for, in their own words
  targetCents: number; // buy at or below this price
  currency: string;
}

export interface Offer {
  productId: string;
  title: string;
  url: string;
  domain: string;
  priceCents: number;
  currency: string;
  compareAtCents?: number; // list price before the discount, when the store shows one
  imageUrl?: string;
  category?: string;
  brand?: string;
  weightGrams?: number; // shipping weight, when the store publishes it
}

export type Verdict =
  | { buy: true; reason: "within_target_and_budget" }
  | { buy: false; reason: "currency_mismatch" | "above_target" | "over_budget" };

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function spentInMonth(txs: readonly Transaction[], month: string, currency: string): number {
  return txs
    .filter((t) => monthOf(t.date) === month && t.currency === currency)
    .reduce((sum, t) => sum + t.amountCents, 0);
}

export function remainingBudget(
  budgetCents: number,
  txs: readonly Transaction[],
  month: string,
  currency: string,
): number {
  return budgetCents - spentInMonth(txs, month, currency);
}

// The agent only proposes a purchase when this says yes; the user still approves it.
// costCents: what the purchase really takes from the budget (e.g. landed in Asunción). Defaults to the price.
export function evaluateOffer(item: WishItem, offer: Offer, remainingCents: number, costCents = offer.priceCents): Verdict {
  if (offer.currency !== item.currency) return { buy: false, reason: "currency_mismatch" };
  if (offer.priceCents > item.targetCents) return { buy: false, reason: "above_target" };
  if (costCents > remainingCents) return { buy: false, reason: "over_budget" };
  return { buy: true, reason: "within_target_and_budget" };
}

export function savingsCents(offer: Offer): number {
  if (offer.compareAtCents === undefined) return 0;
  return Math.max(0, offer.compareAtCents - offer.priceCents);
}

export function bestOffer(offers: readonly Offer[], currency: string): Offer | undefined {
  return offers
    .filter((o) => o.currency === currency)
    .reduce<Offer | undefined>((best, o) => (best === undefined || o.priceCents < best.priceCents ? o : best), undefined);
}

const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Re-pricing a wallet item must follow the SAME product, never the cheapest lookalike from a text search:
// same product id first, then the same title. Without a saved offer, the cheapest result is the starting point.
export function trackOffer(saved: Offer | null, offers: readonly Offer[], currency: string): Offer | undefined {
  if (!saved) return bestOffer(offers, currency);
  const sameId = offers.filter((o) => o.productId === saved.productId);
  if (sameId.length) return bestOffer(sameId, currency);
  const title = normTitle(saved.title);
  return bestOffer(
    offers.filter((o) => normTitle(o.title) === title),
    currency,
  );
}

// Alert when a watched item reaches the target, or keeps dropping once there. Never twice for the same price.
export function shouldAlert(previous: Offer | null, next: Offer, targetCents: number): boolean {
  if (next.priceCents > targetCents) return false;
  if (!previous) return true;
  return previous.priceCents > targetCents || next.priceCents < previous.priceCents;
}

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

// Plain decimal for APIs (PayPal amounts must not have separators).
export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

// For people: "$1,500.00".
export function formatMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export * from "./taste.js";
export * from "./skills.js";
export * from "./play.js";
export * from "./achievements.js";
export * from "./landed.js";
