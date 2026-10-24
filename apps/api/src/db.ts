import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type DB = DatabaseSync;

// Each entry runs once, in order; PRAGMA user_version remembers how far we got.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE wishlist (
    id TEXT PRIMARY KEY,
    query TEXT NOT NULL,
    target_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    best_offer TEXT,
    last_checked_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE transactions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    merchant TEXT NOT NULL,
    category TEXT NOT NULL,
    source TEXT NOT NULL
  );
  CREATE INDEX transactions_date ON transactions(date);
  `,
  `
  CREATE TABLE reactions (
    product_id TEXT PRIMARY KEY,
    offer TEXT NOT NULL,
    category TEXT NOT NULL,
    brand TEXT,
    price_cents INTEGER NOT NULL,
    liked INTEGER NOT NULL,
    reasons TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE shares (
    id TEXT PRIMARY KEY,
    offer TEXT NOT NULL,
    category TEXT NOT NULL,
    opens INTEGER NOT NULL DEFAULT 0,
    saves INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE agent_conversations (
    id TEXT PRIMARY KEY,
    recent TEXT NOT NULL,
    notes TEXT NOT NULL,
    seen TEXT NOT NULL,
    context_md TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE user_skills (
    id TEXT PRIMARY KEY,
    markdown TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  ALTER TABLE transactions ADD COLUMN saved_cents INTEGER NOT NULL DEFAULT 0;
  `,
  // Early purchases were filed under the internal "wishlist" category.
  `
  UPDATE transactions SET category = 'snagwise purchase' WHERE source = 'paypal' AND category = 'wishlist';
  `,
  `
  CREATE TABLE alerts (
    id TEXT PRIMARY KEY,
    wish_id TEXT NOT NULL,
    title TEXT NOT NULL,
    store TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    target_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    read_at TEXT
  );
  CREATE TABLE play_runs (
    id TEXT PRIMARY KEY,
    budget_cents INTEGER NOT NULL,
    items TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE events (
    kind TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX events_kind ON events(kind);
  CREATE TABLE achievements (
    id TEXT PRIMARY KEY,
    unlocked_at TEXT NOT NULL
  );
  `,
  `
  ALTER TABLE transactions ADD COLUMN capture_id TEXT;
  ALTER TABLE transactions ADD COLUMN refunded_at TEXT;
  CREATE TABLE rewards (
    quest_id TEXT PRIMARY KEY,
    amount_cents INTEGER NOT NULL,
    receiver TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
];

// Activity that no table keeps on its own (items ever added to the wallet, AI handoffs…), for achievements.
export type EventKind = "wallet_add" | "want_real" | "handoff";

export function logEvent(db: DB, kind: EventKind, times = 1): void {
  const insert = db.prepare("INSERT INTO events (kind, created_at) VALUES (?, ?)");
  for (let i = 0; i < times; i++) insert.run(kind, nowIso());
}

export function openDb(path: string): DB {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = row.user_version; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    db.exec(MIGRATIONS[v]!);
    db.exec(`PRAGMA user_version = ${v + 1}`);
    db.exec("COMMIT");
  }
  return db;
}

export function nowIso(): string {
  return new Date().toISOString();
}
