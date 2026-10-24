import { describe, expect, it } from "vitest";
import type { Offer, PlayResult } from "@snagwise/core";
import { createApp } from "../src/app.ts";
import { openDb } from "../src/db.ts";
import { seedDemo } from "../src/seed.ts";

const post = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const setup = () => {
  const db = openDb(":memory:");
  seedDemo(db);
  return createApp({ db, env: {} });
};

describe("play money store", () => {
  it("serves a store and checks out a cart without charging anything", async () => {
    const app = setup();
    const store = (await (await app.request("/api/play/store")).json()) as { items: Offer[] };
    expect(store.items.length).toBeGreaterThan(5);
    const cart = store.items.slice(0, 3);
    const total = cart.reduce((s, o) => s + o.priceCents, 0);

    const res = await app.request("/api/play/checkout", post({ budgetCents: 500_000, items: cart }));
    const body = (await res.json()) as { result: PlayResult; learned: string[] };
    expect(res.status).toBe(200);
    expect(body.result.spentCents).toBe(total);
    expect(body.result.monthsOfBudget).toBeGreaterThan(0);
    expect(body.learned.length).toBeGreaterThan(0);

    // Pretend money never touches real spending.
    const savings = (await (await app.request("/api/savings")).json()) as { purchases: number };
    expect(savings.purchases).toBe(0);
  });

  it("rejects a cart over the play money", async () => {
    const app = setup();
    const store = (await (await app.request("/api/play/store")).json()) as { items: Offer[] };
    const res = await app.request("/api/play/checkout", post({ budgetCents: 100, items: store.items.slice(0, 2) }));
    expect(res.status).toBe(400);
  });

  it("never overwrites a real swipe with a play-money pick", async () => {
    const app = setup();
    const store = (await (await app.request("/api/play/store")).json()) as { items: Offer[] };
    const item = store.items[0]!;
    await app.request("/api/reactions", post({ offer: item, liked: false, reasons: [] }));
    await app.request("/api/play/checkout", post({ budgetCents: 10_000_000, items: [item] }));
    const { profile } = (await (await app.request("/api/profile")).json()) as { profile: { categories: Record<string, number> } };
    expect(profile.categories[item.category!]).toBeLessThan(0);
  });
});
