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
];

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
