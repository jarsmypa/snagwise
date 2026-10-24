import { describe, expect, it } from "vitest";
import { createApp, type Env } from "../src/app.ts";
import { openDb } from "../src/db.ts";
import { seedDemo } from "../src/seed.ts";
import { compatibleProvider } from "../src/agent/openai-compatible.ts";
import { Rotation } from "../src/agent/rotation.ts";
import { QuotaError, type Provider, type ProviderReply, type Turn } from "../src/agent/types.ts";

// A provider that plays back a script and records what it was sent.
function scripted(id: string, script: (ProviderReply | Error)[]): Provider & { calls: Turn[][] } {
  const calls: Turn[][] = [];
  let i = 0;
  return {
    id,
    label: `Fake ${id}`,
    calls,
    async complete(_system, turns) {
      calls.push(structuredClone(turns));
      const next = script[i++];
      if (!next) throw new Error(`script for ${id} ran out`);
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

const text = (t: string): ProviderReply => ({ text: t, toolCalls: [] });
const call = (name: string, args: Record<string, unknown> = {}, id = `${name}-1`): ProviderReply => ({ text: "", toolCalls: [{ id, name, args }] });

const setup = (env: Env = {}) => {
  const db = openDb(":memory:");
  seedDemo(db);
  return { db, app: createApp({ db, env: { agentLimits: { perIpPerHour: 100, freeRequestsPerDay: 100 }, ...env } }) };
};
const ask = (app: ReturnType<typeof createApp>, body: unknown, headers: Record<string, string> = {}) =>
  app.request("/api/agent", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

type AgentReply = { conversationId: string; reply: string; provider: string; handoffs: { from: string; to: string }[]; proposals: { wishId: string }[]; walletChanged: boolean };

describe("agent", () => {
  it("searches, saves to the wallet and records it in the context file", async () => {
    const p = scripted("a", [call("search_products", { query: "headphones" }), call("add_to_wallet", { product_id: "sample-1", target_price: 120 }), text("Saved the headphones.")]);
    const { app } = setup({ freeProviders: [p] });
    const res = (await (await ask(app, { message: "find me headphones and save the best one" })).json()) as AgentReply;
    expect(res.reply).toBe("Saved the headphones.");
    expect(res.walletChanged).toBe(true);
    const wallet = (await (await app.request("/api/wishlist")).json()) as { query: string; bestOffer: unknown }[];
    expect(wallet.some((w) => w.query.startsWith("Over-ear wireless headphones") && w.bestOffer)).toBe(true);
    const md = await (await app.request(`/api/agent/${res.conversationId}/context.md`)).text();
    expect(md).toContain("## Actions already taken");
    expect(md).toContain("target $120.00");
  });

  it("rotates to the next provider when one hits its limit, with a handoff in the context", async () => {
    const a = scripted("a", [new QuotaError("a")]);
    const b = scripted("b", [text("Hi from b"), text("Still b")]);
    const { app } = setup({ freeProviders: [a, b] });
    const first = (await (await ask(app, { message: "hello" })).json()) as AgentReply;
    expect(first.provider).toBe("Fake b");
    expect(first.handoffs).toEqual([{ from: "Fake a", to: "Fake b", reason: "usage limit reached" }]);
    const sentToB = b.calls[0]![0]! as { text: string };
    expect(sentToB.text).toContain("## Handoff");
    // a is cooling down, so the next message goes straight to b.
    const second = (await (await ask(app, { conversationId: first.conversationId, message: "again" })).json()) as AgentReply;
    expect(second.handoffs).toEqual([]);
    expect(a.calls).toHaveLength(1);
    expect((b.calls[1]![0]! as { text: string }).text).toContain("Snagwise (Fake b): Hi from b");
  });

  it("tells the next model what the previous one already did mid-answer", async () => {
    const a = scripted("a", [call("search_products", { query: "espresso" }), call("add_to_wallet", { product_id: "sample-7", target_price: 150 }), new QuotaError("a")]);
    const b = scripted("b", [text("Your espresso machine is saved.")]);
    const { app } = setup({ freeProviders: [a, b] });
    await ask(app, { message: "save an espresso machine" });
    const context = (b.calls[0]![0]! as { text: string }).text;
    expect(context).toContain('Added "Espresso machine with milk frother"');
  });

  it("answers 503 when every provider is out of quota", async () => {
    const { app } = setup({ freeProviders: [scripted("a", [new QuotaError("a", 30_000)])] });
    const res = await ask(app, { message: "hello" });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "busy" });
  });

  it("proposes only purchases that fit the target and the budget", async () => {
    const saver = scripted("a", [
      call("search_products", { query: "earbuds or desk lamp" }),
      call("add_to_wallet", { product_id: "sample-2", target_price: 40 }, "c1"),
      call("add_to_wallet", { product_id: "sample-14", target_price: 45 }, "c2"),
      text("Saved."),
    ]);
    const { db, app } = setup({ freeProviders: [saver] });
    await ask(app, { message: "save earbuds and a lamp" });
    const wallet = (await (await app.request("/api/wishlist")).json()) as { id: string; query: string }[];
    const earbuds = wallet.find((w) => w.query.startsWith("True wireless earbuds"))!; // $59 vs $40 target
    const lamp = wallet.find((w) => w.query.startsWith("Smart LED desk lamp"))!; // $39 vs $45 target

    const buyer = scripted("b", [
      { text: "", toolCalls: [
        { id: "p1", name: "propose_purchase", args: { wallet_item_id: earbuds.id, reason: "now" } },
        { id: "p2", name: "propose_purchase", args: { wallet_item_id: lamp.id, reason: "on sale" } },
      ] },
      text("The lamp fits; the earbuds are still above your target."),
    ]);
    const app2 = createApp({ db, env: { freeProviders: [buyer], agentLimits: { perIpPerHour: 100, freeRequestsPerDay: 100 } } });
    const res = (await (await ask(app2, { message: "buy what fits" })).json()) as AgentReply;
    expect(res.proposals.map((p) => p.wishId)).toEqual([lamp.id]);
    const results = buyer.calls[1]!.filter((t) => t.role === "tool").map((t) => (t as { content: string }).content);
    expect(results[0]).toContain("above the target");
  });

  it("starts with the AI the user picked and lists the available ones", async () => {
    const a = scripted("a", [text("From a")]);
    const b = scripted("b", [text("From b")]);
    const { app } = setup({ freeProviders: [a, b] });
    expect(await (await app.request("/api/agent/providers")).json()).toEqual([
      { id: "a", label: "Fake a" },
      { id: "b", label: "Fake b" },
    ]);
    const res = (await (await ask(app, { message: "hi", prefer: "b" })).json()) as AgentReply;
    expect(res.reply).toBe("From b");
    expect(a.calls).toHaveLength(0);
  });

  it("uses the user's own key first", async () => {
    const mine = scripted("mine", [text("From your key")]);
    const free = scripted("free", [text("From free")]);
    const { app } = setup({ freeProviders: [free], makeByok: () => mine });
    const res = (await (await ask(app, { message: "hi", byok: { provider: "groq", apiKey: "gsk_test_1234567890" } })).json()) as AgentReply;
    expect(res.reply).toBe("From your key");
    expect(free.calls).toHaveLength(0);
  });
});

describe("guards", () => {
  it("requires the access code except on public paths", async () => {
    const { app } = setup({ accessCode: "judges-2026", freeProviders: [scripted("a", [text("ok")])] });
    expect((await ask(app, { message: "hi" })).status).toBe(401);
    expect((await ask(app, { message: "hi" }, { "x-access-code": "judges-2026" })).status).toBe(200);
    expect((await app.request("/api/health")).status).toBe(200);
    expect((await app.request("/api/shares/none")).status).toBe(404); // public, so not 401
  });

  it("limits messages per visitor", async () => {
    const { app } = setup({ agentLimits: { perIpPerHour: 1, freeRequestsPerDay: 100 }, freeProviders: [scripted("a", [text("1"), text("2")])] });
    expect((await ask(app, { message: "one" })).status).toBe(200);
    expect((await ask(app, { message: "two" })).status).toBe(429);
  });
});

describe("rotation", () => {
  it("doubles the cooldown on repeated limits and resets after a success", () => {
    let now = 0;
    const r = new Rotation(() => now);
    const p = scripted("a", []);
    r.limited("a");
    expect(r.available([p])).toEqual([]);
    now = 60_000;
    expect(r.available([p])).toHaveLength(1);
    r.limited("a");
    now = 60_000 + 119_000;
    expect(r.available([p])).toEqual([]);
    r.ok("a");
    expect(r.available([p])).toHaveLength(1);
  });
});

describe("openai-compatible adapter", () => {
  const cfg = { id: "groq", name: "Groq", baseUrl: "https://example.test/v1", apiKey: "k", model: "m" };

  it("parses tool calls with JSON string arguments", async () => {
    const fake = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "search_products", arguments: '{"query":"tents"}' } }] } }] }), {
        status: 200,
      })) as typeof fetch;
    const reply = await compatibleProvider(cfg, fake).complete("sys", [{ role: "user", text: "hi" }], []);
    expect(reply.toolCalls).toEqual([{ id: "c1", name: "search_products", args: { query: "tents" } }]);
  });

  it("turns 429 into a quota error with Retry-After", async () => {
    const fake = (async () => new Response("{}", { status: 429, headers: { "retry-after": "20" } })) as typeof fetch;
    await expect(compatibleProvider(cfg, fake).complete("sys", [], [])).rejects.toMatchObject({ provider: "groq", retryAfterMs: 20_000 });
  });
});
