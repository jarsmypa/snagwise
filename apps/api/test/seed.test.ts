import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { openDb } from "../src/db.ts";
import { DEMO_BUDGET_CENTS, seedDemo } from "../src/seed.ts";

describe("seedDemo", () => {
  it("never creates expenses after today", () => {
    const db = openDb(":memory:");
    seedDemo(db, new Date("2026-11-10T12:00:00Z"));
    const rows = db.prepare("SELECT date FROM transactions WHERE date LIKE '2026-11-%'").all() as { date: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.date <= "2026-11-10T23:59:59Z")).toBe(true);
  });

  it("is idempotent", () => {
    const db = openDb(":memory:");
    const now = new Date("2026-11-10T12:00:00Z");
    seedDemo(db, now);
    seedDemo(db, now);
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number };
    const { w } = db.prepare("SELECT COUNT(*) AS w FROM wishlist").get() as { w: number };
    expect(w).toBe(3);
    expect(n).toBeLessThan(14 * 3);
  });

  it("leaves budget room so the demo purchase can go through", async () => {
    const db = openDb(":memory:");
    seedDemo(db);
    const budget = (await (await createApp({ db, env: {} }).request("/api/budget")).json()) as { budgetCents: number; remainingCents: number };
    expect(budget.budgetCents).toBe(DEMO_BUDGET_CENTS);
    expect(budget.remainingCents).toBeGreaterThan(15_000);
  });
});
