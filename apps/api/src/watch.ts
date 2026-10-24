import type { Hono } from "hono";
import { shouldAlert, trackOffer, type Offer } from "@snagwise/core";
import { nowIso, type DB } from "./db.js";

/*
  Price watch and alerts. The watch re-checks every wallet item so a drop to the target shows up
  without the user pressing "Check price". One search per item per run keeps it inside
  Channel3's free 1,000 searches a month (e.g. 5 items every 6 hours ≈ 600 a month).
  It follows the same product the user saved, never a cheaper lookalike.
*/

interface WatchedItem {
  id: string;
  query: string;
  currency: string;
  target_cents: number;
  best_offer: string | null;
}

// Saves the new price and raises an alert when it reaches the target. Returns true when an alert was created.
export function recordPrice(db: DB, item: WatchedItem, offer: Offer): boolean {
  const previous = item.best_offer ? (JSON.parse(item.best_offer) as Offer) : null;
  db.prepare("UPDATE wishlist SET best_offer = ?, last_checked_at = ? WHERE id = ?").run(JSON.stringify(offer), nowIso(), item.id);
  if (!shouldAlert(previous, offer, item.target_cents)) return false;
  db.prepare("INSERT INTO alerts (id, wish_id, title, store, price_cents, target_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    crypto.randomUUID(),
    item.id,
    offer.title,
    offer.domain,
    offer.priceCents,
    item.target_cents,
    nowIso(),
  );
  return true;
}

export async function refreshWalletPrices(db: DB, search: (query: string) => Promise<Offer[]>): Promise<{ updated: number; alerts: number }> {
  const items = db.prepare("SELECT id, query, currency, target_cents, best_offer FROM wishlist").all() as unknown as WatchedItem[];
  let updated = 0;
  let alerts = 0;
  for (const item of items) {
    try {
      const saved = item.best_offer ? (JSON.parse(item.best_offer) as Offer) : null;
      const offer = trackOffer(saved, await search(item.query), item.currency);
      if (!offer) continue;
      if (recordPrice(db, item, offer)) alerts++;
      updated++;
    } catch (err) {
      console.warn(`Price watch skipped "${item.query}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { updated, alerts };
}

interface AlertRow {
  id: string;
  wish_id: string;
  title: string;
  store: string;
  price_cents: number;
  target_cents: number;
  created_at: string;
  read_at: string | null;
}

export function unreadAlerts(db: DB) {
  return (db.prepare("SELECT * FROM alerts WHERE read_at IS NULL ORDER BY created_at DESC").all() as unknown as AlertRow[]).map(toAlert);
}

const toAlert = (r: AlertRow) => ({
  id: r.id,
  wishId: r.wish_id,
  title: r.title,
  store: r.store,
  priceCents: r.price_cents,
  targetCents: r.target_cents,
  createdAt: r.created_at,
  read: r.read_at !== null,
});

export function registerAlerts(app: Hono, db: DB, search: ((query: string) => Promise<Offer[]>) | null) {
  app.get("/api/alerts", (c) => {
    const rows = db.prepare("SELECT * FROM alerts ORDER BY created_at DESC LIMIT 20").all() as unknown as AlertRow[];
    return c.json({ unread: rows.filter((r) => r.read_at === null).length, alerts: rows.map(toAlert) });
  });

  app.post("/api/alerts/read", (c) => {
    db.prepare("UPDATE alerts SET read_at = ? WHERE read_at IS NULL").run(nowIso());
    return c.body(null, 204);
  });

  // "Check all prices now": the background watch, on demand.
  app.post("/api/wishlist/check-all", async (c) => {
    if (!search) return c.json({ error: "Live product search is not set up" }, 503);
    return c.json(await refreshWalletPrices(db, search));
  });
}
