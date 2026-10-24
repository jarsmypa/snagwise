import type { AchievementState, Offer, PlayResult, Reason, Skill, TasteProfile, TitleId, Transaction, Verdict } from "@snagwise/core";

export interface Me {
  title: TitleId;
  styles: TitleId[];
  tags: string[];
  achievements: (AchievementState & { unlockedAt: string | null })[];
  newlyUnlocked: string[];
}

export interface PriceAlert {
  id: string;
  wishId: string;
  title: string;
  store: string;
  priceCents: number;
  targetCents: number;
  createdAt: string;
  read: boolean;
}

export interface SkillItem extends Skill {
  origin: "community" | "imported";
  active: boolean;
}

export interface Deck {
  sample: boolean;
  cards: Offer[];
}

export interface Share {
  id: string;
  offer: Offer;
  createdAt: string;
  opens: number;
  saves: number;
}

export interface Budget {
  month: string;
  currency: string;
  budgetCents: number;
  spentCents: number;
  remainingCents: number;
}

export interface Health {
  channel3: boolean;
  paypal: boolean;
}

export interface Config {
  paypalClientId: string | null;
  currency: string;
}

export interface Wish {
  id: string;
  query: string;
  targetCents: number;
  currency: string;
  bestOffer: Offer | null;
  lastCheckedAt: string | null;
}

export interface Byok {
  provider: "anthropic" | "gemini" | "groq" | "openrouter";
  apiKey: string;
  model?: string;
}

export interface AgentReply {
  conversationId: string;
  reply: string;
  provider: string;
  handoffs: { from: string; to: string; reason: string }[];
  proposals: { wishId: string; title: string; priceCents: number; reason: string }[];
  walletChanged: boolean;
}

// Errors keep the server's machine-readable code (access_code, busy, daily_limit…) for the UI.
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

// Browser storage can be missing or blocked (private windows); the app works without it.
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  },
};

let accessCode = storage.get("snagwise.access") ?? "";
export function setAccessCode(code: string) {
  accessCode = code;
  storage.set("snagwise.access", code || null);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (accessCode) headers.set("x-access-code", accessCode);
  const res = await fetch(path, { ...init, headers });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = res.status === 204 ? null : isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const err = body as { error?: string; code?: string; errors?: string[] } | null;
    const detail = err?.errors?.length ? ` ${err.errors.join(" ")}` : "";
    throw new ApiError(`${err?.error ?? `Request failed (${res.status})`}${detail}`, res.status, err?.code);
  }
  return body as T;
}

const send = (method: string, body?: unknown): RequestInit =>
  body === undefined ? { method } : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };

export const api = {
  health: () => request<Health>("/api/health"),
  config: () => request<Config>("/api/config"),
  budget: () => request<Budget>("/api/budget"),
  setBudget: (budgetCents: number) => request<Budget>("/api/budget", send("PUT", { budgetCents })),
  transactions: () => request<Transaction[]>("/api/transactions"),
  wishlist: () => request<Wish[]>("/api/wishlist"),
  addWish: (query: string, targetCents: number) => request<Wish>("/api/wishlist", send("POST", { query, targetCents })),
  removeWish: (id: string) => request<null>(`/api/wishlist/${id}`, send("DELETE")),
  checkPrice: (id: string) => request<{ wish: Wish; verdict: Verdict | null }>(`/api/wishlist/${id}/check`, send("POST")),
  createOrder: (id: string) => request<{ orderId: string }>(`/api/wishlist/${id}/order`, send("POST")),
  captureOrder: (orderId: string, wishId: string) =>
    request<{ status: string; budget: Budget }>(`/api/orders/${orderId}/capture`, send("POST", { wishId })),
  discover: () => request<Deck>("/api/discover"),
  react: (offer: Offer, liked: boolean, reasons: Reason[]) =>
    request<{ profile: TasteProfile }>("/api/reactions", send("POST", { offer, liked, reasons })),
  profile: () => request<{ profile: TasteProfile; top: string[] }>("/api/profile"),
  createShare: (offer: Offer) => request<{ id: string }>("/api/shares", send("POST", { offer })),
  share: (id: string) => request<Share>(`/api/shares/${id}`),
  openShare: (id: string) => request<null>(`/api/shares/${id}/open`, send("POST")),
  saveShare: (id: string) => request<{ saved: boolean }>(`/api/shares/${id}/save`, send("POST")),
  ask: (message: string, conversationId: string | null, byok: Byok | null, prefer: string | null) =>
    request<AgentReply>(
      "/api/agent",
      send("POST", { message, ...(conversationId ? { conversationId } : {}), ...(byok ? { byok } : {}), ...(prefer ? { prefer } : {}) }),
    ),
  contextMd: (conversationId: string) => request<string>(`/api/agent/${conversationId}/context.md`),
  freeProviders: () => request<{ id: string; label: string }[]>("/api/agent/providers"),
  skills: () => request<{ limit: number; skills: SkillItem[] }>("/api/skills"),
  setSkillActive: (id: string, active: boolean) => request<{ active: string[] }>(`/api/skills/${id}/active`, send("PUT", { active })),
  importSkill: (markdown: string) => request<SkillItem>("/api/skills/import", send("POST", { markdown })),
  removeSkill: (id: string) => request<null>(`/api/skills/${id}`, send("DELETE")),
  savings: () => request<{ savedCents: number; purchases: number }>("/api/savings"),
  alerts: () => request<{ unread: number; alerts: PriceAlert[] }>("/api/alerts"),
  readAlerts: () => request<null>("/api/alerts/read", send("POST")),
  checkAll: () => request<{ updated: number; alerts: number }>("/api/wishlist/check-all", send("POST")),
  playStore: () => request<{ sample: boolean; items: Offer[] }>("/api/play/store"),
  playCheckout: (budgetCents: number, items: Offer[]) =>
    request<{ result: PlayResult; learned: string[] }>("/api/play/checkout", send("POST", { budgetCents, items })),
  addWishFromOffer: (offer: Offer, targetCents: number, from?: "play") =>
    request<Wish>("/api/wishlist", send("POST", { query: offer.title, targetCents, offer, ...(from ? { from } : {}) })),
  me: () => request<Me>("/api/me"),
};
