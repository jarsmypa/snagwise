import { describe, expect, it } from "vitest";
import { budgetCost, DEFAULT_COURIER, evaluateOffer, formatGuaranies, landedCost, toGuaranies, type Offer } from "../src/index.ts";

const offer = (over: Partial<Offer> = {}): Offer => ({
  productId: "p",
  title: "Headphones",
  url: "https://example.com",
  domain: "example.com",
  priceCents: 10_000,
  currency: "USD",
  category: "Over-Ear Headphones",
  ...over,
});
const on = { ...DEFAULT_COURIER, enabled: true };

describe("landedCost", () => {
  it("adds Florida sales tax, courier by the tenth of a kilo and import tax", () => {
    const l = landedCost(offer({ weightGrams: 340 }), { ...on, importTaxPct: 10 });
    expect(l).toMatchObject({ salesTaxCents: 700, weightKg: 0.4, courierCents: 880, importTaxCents: 1_000, weightEstimated: false });
    expect(l.totalCents).toBe(10_000 + 700 + 880 + 1_000);
  });

  it("estimates the weight from the kind of product when the store doesn't say", () => {
    const l = landedCost(offer(), on);
    expect(l).toMatchObject({ weightKg: 0.6, weightEstimated: true });
  });

  it("charges at least the minimum weight and flags the USD 1,000 personal limit", () => {
    expect(landedCost(offer({ weightGrams: 20 }), on).weightKg).toBe(0.1);
    expect(landedCost(offer({ priceCents: 120_000 }), on).overPersonalLimit).toBe(true);
  });
});

describe("budget with a courier", () => {
  it("uses the landed cost only when the courier is on", () => {
    expect(budgetCost(offer({ weightGrams: 500 }), null)).toBe(10_000);
    expect(budgetCost(offer({ weightGrams: 500 }), on)).toBe(10_000 + 700 + 1_100);
  });

  it("can refuse a purchase whose price fits but whose landed cost does not", () => {
    const item = { id: "w", query: "q", targetCents: 12_000, currency: "USD" };
    const o = offer({ weightGrams: 500 });
    expect(evaluateOffer(item, o, 11_000).buy).toBe(true);
    expect(evaluateOffer(item, o, 11_000, budgetCost(o, on))).toEqual({ buy: false, reason: "over_budget" });
  });
});

describe("guaraníes", () => {
  it("convert and round to the thousand", () => {
    expect(toGuaranies(11_995, 6_000)).toBe(720_000);
    expect(formatGuaranies(720_000)).toMatch(/^Gs\. 720.000$/);
  });
});
