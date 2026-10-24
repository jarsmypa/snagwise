import { describe, expect, it } from "vitest";
import type { Offer, TasteProfile } from "@snagwise/core";
import { createApp } from "../src/app.ts";
import { openDb } from "../src/db.ts";

const setup = () => createApp({ db: openDb(":memory:"), env: {} });
const post = (body?: unknown) =>
  body === undefined ? { method: "POST" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };

type Deck = { sample: boolean; cards: Offer[] };

describe("discover", () => {
  it("serves the sample catalog when there is no Channel3 key", async () => {
    const deck = (await (await setup().request("/api/discover")).json()) as Deck;
    expect(deck.sample).toBe(true);
    expect(deck.cards.length).toBeGreaterThan(0);
  });

  it("does not show a card again after reacting to it", async () => {
    const app = setup();
    const first = ((await (await app.request("/api/discover")).json()) as Deck).cards[0]!;
    await app.request("/api/reactions", post({ offer: first, liked: false, reasons: [] }));
    const again = (await (await app.request("/api/discover")).json()) as Deck;
    expect(again.cards.some((c) => c.productId === first.productId)).toBe(false);
  });

  it("learns a price ceiling from 'love the product, not the price'", async () => {
    const app = setup();
    const card = ((await (await app.request("/api/discover")).json()) as Deck).cards[0]!;
    const res = await app.request("/api/reactions", post({ offer: card, liked: true, reasons: ["product"] }));
    const { profile } = (await res.json()) as { profile: TasteProfile };
    expect(profile.priceCeilings[card.category!]).toBe(Math.round(card.priceCents * 0.85));
  });

  it("counts QR opens and referral saves, and saves the deal to the wallet", async () => {
    const app = setup();
    const card = ((await (await app.request("/api/discover")).json()) as Deck).cards[0]!;
    const { id } = (await (await app.request("/api/shares", post({ offer: card }))).json()) as { id: string };
    expect((await app.request(`/api/shares/${id}/open`, post())).status).toBe(204);
    expect((await app.request(`/api/shares/${id}/save`, post())).status).toBe(200);
    const share = (await (await app.request(`/api/shares/${id}`)).json()) as { opens: number; saves: number };
    expect(share).toMatchObject({ opens: 1, saves: 1 });
    const wallet = (await (await app.request("/api/wishlist")).json()) as unknown[];
    expect(wallet).toHaveLength(1);
    const { top } = (await (await app.request("/api/profile")).json()) as { top: string[] };
    expect(top).toContain(card.category);
  });

  it("only proxies the image stored with a share", async () => {
    const app = setup();
    expect((await app.request("/api/shares/missing/image")).status).toBe(404);
  });
});
