import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { openDb } from "../src/db.ts";

const json = (method: string, body: unknown) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const live = { clientId: "id", clientSecret: "secret", baseUrl: "https://api-m.paypal.com" };
const sandbox = { ...live, baseUrl: "https://api-m.sandbox.paypal.com" };

describe("courier settings", () => {
  it("start off and can be saved", async () => {
    const app = createApp({ db: openDb(":memory:"), env: {} });
    expect(await (await app.request("/api/courier")).json()).toMatchObject({ enabled: false, ratePerKgCents: 2_200 });
    const res = await app.request("/api/courier", json("PUT", { enabled: true, ratePerKgCents: 2_350, minKg: 0.1, usSalesTaxPct: 7, importTaxPct: 0, pygPerUsd: 6_000 }));
    expect(await res.json()).toMatchObject({ enabled: true, ratePerKgCents: 2_350 });
  });

});

describe("refunds", () => {
  it("only refund Snagwise purchases inside the 24-hour window", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, env: { paypal: sandbox } });
    db.prepare("INSERT INTO transactions (id, date, amount_cents, currency, merchant, category, source, capture_id) VALUES ('old', ?, 1000, 'USD', 'shop.com', 'x', 'paypal', 'CAP1')").run(
      new Date(Date.now() - 25 * 60 * 60_000).toISOString(),
    );
    const list = (await (await app.request("/api/purchases")).json()) as { id: string; refundableUntil: string | null }[];
    expect(list[0]).toMatchObject({ id: "old", refundableUntil: null });
    expect((await app.request("/api/purchases/old/refund", { method: "POST" })).status).toBe(409);
    expect((await app.request("/api/purchases/missing/refund", { method: "POST" })).status).toBe(404);
  });
});

describe("sidequest rewards", () => {
  it("never pay with live PayPal credentials", async () => {
    const app = createApp({ db: openDb(":memory:"), env: { paypal: live } });
    expect(((await (await app.request("/api/rewards")).json()) as { available: boolean }).available).toBe(false);
    expect((await app.request("/api/rewards/deal_sharer/claim", { method: "POST" })).status).toBe(503);
  });

  it("ask for an email, and only pay finished sidequests", async () => {
    const app = createApp({ db: openDb(":memory:"), env: { paypal: sandbox } });
    const noEmail = await app.request("/api/rewards/deal_sharer/claim", { method: "POST" });
    expect(((await noEmail.json()) as { code: string }).code).toBe("no_email");
    await app.request("/api/rewards/email", json("PUT", { email: "buyer@personal.example.com" }));
    expect((await app.request("/api/rewards/deal_sharer/claim", { method: "POST" })).status).toBe(409); // not finished
    expect((await app.request("/api/rewards/first_swipe/claim", { method: "POST" })).status).toBe(404); // not a sidequest
  });
});
