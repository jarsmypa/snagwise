import { bestOffer, type Offer } from "@snagwise/core";
import { nowIso, type DB } from "./db.js";

/*
  Price watch: re-checks every wallet item in the background so a drop to the target shows up
  without the user pressing "Check price". One search per item per run keeps it inside
  Channel3's free 1,000 searches a month (e.g. 5 items every 6 hours ≈ 600 a month).
*/

export async function refreshWalletPrices(db: DB, search: (query: string) => Promise<Offer[]>): Promise<number> {
  const items = db.prepare("SELECT id, query, currency FROM wishlist").all() as { id: string; query: string; currency: string }[];
  let updated = 0;
  for (const item of items) {
    try {
      const offer = bestOffer(await search(item.query), item.currency);
      if (!offer) continue;
      db.prepare("UPDATE wishlist SET best_offer = ?, last_checked_at = ? WHERE id = ?").run(JSON.stringify(offer), nowIso(), item.id);
      updated++;
    } catch (err) {
      console.warn(`Price watch skipped "${item.query}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return updated;
}
