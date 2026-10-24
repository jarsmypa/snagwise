import type { Hono } from "hono";
import { z } from "zod";
import { DEFAULT_COURIER, type CourierSettings } from "@snagwise/core";
import type { DB } from "./db.js";

/*
  The user's courier setup for "landed in Asunción". Stored as one settings row; every value is
  theirs to adjust to their courier's real rates.
*/

export function getCourier(db: DB): CourierSettings {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'courier'").get() as { value: string } | undefined;
  return row ? { ...DEFAULT_COURIER, ...(JSON.parse(row.value) as Partial<CourierSettings>) } : DEFAULT_COURIER;
}

const schema = z.object({
  enabled: z.boolean(),
  ratePerKgCents: z.number().int().min(0).max(20_000),
  minKg: z.number().min(0).max(5),
  usSalesTaxPct: z.number().min(0).max(20),
  importTaxPct: z.number().min(0).max(100),
  pygPerUsd: z.number().int().min(1_000).max(100_000),
});

export function registerCourier(app: Hono, db: DB) {
  app.get("/api/courier", (c) => c.json(getCourier(db)));
  app.put("/api/courier", async (c) => {
    const settings = schema.parse(await c.req.json());
    db.prepare("INSERT INTO settings (key, value) VALUES ('courier', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(settings));
    return c.json(settings);
  });
}
