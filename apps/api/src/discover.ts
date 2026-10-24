import type { Hono } from "hono";
import { z } from "zod";
import { buildProfile, scoreOffer, skillScore, topCategories, type Offer, type Reaction, type ShareStat, type Skill } from "@snagwise/core";
import { nowIso, type DB } from "./db.js";
import { searchProducts } from "./channel3.js";
import { SAMPLE_CATALOG } from "./sample-catalog.js";

// Where Discover starts before the user has given any signal, and where it keeps exploring after.
const STARTER_QUERIES = ["wireless headphones", "running shoes", "coffee gear", "camping gear", "desk setup", "video games"];
const DECK_SIZE = 10;
const MAX_IMAGE_BYTES = 5_000_000;

export const offerSchema = z.object({
  productId: z.string().min(1),
  title: z.string().min(1),
  url: z.url(),
  domain: z.string(),
  priceCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  compareAtCents: z.number().int().nonnegative().optional(),
  imageUrl: z.url().optional(),
  category: z.string().optional(),
  brand: z.string().optional(),
});

interface ReactionRow {
  product_id: string;
  category: string;
  brand: string | null;
  price_cents: number;
  liked: number;
  reasons: string;
  source: Reaction["source"];
}

interface ShareRow {
  id: string;
  offer: string;
  category: string;
  opens: number;
  saves: number;
  created_at: string;
}

const toReaction = (r: ReactionRow): Reaction => {
  const reaction: Reaction = {
    productId: r.product_id,
    category: r.category,
    priceCents: r.price_cents,
    liked: r.liked === 1,
    reasons: JSON.parse(r.reasons) as Reaction["reasons"],
    source: r.source,
  };
  if (r.brand) reaction.brand = r.brand;
  return reaction;
};

const shortId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 10);

// Without a Channel3 key, a word match over the dev-only sample catalog.
function searchSample(query: string): Offer[] {
  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  return SAMPLE_CATALOG.filter((o) => words.some((w) => `${o.title} ${o.category ?? ""}`.toLowerCase().includes(w)));
}

export function registerDiscover(app: Hono, db: DB, channel3Key: string | undefined, activeSkills: () => Skill[] = () => []) {
  const reactions = () => (db.prepare("SELECT * FROM reactions").all() as unknown as ReactionRow[]).map(toReaction);
  const shareStats = (): ShareStat[] =>
    (db.prepare("SELECT category, SUM(opens) AS opens, SUM(saves) AS saves FROM shares GROUP BY category").all() as unknown as ShareStat[]);
  const profile = () => buildProfile(reactions(), shareStats());
  const getShare = (id: string) => db.prepare("SELECT * FROM shares WHERE id = ?").get(id) as ShareRow | undefined;

  const saveReaction = (offer: Offer, liked: boolean, reasons: Reaction["reasons"], source: Reaction["source"]) =>
    db
      .prepare(
        `INSERT INTO reactions (product_id, offer, category, brand, price_cents, liked, reasons, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(product_id) DO UPDATE SET liked = excluded.liked, reasons = excluded.reasons, source = excluded.source, created_at = excluded.created_at`,
      )
      .run(offer.productId, JSON.stringify(offer), offer.category ?? "Other", offer.brand ?? null, offer.priceCents, liked ? 1 : 0, JSON.stringify(reasons), source, nowIso());

  // A deck of offers ranked by the learned profile, with a little randomness so it keeps exploring.
  // Candidates ranked by taste and active skills, with a little randomness so it keeps exploring.
  const deck = async (size: number, skipSeen: boolean): Promise<Offer[]> => {
    const p = profile();
    const seen = skipSeen ? new Set(reactions().map((r) => r.productId)) : new Set<string>();
    const skills = activeSkills();
    let candidates: Offer[];
    if (channel3Key) {
      const explore = STARTER_QUERIES[Math.floor(Math.random() * STARTER_QUERIES.length)]!;
      // Active skills say what the user is shopping for, so their first category joins the mix. Capped at 3 searches.
      const fromSkills = skills.map((s) => s.categories[0]).filter((x): x is string => Boolean(x));
      const queries = [...new Set([...topCategories(p, 2), ...fromSkills, explore])].slice(0, 3);
      const results = await Promise.all(queries.map((q) => searchProducts(channel3Key, q, 10)));
      candidates = [...new Map(results.flat().map((o) => [o.productId, o])).values()];
    } else {
      candidates = SAMPLE_CATALOG;
    }
    return candidates
      .filter((o) => !seen.has(o.productId))
      .map((o) => ({ o, score: scoreOffer(p, o) + skillScore(skills, o) + Math.random() * 1.5 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, size)
      .map(({ o }) => o);
  };

  app.get("/api/discover", async (c) => c.json({ sample: !channel3Key, cards: await deck(DECK_SIZE, true) }));

  app.post("/api/reactions", async (c) => {
    const body = z
      .object({ offer: offerSchema, liked: z.boolean(), reasons: z.array(z.enum(["product", "price"])).max(2) })
      .parse(await c.req.json());
    const offer = body.offer as Offer;
    saveReaction(offer, body.liked, body.liked ? body.reasons : [], "swipe");
    return c.json({ profile: profile() });
  });

  app.get("/api/profile", (c) => {
    const p = profile();
    return c.json({ profile: p, top: topCategories(p, 5) });
  });

  // Recommendation cards: a public link (behind the QR) that anyone can open.
  app.post("/api/shares", async (c) => {
    const { offer } = z.object({ offer: offerSchema }).parse(await c.req.json());
    const id = shortId();
    db.prepare("INSERT INTO shares (id, offer, category, created_at) VALUES (?, ?, ?, ?)").run(id, JSON.stringify(offer), offer.category ?? "Other", nowIso());
    return c.json({ id }, 201);
  });

  app.get("/api/shares/:id", (c) => {
    const row = getShare(c.req.param("id"));
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ id: row.id, offer: JSON.parse(row.offer) as Offer, createdAt: row.created_at, opens: row.opens, saves: row.saves });
  });

  // Scanning the QR teaches the sharer's profile which recommendations land.
  app.post("/api/shares/:id/open", (c) => {
    const res = db.prepare("UPDATE shares SET opens = opens + 1 WHERE id = ?").run(c.req.param("id"));
    return res.changes ? c.body(null, 204) : c.json({ error: "Not found" }, 404);
  });

  // Saving a referred deal: a strong taste signal for the person who saves it, and a "save" for the card.
  app.post("/api/shares/:id/save", (c) => {
    const row = getShare(c.req.param("id"));
    if (!row) return c.json({ error: "Not found" }, 404);
    const offer = JSON.parse(row.offer) as Offer;
    db.exec("BEGIN");
    db.prepare("UPDATE shares SET saves = saves + 1 WHERE id = ?").run(row.id);
    saveReaction(offer, true, ["product", "price"], "referral");
    db.prepare(
      "INSERT INTO wishlist (id, query, target_cents, currency, best_offer, last_checked_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(crypto.randomUUID(), offer.title, offer.priceCents, offer.currency, row.offer, row.created_at, nowIso());
    db.exec("COMMIT");
    return c.json({ saved: true });
  });

  // Same-origin copy of the product photo so the browser can draw it on the card canvas.
  // Only the image stored with this share is fetched, never an arbitrary URL.
  app.get("/api/shares/:id/image", async (c) => {
    const row = getShare(c.req.param("id"));
    const url = row ? (JSON.parse(row.offer) as Offer).imageUrl : undefined;
    if (!url || !/^https:\/\//.test(url)) return c.json({ error: "No image" }, 404);
    const res = await fetch(url);
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return c.json({ error: "Image unavailable" }, 502);
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > MAX_IMAGE_BYTES) return c.json({ error: "Image too large" }, 502);
    return c.body(bytes, 200, { "content-type": type, "cache-control": "public, max-age=86400" });
  });

  return {
    profile,
    deck,
    sample: !channel3Key,
    // Play-money picks never overwrite what the user said for real in Discover.
    savePlayPick: (offer: Offer) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO reactions (product_id, offer, category, brand, price_cents, liked, reasons, source, created_at) VALUES (?, ?, ?, ?, ?, 1, '[]', 'game', ?)",
        )
        .run(offer.productId, JSON.stringify(offer), offer.category ?? "Other", offer.brand ?? null, offer.priceCents, nowIso()),
    search: (query: string) => (channel3Key ? searchProducts(channel3Key, query, 10) : Promise.resolve(searchSample(query))),
  };
}
