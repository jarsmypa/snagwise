import type { Hono } from "hono";
import { z } from "zod";
import { cartTotal, playInsights, topCategories, type Offer, type TasteProfile } from "@snagwise/core";
import { nowIso, type DB } from "./db.js";
import { offerSchema } from "./discover.js";

/*
  Play money store: a real catalog, pretend money, nothing is charged. The cart teaches the taste
  profile (lightly), and the result can turn any pick into a real wallet item with a target price.
*/

const STORE_SIZE = 16;
const MAX_PLAY_BUDGET_CENTS = 10_000_000; // $100,000 of pretend money is plenty
// Classic "if I had the money" wishes, so the store feels like a real wish list and not just more of
// what the user already likes. Three are drawn per visit, next to the user's favourite category.
const WISH_QUERIES = [
  "noise cancelling headphones",
  "running sneakers",
  "smartwatch",
  "game console",
  "mirrorless camera",
  "espresso machine",
  "carry-on suitcase",
  "designer sunglasses",
  "electric scooter",
  "standing desk",
  "tablet",
  "perfume",
];

const pick = <T,>(list: readonly T[], n: number): T[] => [...list].sort(() => Math.random() - 0.5).slice(0, n);

export function registerPlay(
  app: Hono,
  db: DB,
  opts: {
    deck: (size: number, skipSeen: boolean) => Promise<Offer[]>;
    search: (query: string) => Promise<Offer[]>;
    sample: boolean;
    savePlayPick: (offer: Offer) => void;
    profile: () => TasteProfile;
    monthlyBudgetCents: () => number;
  },
) {
  app.get("/api/play/store", async (c) => {
    // The sample catalog is tiny: just show it ranked.
    if (opts.sample) return c.json({ sample: true, items: await opts.deck(STORE_SIZE, false) });
    const queries = [...topCategories(opts.profile(), 1), ...pick(WISH_QUERIES, 3)];
    const results = await Promise.all(queries.map((q) => opts.search(q).catch(() => [] as Offer[])));
    // Take a few from each search so no single category floods the shelves.
    const perQuery = Math.ceil(STORE_SIZE / queries.length);
    const items = [...new Map(results.flatMap((r) => r.slice(0, perQuery)).map((o) => [o.productId, o])).values()];
    return c.json({ sample: false, items: pick(items, STORE_SIZE) });
  });

  app.post("/api/play/checkout", async (c) => {
    const body = z
      .object({ budgetCents: z.number().int().positive().max(MAX_PLAY_BUDGET_CENTS), items: z.array(offerSchema).min(1).max(30) })
      .parse(await c.req.json());
    const cart = body.items as Offer[];
    if (cartTotal(cart) > body.budgetCents) return c.json({ error: "That cart is over your play money." }, 400);

    for (const offer of cart) opts.savePlayPick(offer);
    db.prepare("INSERT INTO play_runs (id, budget_cents, items, created_at) VALUES (?, ?, ?, ?)").run(
      crypto.randomUUID(),
      body.budgetCents,
      JSON.stringify(cart),
      nowIso(),
    );
    const monthly = opts.monthlyBudgetCents();
    return c.json({
      result: playInsights(body.budgetCents, cart, monthly || undefined),
      learned: topCategories(opts.profile(), 3),
    });
  });
}
