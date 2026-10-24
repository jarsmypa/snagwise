import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp, type Env } from "./app.js";
import { openDb } from "./db.js";
import { seedDemo } from "./seed.js";
import { compatibleProvider, PRESETS } from "./agent/openai-compatible.js";
import type { Provider } from "./agent/types.js";
import { loadCommunitySkills } from "./skills.js";
import { refreshWalletPrices } from "./watch.js";
import { searchProducts } from "./channel3.js";

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

if (process.env.SNAGWISE_ACCESS_CODE) env.accessCode = process.env.SNAGWISE_ACCESS_CODE;

// Free-tier AI providers, tried in this order. Each one is used only if its key is set.
// One account per provider: multiplying accounts to stretch a free tier breaks their terms.
const free: Provider[] = [];
for (const id of ["gemini", "groq", "openrouter"] as const) {
  const key = process.env[`${id.toUpperCase()}_API_KEY`];
  const model = process.env[`${id.toUpperCase()}_MODEL`] || PRESETS[id].model;
  if (key && model) free.push(compatibleProvider({ id, name: PRESETS[id].name, baseUrl: PRESETS[id].baseUrl, apiKey: key, model }));
}
env.freeProviders = free;
env.agentLimits = {
  perIpPerHour: Number(process.env.SNAGWISE_AGENT_PER_IP_HOUR ?? 30),
  freeRequestsPerDay: Number(process.env.SNAGWISE_AGENT_PER_DAY ?? 300),
};

// Reviewed community skills live in the repo's skills/ folder (repo root, three levels up from apps/api/dist).
const SKILLS_DIR = process.env.SNAGWISE_SKILLS ?? resolve(HERE, "../../../skills");
env.communitySkills = loadCommunitySkills(SKILLS_DIR);

const db = openDb(DB_PATH);

// Background price watch, only with a real product search (the sample catalog never changes).
const WATCH_HOURS = Number(process.env.SNAGWISE_PRICE_WATCH_HOURS ?? 6);
if (env.channel3Key && WATCH_HOURS > 0) {
  const key = env.channel3Key;
  setInterval(() => {
    void refreshWalletPrices(db, (q) => searchProducts(key, q, 10)).then((n) => console.log(`Price watch: ${n} wallet items refreshed`));
  }, WATCH_HOURS * 60 * 60_000).unref();
}
// Render's free disk is wiped on every deploy, so the hosted demo re-seeds itself on boot.
if (process.env.SNAGWISE_SEED_DEMO === "1") seedDemo(db);
const app = createApp({ db, env });

// One server for API and web app: a single Render service to deploy.
if (existsSync(WEB_DIR)) {
  const index = readFileSync(resolve(WEB_DIR, "index.html"), "utf8");
  app.use("/*", serveStatic({ root: WEB_DIR }));
  app.get("*", (c) => (c.req.path.startsWith("/api/") ? c.json({ error: "Not found" }, 404) : c.html(index)));
}

serve({ fetch: app.fetch, port: PORT, hostname: process.env.HOST ?? "0.0.0.0" }, (info) => {
  console.log(`Snagwise listening on port ${info.port} (db: ${DB_PATH})`);
  console.log(`Free AI providers: ${free.map((p) => p.label).join(", ") || "none (users can still connect their own key)"}`);
  console.log(`SnagSkills: ${env.communitySkills?.length ?? 0} community skills from ${SKILLS_DIR}`);
});

const shutdown = () => {
  db.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
