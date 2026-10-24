import type { Hono } from "hono";
import { achievementStates, cartTotal, shopperTitles, topCategories, type Offer, type ShopperStats, type TasteProfile } from "@snagwise/core";
import { nowIso, type DB } from "./db.js";

/*
  The shopper card: a friendly title, tags and achievements computed from what the user did.
  Unlock dates are stored so each achievement is announced exactly once.
*/

const count = (db: DB, sql: string, ...params: (string | number)[]): number => {
  const row = db.prepare(sql).get(...params) as Record<string, number | null> | undefined;
  return Number(row ? (Object.values(row)[0] ?? 0) : 0);
};

export function shopperStats(db: DB, profile: TasteProfile, budget: { budgetCents: number; spentCents: number }): ShopperStats {
  const events = (kind: string) => count(db, "SELECT COUNT(*) FROM events WHERE kind = ?", kind);
  const runs = db.prepare("SELECT budget_cents, items FROM play_runs").all() as { budget_cents: number; items: string }[];
  const activeSkills = db.prepare("SELECT value FROM settings WHERE key = 'active_skills'").get() as { value: string } | undefined;

  return {
    swipes: count(db, "SELECT COUNT(*) FROM reactions WHERE source = 'swipe'"),
    likes: count(db, "SELECT COUNT(*) FROM reactions WHERE source = 'swipe' AND liked = 1"),
    priceLikes: count(db, "SELECT COUNT(*) FROM reactions WHERE source = 'swipe' AND liked = 1 AND reasons LIKE '%price%'"),
    likedCategories: count(db, "SELECT COUNT(DISTINCT category) FROM reactions WHERE liked = 1 AND source IN ('swipe', 'referral')"),
    signals: profile.signals,
    playRuns: runs.length,
    playAllIn: runs.filter((r) => cartTotal(JSON.parse(r.items) as Offer[]) >= r.budget_cents * 0.9).length,
    wantForReal: events("want_real"),
    walletAdds: events("wallet_add"),
    alerts: count(db, "SELECT COUNT(*) FROM alerts"),
    purchases: count(db, "SELECT COUNT(*) FROM transactions WHERE source = 'paypal'"),
    savedCents: count(db, "SELECT COALESCE(SUM(saved_cents), 0) FROM transactions WHERE source = 'paypal'"),
    chats: count(db, "SELECT COUNT(*) FROM agent_conversations"),
    handoffs: events("handoff"),
    shares: count(db, "SELECT COUNT(*) FROM shares"),
    shareOpens: count(db, "SELECT COALESCE(SUM(opens), 0) FROM shares"),
    shareSaves: count(db, "SELECT COALESCE(SUM(saves), 0) FROM shares"),
    skillsActive: activeSkills ? (JSON.parse(activeSkills.value) as string[]).length : 0,
    skillsImported: count(db, "SELECT COUNT(*) FROM user_skills"),
    budgetUsedShare: budget.budgetCents ? budget.spentCents / budget.budgetCents : 0,
  };
}

export function registerMe(app: Hono, db: DB, opts: { profile: () => TasteProfile; budget: () => { budgetCents: number; spentCents: number } }) {
  app.get("/api/me", (c) => {
    const profile = opts.profile();
    const stats = shopperStats(db, profile, opts.budget());
    const states = achievementStates(stats);

    // Remember first unlocks; anything inserted now is "new" for the UI's one-time celebration.
    const before = new Map((db.prepare("SELECT id, unlocked_at FROM achievements").all() as { id: string; unlocked_at: string }[]).map((r) => [r.id, r.unlocked_at]));
    const newly = states.filter((a) => a.unlocked && !before.has(a.id)).map((a) => a.id);
    const insert = db.prepare("INSERT OR IGNORE INTO achievements (id, unlocked_at) VALUES (?, ?)");
    for (const id of newly) insert.run(id, nowIso());

    const [title, ...styles] = shopperTitles(stats);
    return c.json({
      title,
      styles,
      tags: topCategories(profile, 4),
      achievements: states.map((a) => ({ ...a, unlockedAt: before.get(a.id) ?? (newly.includes(a.id) ? nowIso() : null) })),
      newlyUnlocked: newly,
      stats,
    });
  });
}
