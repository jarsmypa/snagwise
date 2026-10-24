import { Hono } from "hono";
import { z } from "zod";
import { bestOffer, evaluateOffer, monthOf, remainingBudget, type Offer, type Transaction } from "@snagwise/core";
import { nowIso, type DB } from "./db.js";
import { searchProducts } from "./channel3.js";
import { captureOrder, createOrder, type PayPalConfig } from "./paypal.js";
import { registerDiscover } from "./discover.js";

export interface Env {
  channel3Key?: string;
  paypal?: PayPalConfig;
}

const CURRENCY = "USD";

interface WishRow {
  id: string;
  query: string;
  target_cents: number;
  currency: string;
  best_offer: string | null;
  last_checked_at: string | null;
}

interface TxRow {
  id: string;
  date: string;
  amount_cents: number;
  currency: string;
  merchant: string;
  category: string;
}

const toTx = (r: TxRow): Transaction => ({
  id: r.id,
  date: r.date,
  amountCents: r.amount_cents,
  currency: r.currency,
  merchant: r.merchant,
  category: r.category,
});

const toWish = (r: WishRow) => ({
  id: r.id,
  query: r.query,
  targetCents: r.target_cents,
  currency: r.currency,
  bestOffer: r.best_offer ? (JSON.parse(r.best_offer) as Offer) : null,
  lastCheckedAt: r.last_checked_at,
});

export function createApp({ db, env }: { db: DB; env: Env }) {
  const app = new Hono();

  const budgetCents = () => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'budget_cents'").get() as { value: string } | undefined;
    return row ? Number(row.value) : 0;
  };
  const transactions = () => (db.prepare("SELECT * FROM transactions ORDER BY date DESC").all() as unknown as TxRow[]).map(toTx);
  const budgetSummary = () => {
    const month = monthOf(nowIso());
    const total = budgetCents();
    const remaining = remainingBudget(total, transactions(), month, CURRENCY);
    return { month, currency: CURRENCY, budgetCents: total, spentCents: total - remaining, remainingCents: remaining };
  };
  const getWish = (id: string) => db.prepare("SELECT * FROM wishlist WHERE id = ?").get(id) as WishRow | undefined;

  app.get("/api/health", (c) =>
    c.json({ ok: true, channel3: Boolean(env.channel3Key), paypal: Boolean(env.paypal) }),
  );
  // The PayPal client id is public by design (the JS SDK needs it in the browser); the secret never leaves the server.
  app.get("/api/config", (c) => c.json({ paypalClientId: env.paypal?.clientId ?? null, currency: CURRENCY }));

  // Budget and spending
  app.get("/api/budget", (c) => c.json(budgetSummary()));
  app.put("/api/budget", async (c) => {
    const { budgetCents: value } = z.object({ budgetCents: z.number().int().min(0) }).parse(await c.req.json());
    db.prepare("INSERT INTO settings (key, value) VALUES ('budget_cents', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(value));
    return c.json(budgetSummary());
  });
  app.get("/api/transactions", (c) => c.json(transactions()));

  // Product search
  app.get("/api/search", async (c) => {
    if (!env.channel3Key) return c.json({ error: "CHANNEL3_API_KEY is not set" }, 503);
    const q = c.req.query("q")?.trim();
    if (!q) return c.json({ error: "Missing q" }, 400);
    return c.json(await searchProducts(env.channel3Key, q));
  });

  // Wishlist ("wallet" of saved deals)
  app.get("/api/wishlist", (c) =>
    c.json((db.prepare("SELECT * FROM wishlist ORDER BY created_at DESC").all() as unknown as WishRow[]).map(toWish)),
  );
  app.post("/api/wishlist", async (c) => {
    const body = z
      .object({ query: z.string().trim().min(2).max(200), targetCents: z.number().int().positive() })
      .parse(await c.req.json());
    const id = crypto.randomUUID();
    db.prepare("INSERT INTO wishlist (id, query, target_cents, currency, created_at) VALUES (?, ?, ?, ?, ?)").run(
      id,
      body.query,
      body.targetCents,
      CURRENCY,
      nowIso(),
    );
    return c.json(toWish(getWish(id)!), 201);
  });
  app.delete("/api/wishlist/:id", (c) => {
    db.prepare("DELETE FROM wishlist WHERE id = ?").run(c.req.param("id"));
    return c.body(null, 204);
  });

  // Price watch: re-search one item and say whether it is time to buy.
  app.post("/api/wishlist/:id/check", async (c) => {
    if (!env.channel3Key) return c.json({ error: "CHANNEL3_API_KEY is not set" }, 503);
    const row = getWish(c.req.param("id"));
    if (!row) return c.json({ error: "Not found" }, 404);
    const offer = bestOffer(await searchProducts(env.channel3Key, row.query), row.currency);
    db.prepare("UPDATE wishlist SET best_offer = ?, last_checked_at = ? WHERE id = ?").run(
      offer ? JSON.stringify(offer) : null,
      nowIso(),
      row.id,
    );
    const wish = toWish(getWish(row.id)!);
    const verdict = offer ? evaluateOffer(wish, offer, budgetSummary().remainingCents) : null;
    return c.json({ wish, verdict });
  });

  // Purchase: the server re-checks the rules, PayPal collects the user's approval, then we capture.
  app.post("/api/wishlist/:id/order", async (c) => {
    if (!env.paypal) return c.json({ error: "PayPal sandbox credentials are not set" }, 503);
    const row = getWish(c.req.param("id"));
    if (!row) return c.json({ error: "Not found" }, 404);
    const wish = toWish(row);
    if (!wish.bestOffer) return c.json({ error: "Check the price first" }, 409);
    const verdict = evaluateOffer(wish, wish.bestOffer, budgetSummary().remainingCents);
    if (!verdict.buy) return c.json({ error: "Rules say not to buy", verdict }, 409);
    const order = await createOrder(env.paypal, wish.bestOffer.priceCents, wish.currency, wish.bestOffer.title);
    return c.json({ orderId: order.id });
  });
  app.post("/api/orders/:orderId/capture", async (c) => {
    if (!env.paypal) return c.json({ error: "PayPal sandbox credentials are not set" }, 503);
    const { wishId } = z.object({ wishId: z.string() }).parse(await c.req.json());
    const row = getWish(wishId);
    if (!row?.best_offer) return c.json({ error: "Not found" }, 404);
    const offer = JSON.parse(row.best_offer) as Offer;
    const result = await captureOrder(env.paypal, c.req.param("orderId"));
    if (result.status === "COMPLETED") {
      db.prepare(
        "INSERT INTO transactions (id, date, amount_cents, currency, merchant, category, source) VALUES (?, ?, ?, ?, ?, 'wishlist', 'paypal')",
      ).run(result.id, nowIso(), offer.priceCents, offer.currency, offer.domain);
      db.prepare("DELETE FROM wishlist WHERE id = ?").run(wishId);
    }
    return c.json({ status: result.status, budget: budgetSummary() });
  });

  registerDiscover(app, db, env.channel3Key);

  // TODO(week 1): POST /api/agent — Claude tool-use loop over search, wishlist, budget and order proposals.

  app.onError((err, c) => {
    if (err instanceof z.ZodError) return c.json({ error: "Invalid request", issues: err.issues }, 400);
    console.error(err);
    return c.json({ error: "Something went wrong" }, 500);
  });

  return app;
}
