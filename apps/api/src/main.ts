import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp, type Env } from "./app.js";
import { openDb } from "./db.js";

const PORT = Number(process.env.PORT ?? 8080);
// Paths are relative to apps/api/dist, where this file ends up bundled.
const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.SNAGWISE_DB ?? resolve(HERE, "../data/snagwise.db");
const WEB_DIR = process.env.SNAGWISE_WEB ?? resolve(HERE, "../../web/dist");

const env: Env = {};
if (process.env.CHANNEL3_API_KEY) env.channel3Key = process.env.CHANNEL3_API_KEY;
if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
  env.paypal = {
    clientId: process.env.PAYPAL_CLIENT_ID,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET,
    baseUrl: process.env.PAYPAL_BASE_URL ?? "https://api-m.sandbox.paypal.com",
  };
}

const db = openDb(DB_PATH);
const app = createApp({ db, env });

// One server for API and web app: a single Render service to deploy.
if (existsSync(WEB_DIR)) {
  const index = readFileSync(resolve(WEB_DIR, "index.html"), "utf8");
  app.use("/*", serveStatic({ root: WEB_DIR }));
  app.get("*", (c) => (c.req.path.startsWith("/api/") ? c.json({ error: "Not found" }, 404) : c.html(index)));
}

serve({ fetch: app.fetch, port: PORT, hostname: process.env.HOST ?? "0.0.0.0" }, (info) => {
  console.log(`Snagwise listening on port ${info.port} (db: ${DB_PATH})`);
});

const shutdown = () => {
  db.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
