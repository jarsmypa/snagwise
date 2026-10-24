import { describe, expect, it } from "vitest";
import { buildProfile, playInsights, type Offer } from "../src/index.ts";

const o = (id: string, priceCents: number, category: string, compareAtCents?: number): Offer => ({
  productId: id,
  title: id,
  url: "https://example.com",
  domain: "example.com",
  priceCents,
  currency: "USD",
  category,
  ...(compareAtCents ? { compareAtCents } : {}),
});

describe("playInsights", () => {
  it("summarises a play-money cart", () => {
    const r = playInsights(100_000, [o("tent", 50_000, "Camping", 70_000), o("lamp", 5_000, "Lamps", 9_000), o("mug", 2_000, "Kitchen")], 150_000);
    expect(r).toMatchObject({ spentCents: 57_000, leftCents: 43_000, items: 3 });
    expect(r.categories[0]).toMatchObject({ category: "Camping", cents: 50_000 });
    expect(r.discountedShare).toBeCloseTo(2 / 3);
    expect(r.biggest?.productId).toBe("tent");
    expect(r.monthsOfBudget).toBeCloseTo(0.38, 2);
    expect(r.styles).toEqual(["deal_hunter", "big_ticket"]);
  });

  it("names spenders and savers", () => {
    expect(playInsights(10_000, [o("a", 9_500, "A")]).styles).toContain("all_in");
    expect(playInsights(10_000, [o("a", 1_000, "A")]).styles).toContain("saver");
    const spread = playInsights(100_000, [o("a", 10_000, "A"), o("b", 10_000, "B"), o("c", 10_000, "C"), o("d", 10_000, "D")]);
    expect(spread.styles).toContain("spread_out");
  });
});

describe("play-money picks in the taste profile", () => {
  it("count for categories but never move price ceilings", () => {
    const p = buildProfile([{ productId: "t", category: "Camping", priceCents: 50_000, liked: true, reasons: ["product", "price"], source: "game" }]);
    expect(p.categories.Camping).toBe(1);
    expect(p.priceCeilings.Camping).toBeUndefined();
  });
});
