import type { Hono } from "hono";
import { z } from "zod";
import type { Offer } from "@snagwise/core";
import { nowIso, type DB } from "../db.js";
import { clientIp, RateLimiter } from "../guard.js";
import { AllProvidersBusy, runAgent, type Handoff } from "./agent.js";
import { anthropicProvider } from "./anthropic.js";
import { buildContextMd } from "./context.js";
import { compatibleProvider, PRESETS, type PresetId } from "./openai-compatible.js";
import type { Rotation } from "./rotation.js";
import type { AgentDeps, ToolSession } from "./tools.js";
import type { Provider } from "./types.js";

export interface AgentLimits {
  perIpPerHour: number;
  freeRequestsPerDay: number; // across everyone, for the free providers
}

const byokSchema = z.object({
  provider: z.enum(["anthropic", "gemini", "groq", "openrouter"]),
  apiKey: z.string().min(10).max(300),
  model: z.string().min(1).max(100).optional(),
});

export type Byok = z.infer<typeof byokSchema>;

// The user's own key: used for this request only, never stored or logged.
export function byokProvider(byok: Byok): Provider {
  if (byok.provider === "anthropic") return anthropicProvider(byok.apiKey, byok.model);
  const preset = PRESETS[byok.provider as PresetId];
  const model = byok.model ?? preset.model;
  if (!model) throw new Error(`Choose a model for ${preset.name}`);
  return compatibleProvider({ id: `byok-${byok.provider}`, name: `${preset.name} (your key)`, baseUrl: preset.baseUrl, apiKey: byok.apiKey, model });
}

interface ConversationRow {
  id: string;
  recent: string;
  notes: string;
  seen: string;
  context_md: string;
}

const SEEN_KEPT = 50;

export function registerAgent(
  app: Hono,
  db: DB,
  opts: { deps: AgentDeps; freeProviders: Provider[]; rotation: Rotation; limits: AgentLimits; makeByok?: (b: Byok) => Provider },
) {
  const perIp = new RateLimiter(opts.limits.perIpPerHour, 60 * 60_000);
  const daily = new RateLimiter(opts.limits.freeRequestsPerDay, 24 * 60 * 60_000);
  const makeByok = opts.makeByok ?? byokProvider;

  app.get("/api/agent/providers", (c) => c.json(opts.freeProviders.map((p) => ({ id: p.id, label: p.label }))));

  app.post("/api/agent", async (c) => {
    const body = z
      .object({
        conversationId: z.string().max(64).optional(),
        message: z.string().trim().min(1).max(1000),
        byok: byokSchema.optional(),
        // The AI the user picked; the others stay as backup if it hits a limit.
        prefer: z.string().max(40).optional(),
      })
      .parse(await c.req.json());

    if (!perIp.take(clientIp(c))) return c.json({ error: "Too many messages. Try again in a while.", code: "rate_limited" }, 429);
    // Requests on the user's own key spend their quota, not the shared free one.
    if (!body.byok && !daily.take("all")) return c.json({ error: "The free demo reached today's limit. Connect your own AI key to keep going.", code: "daily_limit" }, 429);

    let providers = opts.freeProviders;
    if (body.byok) {
      try {
        providers = [makeByok(body.byok), ...opts.freeProviders];
      } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : "Invalid AI settings" }, 400);
      }
    }
    if (body.prefer) {
      const preferred = providers.find((p) => p.id === body.prefer);
      if (preferred) providers = [preferred, ...providers.filter((p) => p !== preferred)];
    }
    if (providers.length === 0) {
      return c.json({ error: "No AI provider is set up. Add a free provider key on the server, or connect your own key.", code: "no_provider" }, 503);
    }

    const existing = body.conversationId
      ? (db.prepare("SELECT * FROM agent_conversations WHERE id = ?").get(body.conversationId) as ConversationRow | undefined)
      : undefined;
    const id = existing?.id ?? crypto.randomUUID();
    const recent = existing ? (JSON.parse(existing.recent) as { user: string; assistant: string; provider: string }[]) : [];
    const session: ToolSession = {
      seen: new Map(existing ? (JSON.parse(existing.seen) as [string, Offer][]) : []),
      notes: existing ? (JSON.parse(existing.notes) as string[]) : [],
      proposals: [],
      walletChanged: false,
    };

    const context = (handoff?: Handoff) =>
      buildContextMd({
        updatedAt: nowIso(),
        profile: opts.deps.profile(),
        budget: opts.deps.budget(),
        spending: opts.deps.spending(),
        wallet: opts.deps.wallet(),
        recent,
        notes: session.notes,
        skills: opts.deps.skills(),
        ...(handoff ? { handoff } : {}),
      });

    try {
      const result = await runAgent({ providers, rotation: opts.rotation, deps: opts.deps, session, message: body.message, context });
      recent.push({ user: body.message, assistant: result.reply, provider: result.provider });
      const last = result.handoffs.at(-1);
      const md = context(last);
      const seen = JSON.stringify([...session.seen.entries()].slice(-SEEN_KEPT));
      db.prepare(
        `INSERT INTO agent_conversations (id, recent, notes, seen, context_md, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET recent = excluded.recent, notes = excluded.notes, seen = excluded.seen, context_md = excluded.context_md, updated_at = excluded.updated_at`,
      ).run(id, JSON.stringify(recent.slice(-20)), JSON.stringify(session.notes.slice(-30)), seen, md, nowIso());
      return c.json({ conversationId: id, ...result, walletChanged: session.walletChanged });
    } catch (err) {
      if (err instanceof AllProvidersBusy) {
        return c.json({ error: "Every free AI provider is at its limit right now. Try again later or connect your own key.", code: "busy", retryAt: err.retryAt ?? null }, 503);
      }
      throw err;
    }
  });

  // The handoff file itself, for anyone curious (and for the demo video).
  app.get("/api/agent/:id/context.md", (c) => {
    const row = db.prepare("SELECT context_md FROM agent_conversations WHERE id = ?").get(c.req.param("id")) as { context_md: string } | undefined;
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.body(row.context_md, 200, { "content-type": "text/markdown; charset=utf-8" });
  });
}
