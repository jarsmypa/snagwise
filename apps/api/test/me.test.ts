import { describe, expect, it } from "vitest";
import type { Offer } from "@snagwise/core";
import { createApp } from "../src/app.ts";
import { openDb } from "../src/db.ts";
import { seedDemo } from "../src/seed.ts";

const post = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
type Me = { title: string; styles: string[]; tags: string[]; achievements: { id: string; unlocked: boolean; unlockedAt: string | null }[]; newlyUnlocked: string[] };

describe("sidequests", () => {
  it("unlock fashion advice when someone saves a clothing deal you recommended", async () => {
    const db = openDb(":memory:");
    seedDemo(db);
    const app = createApp({ db, env: {} });
    const shoe: Offer = { productId: "s1", title: "Trail sneakers", url: "https://example.com/s", domain: "example.com", priceCents: 8_000, currency: "USD", category: "Running Sneakers" };
    const { id } = (await (await app.request("/api/shares", post({ offer: shoe }))).json()) as { id: string };
    let me = (await (await app.request("/api/me")).json()) as Me & { achievements: { id: string; kind: string; unlocked: boolean }[] };
    expect(me.achievements.find((a) => a.id === "fashion_advisor")).toMatchObject({ kind: "quest", unlocked: false });

    await app.request(`/api/shares/${id}/open`, { method: "POST" });
    await app.request(`/api/shares/${id}/save`, { method: "POST" });
    me = (await (await app.request("/api/me")).json()) as typeof me;
    expect(me.newlyUnlocked).toEqual(expect.arrayContaining(["fashion_advisor"]));
    expect(me.newlyUnlocked).not.toContain("tech_guide");
  });
});

describe("shopper card", () => {
  it("starts a new shopper on first steps with everything locked", async () => {
    const db = openDb(":memory:");
    seedDemo(db);
    const me = (await (await createApp({ db, env: {} }).request("/api/me")).json()) as Me;
    expect(me.title).toBe("first_steps");
    expect(me.achievements.every((a) => !a.unlocked)).toBe(true);
    expect(me.newlyUnlocked).toEqual([]);
  });

  it("announces an achievement once, then remembers when it was unlocked", async () => {
    const db = openDb(":memory:");
    seedDemo(db);
    const app = createApp({ db, env: {} });
    const { cards } = (await (await app.request("/api/discover")).json()) as { cards: Offer[] };
    await app.request("/api/reactions", post({ offer: cards[0], liked: true, reasons: ["price"] }));
    await app.request("/api/wishlist", post({ query: cards[0]!.title, targetCents: 1_000, offer: cards[0], from: "play" }));

    const first = (await (await app.request("/api/me")).json()) as Me;
    expect(first.newlyUnlocked).toEqual(expect.arrayContaining(["first_swipe", "first_watch", "dream_to_plan"]));
    const second = (await (await app.request("/api/me")).json()) as Me;
    expect(second.newlyUnlocked).toEqual([]);
    expect(second.achievements.find((a) => a.id === "first_swipe")?.unlockedAt).toBeTruthy();
    expect(second.tags.length).toBeGreaterThan(0);
  });
});
