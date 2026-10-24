import type { DB } from "./db.js";

/*
  Believable demo data for the spending panel: three months of everyday expenses,
  a monthly budget and a few wishlist items. Merchant names are generic on purpose:
  the demo video must not show third-party trademarks.
*/

const MONTHLY: { day: number; cents: number; merchant: string; category: string }[] = [
  { day: 1, cents: 45_000, merchant: "Apartment rent share", category: "housing" },
  { day: 2, cents: 1_599, merchant: "Streaming plan", category: "subscriptions" },
  { day: 3, cents: 8_420, merchant: "Corner Grocery", category: "groceries" },
  { day: 5, cents: 3_000, merchant: "City Transit card", category: "transport" },
  { day: 7, cents: 2_350, merchant: "Pizza place", category: "dining" },
  { day: 9, cents: 6_210, merchant: "Electric utility", category: "utilities" },
  { day: 11, cents: 9_175, merchant: "Corner Grocery", category: "groceries" },
  { day: 13, cents: 1_200, merchant: "Music app", category: "subscriptions" },
  { day: 15, cents: 4_480, merchant: "Gym membership", category: "health" },
  { day: 17, cents: 3_690, merchant: "Sushi bar", category: "dining" },
  { day: 19, cents: 7_830, merchant: "Weekend market", category: "groceries" },
  { day: 22, cents: 2_500, merchant: "Phone plan", category: "utilities" },
  { day: 24, cents: 5_600, merchant: "Bookstore", category: "shopping" },
  { day: 27, cents: 8_960, merchant: "Corner Grocery", category: "groceries" },
];

export const DEMO_BUDGET_CENTS = 150_000;

const DEMO_WISHES = [
  { id: "seed-wish-1", query: "noise cancelling wireless headphones", targetCents: 15_000 },
  { id: "seed-wish-2", query: "trail running shoes men size 10", targetCents: 9_000 },
  { id: "seed-wish-3", query: "espresso machine with milk frother", targetCents: 20_000 },
];

const pad = (n: number) => String(n).padStart(2, "0");

// Safe to run more than once: fixed ids plus INSERT OR IGNORE.
export function seedDemo(db: DB, now = new Date()): { transactions: number } {
  const insertTx = db.prepare(
    "INSERT OR IGNORE INTO transactions (id, date, amount_cents, currency, merchant, category, source) VALUES (?, ?, ?, 'USD', ?, ?, 'seed')",
  );
  let count = 0;
  db.exec("BEGIN");
  for (let back = 2; back >= 0; back--) {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const ym = `${month.getUTCFullYear()}-${pad(month.getUTCMonth() + 1)}`;
    const lastDay = back === 0 ? now.getUTCDate() : 31;
    MONTHLY.forEach((e, i) => {
      if (e.day > lastDay) return;
      // Small month-to-month variation so the history does not look copy-pasted.
      const cents = e.category === "housing" || e.category === "subscriptions" ? e.cents : e.cents + ((i * 37 + back * 113) % 900) - 450;
      insertTx.run(`seed-${ym}-${i}`, `${ym}-${pad(e.day)}T15:00:00.000Z`, cents, e.merchant, e.category);
      count++;
    });
  }
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('budget_cents', ?)").run(String(DEMO_BUDGET_CENTS));
  const insertWish = db.prepare(
    "INSERT OR IGNORE INTO wishlist (id, query, target_cents, currency, created_at) VALUES (?, ?, ?, 'USD', ?)",
  );
  for (const w of DEMO_WISHES) insertWish.run(w.id, w.query, w.targetCents, now.toISOString());
  db.exec("COMMIT");
  return { transactions: count };
}
