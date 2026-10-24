import { describe, expect, it } from "vitest";
import {
  bestOffer,
  evaluateOffer,
  formatCents,
  remainingBudget,
  savingsCents,
  spentInMonth,
  toCents,
  type Offer,
  type Transaction,
  type WishItem,
} from "../src/index.ts";

const txs: Transaction[] = [
  { id: "1", date: "2026-11-02T10:00:00Z", amountCents: 4_000, currency: "USD", merchant: "Grocer", category: "food" },
  { id: "2", date: "2026-11-09T10:00:00Z", amountCents: 6_000, currency: "USD", merchant: "Gas", category: "transport" },
  { id: "3", date: "2026-10-30T10:00:00Z", amountCents: 9_999, currency: "USD", merchant: "Old", category: "other" },
  { id: "4", date: "2026-11-10T10:00:00Z", amountCents: 1_000, currency: "EUR", merchant: "Abroad", category: "other" },
];

const item: WishItem = { id: "w1", query: "trail running shoes size 42", targetCents: 8_000, currency: "USD" };

const offer = (priceCents: number, extra: Partial<Offer> = {}): Offer => ({
  productId: "p",
  title: "Shoe",
  url: "https://example.com",
  domain: "example.com",
  priceCents,
  currency: "USD",
  ...extra,
});

describe("budget", () => {
  it("counts only the month and currency asked for", () => {
    expect(spentInMonth(txs, "2026-11", "USD")).toBe(10_000);
    expect(remainingBudget(30_000, txs, "2026-11", "USD")).toBe(20_000);
  });
});

describe("evaluateOffer", () => {
  it("buys when the price is within target and budget", () => {
    expect(evaluateOffer(item, offer(7_500), 20_000)).toEqual({ buy: true, reason: "within_target_and_budget" });
  });

  it("waits when the price is above target", () => {
    expect(evaluateOffer(item, offer(8_001), 20_000).buy).toBe(false);
  });

  it("refuses when the budget would be exceeded", () => {
    expect(evaluateOffer(item, offer(7_500), 7_000)).toEqual({ buy: false, reason: "over_budget" });
  });

  it("refuses a different currency instead of guessing an exchange rate", () => {
    expect(evaluateOffer(item, offer(10, { currency: "EUR" }), 20_000).reason).toBe("currency_mismatch");
  });
});

describe("offers", () => {
  it("picks the cheapest offer in the currency", () => {
    const offers = [offer(9_000), offer(7_000), offer(5_000, { currency: "EUR" })];
    expect(bestOffer(offers, "USD")?.priceCents).toBe(7_000);
  });

  it("reports savings only against a higher list price", () => {
    expect(savingsCents(offer(7_000, { compareAtCents: 9_500 }))).toBe(2_500);
    expect(savingsCents(offer(7_000))).toBe(0);
  });

  it("converts money without floating-point drift", () => {
    expect(toCents(19.99)).toBe(1_999);
    expect(formatCents(1_999)).toBe("19.99");
  });
});
