import type { Offer } from "./index.js";

/*
  "Play money": shop a real catalog with pretend money ("if I had $5,000…"). It scratches the
  itch without spending, and how people shop when money is no object says a lot about their taste.
  Insights are computed here, without AI, so they are instant and free. The UI words them.
*/

export type PlayStyle = "deal_hunter" | "big_ticket" | "spread_out" | "saver" | "all_in";

export interface PlayResult {
  budgetCents: number;
  spentCents: number;
  leftCents: number;
  items: number;
  categories: { category: string; cents: number; share: number }[];
  discountedShare: number; // 0..1 of items bought on a discount
  biggest: Offer | null;
  monthsOfBudget: number | null; // spent ÷ the user's real monthly budget
  styles: PlayStyle[];
}

export function cartTotal(cart: readonly Offer[]): number {
  return cart.reduce((sum, o) => sum + o.priceCents, 0);
}

export function playInsights(budgetCents: number, cart: readonly Offer[], monthlyBudgetCents?: number): PlayResult {
  const spentCents = cartTotal(cart);
  const byCategory = new Map<string, number>();
  for (const o of cart) byCategory.set(o.category ?? "Other", (byCategory.get(o.category ?? "Other") ?? 0) + o.priceCents);
  const categories = [...byCategory]
    .map(([category, cents]) => ({ category, cents, share: spentCents ? cents / spentCents : 0 }))
    .sort((a, b) => b.cents - a.cents);
  const discounted = cart.filter((o) => o.compareAtCents !== undefined && o.compareAtCents > o.priceCents).length;
  const discountedShare = cart.length ? discounted / cart.length : 0;
  const biggest = cart.reduce<Offer | null>((max, o) => (max === null || o.priceCents > max.priceCents ? o : max), null);

  const styles: PlayStyle[] = [];
  if (cart.length >= 2 && discountedShare >= 0.6) styles.push("deal_hunter");
  if (biggest && cart.length >= 2 && biggest.priceCents >= spentCents * 0.5) styles.push("big_ticket");
  if (byCategory.size >= 4) styles.push("spread_out");
  if (spentCents >= budgetCents * 0.9) styles.push("all_in");
  else if (spentCents < budgetCents * 0.5) styles.push("saver");

  return {
    budgetCents,
    spentCents,
    leftCents: budgetCents - spentCents,
    items: cart.length,
    categories,
    discountedShare,
    biggest,
    monthsOfBudget: monthlyBudgetCents ? spentCents / monthlyBudgetCents : null,
    styles,
  };
}
