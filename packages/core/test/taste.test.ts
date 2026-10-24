import { describe, expect, it } from "vitest";
import { buildProfile, scoreOffer, topCategories, type Offer, type Reaction } from "../src/index.ts";

const r = (over: Partial<Reaction>): Reaction => ({
  productId: "p",
  category: "headphones",
  priceCents: 20_000,
  liked: true,
  reasons: ["product", "price"],
  source: "swipe",
  ...over,
});

const offer = (over: Partial<Offer>): Offer => ({
  productId: "x",
  title: "X",
  url: "https://example.com",
  domain: "example.com",
  priceCents: 10_000,
  currency: "USD",
  ...over,
});

describe("buildProfile", () => {
  it("learns liked and disliked categories", () => {
    const p = buildProfile([r({}), r({ category: "shoes", liked: false, reasons: [] })]);
    expect(p.categories.headphones).toBeGreaterThan(0);
    expect(p.categories.shoes).toBeLessThan(0);
    expect(topCategories(p, 3)).toEqual(["headphones"]);
  });

  it("lowers the price ceiling when only the product was liked", () => {
    const p = buildProfile([r({ reasons: ["product"], priceCents: 20_000 })]);
    expect(p.priceCeilings.headphones).toBe(17_000);
  });

  it("raises the ceiling when the price was liked", () => {
    const p = buildProfile([r({ reasons: ["product"], priceCents: 20_000 }), r({ reasons: ["price"], priceCents: 18_000 })]);
    expect(p.priceCeilings.headphones).toBe(18_000);
  });

  it("weighs a referral save more than a swipe", () => {
    const swipe = buildProfile([r({ reasons: ["product"] })]);
    const referral = buildProfile([r({ reasons: ["product", "price"], source: "referral" })]);
    expect(referral.categories.headphones!).toBeGreaterThan(swipe.categories.headphones!);
  });

  it("learns from how shared cards performed", () => {
    const p = buildProfile([], [{ category: "coffee", opens: 4, saves: 2 }]);
    expect(p.categories.coffee).toBe(3);
    expect(p.signals).toBe(6);
  });
});

describe("scoreOffer", () => {
  it("prefers liked categories and penalises prices above the ceiling", () => {
    const p = buildProfile([r({ reasons: ["product"], priceCents: 20_000 })]);
    const cheap = scoreOffer(p, offer({ category: "headphones", priceCents: 15_000 }));
    const pricey = scoreOffer(p, offer({ category: "headphones", priceCents: 25_000 }));
    const other = scoreOffer(p, offer({ category: "lamps" }));
    expect(cheap).toBeGreaterThan(pricey);
    expect(cheap).toBeGreaterThan(other);
  });
});
