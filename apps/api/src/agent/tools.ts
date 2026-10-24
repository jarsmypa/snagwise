import { evaluateOffer, formatCents, scoreOffer, skillScore, toCents, topCategories, type Offer, type Skill, type TasteProfile } from "@snagwise/core";
import type { ToolCall, ToolSpec } from "./types.js";

/*
  What the agent can do. Nothing here pays: propose_purchase only puts a proposal in front of
  the user, who approves it in the PayPal checkout. Every schema is strict-compatible
  (all properties required, no extras) so the same specs work for Claude and the free providers.
*/

export interface AgentDeps {
  profile(): TasteProfile;
  budget(): { month: string; budgetCents: number; spentCents: number; remainingCents: number };
  spending(): { category: string; cents: number }[];
  wallet(): { id: string; query: string; targetCents: number; currency: string; bestOffer: Offer | null }[];
  search(query: string): Promise<Offer[]>;
  addToWallet(offer: Offer, targetCents: number): string; // returns the new wallet item id
  skills(): { skill: Skill; origin: "community" | "imported" }[]; // active SnagSkills
}

export interface Proposal {
  wishId: string;
  title: string;
  priceCents: number;
  reason: string;
}

// Per-conversation memory the tools share across turns and across provider switches.
export interface ToolSession {
  seen: Map<string, Offer>; // products returned by search, so add_to_wallet can only add real results
  proposals: Proposal[];
  notes: string[];
  walletChanged: boolean;
}

const money = (cents: number) => `$${formatCents(cents)}`;
const noArgs: ToolSpec["parameters"] = { type: "object", properties: {}, required: [], additionalProperties: false };

export const TOOL_SPECS: ToolSpec[] = [
  { name: "get_taste_profile", description: "What the user likes, learned from their swipes and referrals: favourite categories, disliked ones and price comfort per category.", parameters: noArgs },
  { name: "get_budget", description: "This month's budget, spending so far, what is left, and spending by category.", parameters: noArgs },
  { name: "list_wallet", description: "Items the user saved to watch, with their target price and the best offer seen.", parameters: noArgs },
  {
    name: "search_products",
    description: "Search real products for sale. Returns up to 8 offers ranked by the user's taste, each with a product_id to use with add_to_wallet.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "What to look for, in plain words, e.g. 'wireless earbuds under 80 dollars'" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "add_to_wallet",
    description: "Save a product from the latest search results to the user's wallet so Snagwise watches its price. Only when the user asked for it or clearly agreed.",
    parameters: {
      type: "object",
      properties: {
        product_id: { type: "string", description: "product_id from search_products" },
        target_price: { type: "number", description: "Buy at or below this price, in US dollars" },
      },
      required: ["product_id", "target_price"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_purchase",
    description:
      "Propose buying a wallet item now. Snagwise checks the price against the target and the remaining budget; if it fits, the user sees a PayPal button to approve. This never pays by itself.",
    parameters: {
      type: "object",
      properties: {
        wallet_item_id: { type: "string", description: "id from list_wallet" },
        reason: { type: "string", description: "One sentence for the user on why now is a good time" },
      },
      required: ["wallet_item_id", "reason"],
      additionalProperties: false,
    },
  },
];

const str = (v: unknown) => (typeof v === "string" ? v : "");

export async function runTool(call: ToolCall, deps: AgentDeps, session: ToolSession): Promise<string> {
  switch (call.name) {
    case "get_taste_profile": {
      const p = deps.profile();
      return JSON.stringify({ favourite_categories: topCategories(p, 5), category_scores: p.categories, price_ceilings_usd: Object.fromEntries(Object.entries(p.priceCeilings).map(([k, v]) => [k, v / 100])), signals: p.signals });
    }
    case "get_budget": {
      const b = deps.budget();
      return JSON.stringify({ month: b.month, budget: money(b.budgetCents), spent: money(b.spentCents), left: money(b.remainingCents), by_category: deps.spending().map((s) => ({ category: s.category, spent: money(s.cents) })) });
    }
    case "list_wallet":
      return JSON.stringify(deps.wallet().map((w) => ({ id: w.id, item: w.query, target: money(w.targetCents), best_offer: w.bestOffer ? { title: w.bestOffer.title, price: money(w.bestOffer.priceCents), store: w.bestOffer.domain } : null })));
    case "search_products": {
      const query = str(call.args.query).trim();
      if (!query) return "Error: query is required.";
      const profile = deps.profile();
      const skills = deps.skills().map((s) => s.skill);
      const rank = (o: Offer) => scoreOffer(profile, o) + skillScore(skills, o);
      const offers = (await deps.search(query)).sort((a, b) => rank(b) - rank(a)).slice(0, 8);
      for (const o of offers) session.seen.set(o.productId, o);
      if (offers.length === 0) return "No products found. Try a broader query.";
      return JSON.stringify(offers.map((o) => ({ product_id: o.productId, title: o.title, brand: o.brand ?? null, category: o.category ?? null, price: money(o.priceCents), list_price: o.compareAtCents ? money(o.compareAtCents) : null, store: o.domain })));
    }
    case "add_to_wallet": {
      const offer = session.seen.get(str(call.args.product_id));
      if (!offer) return "Error: unknown product_id. Use an id from the latest search_products results.";
      const target = Number(call.args.target_price);
      if (!Number.isFinite(target) || target <= 0) return "Error: target_price must be a positive number of dollars.";
      const existing = deps.wallet().find((w) => w.bestOffer?.productId === offer.productId);
      if (existing) return `Already in the wallet as ${existing.id}.`;
      const id = deps.addToWallet(offer, toCents(target));
      session.walletChanged = true;
      session.notes.push(`Added "${offer.title}" to the wallet as ${id} with target ${money(toCents(target))}`);
      return `Saved as ${id}. Snagwise will watch for ${money(toCents(target))} or less.`;
    }
    case "propose_purchase": {
      const item = deps.wallet().find((w) => w.id === str(call.args.wallet_item_id));
      if (!item) return "Error: unknown wallet_item_id. Call list_wallet first.";
      if (!item.bestOffer) return "No price seen yet for this item. Search for it again first.";
      const verdict = evaluateOffer(item, item.bestOffer, deps.budget().remainingCents);
      if (!verdict.buy) {
        const why = { above_target: "the price is above the target", over_budget: "it would exceed this month's budget", currency_mismatch: "the offer is in another currency" }[verdict.reason];
        return `Not proposed: ${why}. Tell the user and keep watching.`;
      }
      if (!session.proposals.some((p) => p.wishId === item.id)) {
        session.proposals.push({ wishId: item.id, title: item.bestOffer.title, priceCents: item.bestOffer.priceCents, reason: str(call.args.reason) });
        session.notes.push(`Proposed buying "${item.bestOffer.title}" for ${money(item.bestOffer.priceCents)} (waiting for the user's PayPal approval)`);
      }
      return "Proposal shown to the user with a PayPal button. They must approve it there; do not say it was bought.";
    }
    default:
      return `Error: unknown tool ${call.name}.`;
  }
}
