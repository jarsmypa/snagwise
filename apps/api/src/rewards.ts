import type { Hono } from "hono";
import { z } from "zod";
import { achievementStates, ACHIEVEMENTS, type TasteProfile } from "@snagwise/core";
import { nowIso, type DB } from "./db.js";
import { shopperStats } from "./me.js";
import { isSandbox, sendPayout, type PayPalConfig } from "./paypal.js";

/*
  Sidequest rewards paid with PayPal Payouts: recommend deals, and when friends act on them you
  earn a small reward (in a real product, funded from the affiliate commission of those sales).
  Sandbox only: with live PayPal credentials this feature refuses to pay anything.
*/

const REWARD_CENTS: Record<string, number> = {
  deal_sharer: 100,
  crowd_pleaser: 100,
  fashion_advisor: 200,
  tech_guide: 200,
  home_scout: 200,
  trusted_voice: 500,
};

interface RewardRow {
  quest_id: string;
  amount_cents: number;
  batch_id: string;
  status: string;
  created_at: string;
}

export function registerRewards(
  app: Hono,
  db: DB,
  opts: { paypal: PayPalConfig | undefined; profile: () => TasteProfile; budget: () => { budgetCents: number; spentCents: number } },
) {
  const available = () => Boolean(opts.paypal && isSandbox(opts.paypal));
  const email = () => (db.prepare("SELECT value FROM settings WHERE key = 'reward_email'").get() as { value: string } | undefined)?.value ?? null;

  app.get("/api/rewards", (c) => {
    const paid = new Map((db.prepare("SELECT * FROM rewards").all() as unknown as RewardRow[]).map((r) => [r.quest_id, r]));
    return c.json({
      available: available(),
      email: email(),
      rewards: ACHIEVEMENTS.filter((a) => a.kind === "quest").map((a) => ({
        questId: a.id,
        amountCents: REWARD_CENTS[a.id] ?? 100,
        paid: paid.has(a.id) ? { status: paid.get(a.id)!.status, at: paid.get(a.id)!.created_at } : null,
      })),
    });
  });

  app.put("/api/rewards/email", async (c) => {
    const body = z.object({ email: z.email().max(200) }).parse(await c.req.json());
    db.prepare("INSERT INTO settings (key, value) VALUES ('reward_email', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(body.email);
    return c.json({ email: body.email });
  });

  app.post("/api/rewards/:questId/claim", async (c) => {
    if (!opts.paypal || !available()) return c.json({ error: "Rewards only run against the PayPal sandbox." }, 503);
    const questId = c.req.param("questId");
    const amount = REWARD_CENTS[questId];
    if (!amount) return c.json({ error: "Not a sidequest" }, 404);
    const receiver = email();
    if (!receiver) return c.json({ error: "Add the PayPal email that should receive rewards first.", code: "no_email" }, 409);
    const state = achievementStates(shopperStats(db, opts.profile(), opts.budget())).find((a) => a.id === questId);
    if (!state?.unlocked) return c.json({ error: "Finish this sidequest first." }, 409);
    if (db.prepare("SELECT 1 FROM rewards WHERE quest_id = ?").get(questId)) return c.json({ error: "Already paid" }, 409);

    // The batch id makes the payout idempotent on PayPal's side too.
    const batchId = `snagwise-${questId}-${Date.now()}`;
    const res = await sendPayout(opts.paypal, receiver, amount, `Snagwise sidequest: ${questId}`, batchId);
    db.prepare("INSERT INTO rewards (quest_id, amount_cents, receiver, batch_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      questId,
      amount,
      receiver,
      res.batch_header.payout_batch_id,
      res.batch_header.batch_status,
      nowIso(),
    );
    return c.json({ status: res.batch_header.batch_status, amountCents: amount });
  });
}
