import { formatCents } from "@snagwise/core";

/*
  PayPal Orders v2 against the SANDBOX. The web app shows the PayPal button for the order
  this creates, so the human approves every payment; the server then captures it.
*/

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string; // https://api-m.sandbox.paypal.com
  // Collect into this sandbox business account instead of the app's own. Needed when the developer
  // account's country can't receive payments (e.g. Paraguay): checkout then fails with PAYMENT_DENIED.
  payeeEmail?: string;
}

let cached: { token: string; expiresAt: number } | undefined;

async function accessToken(cfg: PayPalConfig): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const res = await fetch(`${cfg.baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

async function call<T>(cfg: PayPalConfig, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${await accessToken(cfg)}`, "content-type": "application/json" },
    body: body === undefined ? null : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PayPal ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export async function createOrder(
  cfg: PayPalConfig,
  amountCents: number,
  currency: string,
  description: string,
): Promise<{ id: string; status: string }> {
  return call(cfg, "/v2/checkout/orders", {
    intent: "CAPTURE",
    purchase_units: [
      {
        amount: { currency_code: currency, value: formatCents(amountCents) },
        description: description.slice(0, 127),
        ...(cfg.payeeEmail ? { payee: { email_address: cfg.payeeEmail } } : {}),
      },
    ],
  });
}

export interface CapturedOrder {
  id: string;
  status: string;
  purchase_units?: { payments?: { captures?: { id: string; status: string }[] } }[];
}

export async function captureOrder(cfg: PayPalConfig, orderId: string): Promise<CapturedOrder> {
  return call(cfg, `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {});
}

export const captureIdOf = (order: CapturedOrder): string | null => order.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? null;

// Full refund of a captured payment (the 24-hour "changed my mind" window).
export async function refundCapture(cfg: PayPalConfig, captureId: string): Promise<{ id: string; status: string }> {
  return call(cfg, `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {});
}

export const isSandbox = (cfg: PayPalConfig) => cfg.baseUrl.includes("sandbox");

// One payout (sidequest reward). Callers must only use this against the sandbox.
export async function sendPayout(
  cfg: PayPalConfig,
  receiverEmail: string,
  amountCents: number,
  note: string,
  batchId: string,
): Promise<{ batch_header: { payout_batch_id: string; batch_status: string } }> {
  return call(cfg, "/v1/payments/payouts", {
    sender_batch_header: { sender_batch_id: batchId, email_subject: "Your Snagwise sidequest reward" },
    items: [{ recipient_type: "EMAIL", receiver: receiverEmail, amount: { value: formatCents(amountCents), currency: "USD" }, note }],
  });
}
