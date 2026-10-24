import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { openDb } from "../src/db.ts";

const setup = () => createApp({ db: openDb(":memory:"), env: {} });
const json = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("api", () => {
  it("reports which integrations are configured", async () => {
    const res = await setup().request("/api/health");
    expect(await res.json()).toEqual({ ok: true, channel3: false, paypal: false });
  });

  it("stores the monthly budget", async () => {
    const app = setup();
    const res = await app.request("/api/budget", { ...json({ budgetCents: 50_000 }), method: "PUT" });
    expect(await res.json()).toMatchObject({ budgetCents: 50_000, spentCents: 0, remainingCents: 50_000 });
  });

  it("adds and lists wishlist items", async () => {
    const app = setup();
    const created = await app.request("/api/wishlist", json({ query: "noise cancelling headphones", targetCents: 15_000 }));
    expect(created.status).toBe(201);
    const list = (await (await app.request("/api/wishlist")).json()) as unknown[];
    expect(list).toHaveLength(1);
  });

  it("rejects invalid input", async () => {
    const res = await setup().request("/api/wishlist", json({ query: "x", targetCents: -1 }));
    expect(res.status).toBe(400);
  });

  it("refuses to order without PayPal configured", async () => {
    const res = await setup().request("/api/wishlist/nope/order", { method: "POST" });
    expect(res.status).toBe(503);
  });
});
