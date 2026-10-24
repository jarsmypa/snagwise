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
export function evaluateOffer(item: WishItem, offer: Offer, remainingCents: number): Verdict {
  if (offer.currency !== item.currency) return { buy: false, reason: "currency_mismatch" };
  if (offer.priceCents > item.targetCents) return { buy: false, reason: "above_target" };
  if (offer.priceCents > remainingCents) return { buy: false, reason: "over_budget" };
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

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
