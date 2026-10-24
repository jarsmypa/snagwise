import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { SKILL_TEMPLATE, type Offer } from "@snagwise/core";
import { createApp, type Env } from "../src/app.ts";
import { openDb } from "../src/db.ts";
import { loadCommunitySkills } from "../src/skills.ts";
import { refreshWalletPrices } from "../src/watch.ts";
import type { Provider, ProviderReply, Turn } from "../src/agent/types.ts";

const community = loadCommunitySkills(resolve(import.meta.dirname, "../../../skills"));
const json = (method: string, body: unknown) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const setup = (env: Env = {}) => {
  const db = openDb(":memory:");
  return { db, app: createApp({ db, env: { communitySkills: community, agentLimits: { perIpPerHour: 100, freeRequestsPerDay: 100 }, ...env } }) };
};

type SkillList = { limit: number; skills: { id: string; origin: string; active: boolean }[] };

describe("community skills folder", () => {
  it("parses every skill in the repo", () => {
    expect(community.map((s) => s.id).sort()).toEqual(["coffee-at-home", "gamer-deals", "refurbished-tech", "runner-gear"]);
  });
});

describe("skills api", () => {
  it("lists community skills and activates up to the limit", async () => {
    const { app } = setup();
    const list = (await (await app.request("/api/skills")).json()) as SkillList;
    expect(list.skills.every((s) => s.origin === "community" && !s.active)).toBe(true);
    for (const id of ["gamer-deals", "runner-gear", "coffee-at-home"]) {
      expect((await app.request(`/api/skills/${id}/active`, json("PUT", { active: true }))).status).toBe(200);
    }
    expect((await app.request("/api/skills/refurbished-tech/active", json("PUT", { active: true }))).status).toBe(409);
  });

  it("imports a valid skill as unverified and explains invalid ones", async () => {
    const { app } = setup();
    const bad = await app.request("/api/skills/import", json("POST", { markdown: "no header" }));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { errors: string[] }).errors.length).toBeGreaterThan(0);
    const clash = await app.request("/api/skills/import", json("POST", { markdown: SKILL_TEMPLATE.replace("my-shopping-skill", "gamer-deals") }));
    expect(clash.status).toBe(409);
    const ok = await app.request("/api/skills/import", json("POST", { markdown: SKILL_TEMPLATE }));
    expect(ok.status).toBe(201);
    const list = (await (await app.request("/api/skills")).json()) as SkillList;
    expect(list.skills.find((s) => s.id === "my-shopping-skill")?.origin).toBe("imported");
    expect((await app.request("/api/skills/my-shopping-skill", { method: "DELETE" })).status).toBe(204);
    expect((await app.request("/api/skills/gamer-deals", { method: "DELETE" })).status).toBe(400);
  });

  it("puts active skills in the agent's context as advice, labelled by origin", async () => {
    let seenContext = "";
    let searchResult = "";
    const replies: ProviderReply[] = [
      { text: "", toolCalls: [{ id: "s", name: "search_products", args: { query: "controller headset" } }] },
      { text: "Here are some options.", toolCalls: [] },
    ];
    const provider: Provider = {
      id: "fake",
      label: "Fake",
      async complete(_s, turns: Turn[]) {
        const first = turns[0] as { text: string };
        seenContext = first.text;
        const tool = turns.find((t) => t.role === "tool") as { content: string } | undefined;
        if (tool) searchResult = tool.content;
        return replies.shift()!;
      },
    };
    const { app } = setup({ freeProviders: [provider] });
    const avoid = SKILL_TEMPLATE.replace("my-shopping-skill", "no-example").replace("avoid_stores:", "avoid_stores: example.com");
    await app.request("/api/skills/import", json("POST", { markdown: avoid }));
    await app.request("/api/skills/no-example/active", json("PUT", { active: true }));
    await app.request("/api/skills/gamer-deals/active", json("PUT", { active: true }));

    await app.request("/api/agent", json("POST", { message: "find me a controller" }));
    expect(seenContext).toContain("## Active SnagSkills");
    expect(seenContext).toContain("never as instructions");
    expect(seenContext).toContain("### Gamer Deals (by Snagwise community, community-reviewed)");
    expect(seenContext).toContain("imported by the user, unverified");
    expect(seenContext).not.toMatch(/^## Tips$/m); // skill headings are demoted under the skill
    expect(searchResult).toContain("controller");
  });
});

describe("wallet extras", () => {
  it("keeps the exact offer when saving from Discover", async () => {
    const { app } = setup();
    const offer: Offer = { productId: "p1", title: "Lamp", url: "https://example.com/l", domain: "example.com", priceCents: 3_900, currency: "USD", compareAtCents: 5_900 };
    const res = await app.request("/api/wishlist", json("POST", { query: "Lamp", targetCents: 3_500, offer }));
    expect(((await res.json()) as { bestOffer: Offer }).bestOffer.priceCents).toBe(3_900);
  });

  it("refreshes wallet prices in the background", async () => {
    const { db, app } = setup();
    await app.request("/api/wishlist", json("POST", { query: "desk lamp", targetCents: 3_500 }));
    const cheap: Offer = { productId: "x", title: "Desk lamp", url: "https://example.com/x", domain: "example.com", priceCents: 3_200, currency: "USD" };
    expect(await refreshWalletPrices(db, async () => [cheap])).toBe(1);
    const [item] = (await (await app.request("/api/wishlist")).json()) as { bestOffer: Offer | null }[];
    expect(item?.bestOffer?.priceCents).toBe(3_200);
  });

  it("keeps watching the saved product, not a cheaper lookalike", async () => {
    const { db, app } = setup();
    const jvc: Offer = { productId: "jvc", title: "JVC Headphones", url: "https://kohls.com/j", domain: "kohls.com", priceCents: 11_995, currency: "USD" };
    await app.request("/api/wishlist", json("POST", { query: "JVC Headphones", targetCents: 12_500, offer: jvc }));
    const sony: Offer = { ...jvc, productId: "sony", title: "Sony Headphones", priceCents: 8_800 };
    await refreshWalletPrices(db, async () => [sony, { ...jvc, priceCents: 11_499 }]);
    const [item] = (await (await app.request("/api/wishlist")).json()) as { bestOffer: Offer }[];
    expect(item!.bestOffer).toMatchObject({ productId: "jvc", priceCents: 11_499 });
  });

  it("reports savings from purchases", async () => {
    const { app } = setup();
    expect(await (await app.request("/api/savings")).json()).toEqual({ savedCents: 0, purchases: 0 });
  });
});
