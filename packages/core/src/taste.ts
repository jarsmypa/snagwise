import type { Offer } from "./index.js";

/*
  Taste profile learned from what the user does, not from a questionnaire:
  - swipes in Discover, with the reason (the product, the price, or both);
  - referrals: saving a deal someone shared through a QR card;
  - how the cards the user shared performed (opens and saves by friends).
  The agent reads this profile to decide what to search for and what to propose.
*/

export type Reason = "product" | "price";

export interface Reaction {
  productId: string;
  category: string;
  brand?: string;
  priceCents: number;
  liked: boolean;
  reasons: Reason[]; // empty when liked is false
  source: "swipe" | "referral";
}

export interface ShareStat {
  category: string;
  opens: number;
  saves: number;
}

export interface TasteProfile {
  categories: Record<string, number>;
  brands: Record<string, number>;
  // Highest price the user seems happy to pay per category, learned from price reactions.
  priceCeilings: Record<string, number>;
  signals: number;
}

const WEIGHT = {
  likedProduct: 2,
  likedOnlyPrice: 0.5,
  nope: -1,
  referralSave: 3, // acting on a friend's recommendation is a stronger signal than a swipe
  shareOpen: 0.25,
  shareSave: 1,
};

// "Love the product, not the price" means the user wants it cheaper: aim a bit below.
const PRODUCT_ONLY_DISCOUNT = 0.85;

const bump = (map: Record<string, number>, key: string | undefined, by: number) => {
  if (!key) return;
  map[key] = (map[key] ?? 0) + by;
};

export function buildProfile(reactions: readonly Reaction[], shares: readonly ShareStat[] = []): TasteProfile {
  const profile: TasteProfile = { categories: {}, brands: {}, priceCeilings: {}, signals: 0 };

  for (const r of reactions) {
    profile.signals++;
    const product = r.reasons.includes("product");
    const price = r.reasons.includes("price");

    if (!r.liked) {
      bump(profile.categories, r.category, WEIGHT.nope);
      bump(profile.brands, r.brand, WEIGHT.nope);
      continue;
    }

    const weight = r.source === "referral" ? WEIGHT.referralSave : product ? WEIGHT.likedProduct : WEIGHT.likedOnlyPrice;
    bump(profile.categories, r.category, weight);
    if (product || r.source === "referral") bump(profile.brands, r.brand, weight);

    const ceiling = profile.priceCeilings[r.category];
    if (price || r.source === "referral") {
      profile.priceCeilings[r.category] = Math.max(ceiling ?? 0, r.priceCents);
    } else if (product) {
      const wanted = Math.round(r.priceCents * PRODUCT_ONLY_DISCOUNT);
      profile.priceCeilings[r.category] = ceiling === undefined ? wanted : Math.min(ceiling, wanted);
    }
  }

  for (const s of shares) {
    profile.signals += s.opens + s.saves;
    bump(profile.categories, s.category, s.opens * WEIGHT.shareOpen + s.saves * WEIGHT.shareSave);
  }

  return profile;
}

export function topCategories(profile: TasteProfile, n: number): string[] {
  return Object.entries(profile.categories)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([category]) => category);
}

// Ranks Discover cards: favourite categories and brands first, offers above the learned ceiling last.
export function scoreOffer(profile: TasteProfile, offer: Offer): number {
  let score = 0;
  if (offer.category) score += profile.categories[offer.category] ?? 0;
  if (offer.brand) score += profile.brands[offer.brand] ?? 0;
  const ceiling = offer.category ? profile.priceCeilings[offer.category] : undefined;
  if (ceiling !== undefined && offer.priceCents > ceiling) score -= 2;
  return score;
}
