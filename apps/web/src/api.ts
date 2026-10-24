import type { Offer, Transaction, Verdict } from "@snagwise/core";

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error((body as { error?: string } | null)?.error ?? `Request failed (${res.status})`);
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
};
