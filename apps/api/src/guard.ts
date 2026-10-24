import { timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";

/*
  The hosted demo is public, so anything that spends a quota (AI providers, Channel3 searches)
  sits behind an optional access code and per-visitor limits.
*/

const PUBLIC_PATHS = [/^\/api\/health$/, /^\/api\/config$/, /^\/api\/shares\//];

const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function accessCode(code: string | undefined): MiddlewareHandler {
  return async (c, next) => {
    if (!code || !c.req.path.startsWith("/api/") || PUBLIC_PATHS.some((p) => p.test(c.req.path))) return next();
    const given = c.req.header("x-access-code") ?? "";
    if (!sameSecret(given, code)) return c.json({ error: "Access code required", code: "access_code" }, 401);
    return next();
  };
}

// Fixed-window counter in memory: enough for a single-instance demo.
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  take(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (entry.count >= this.limit) return false;
    entry.count++;
    return true;
  }
}

export function clientIp(c: Context): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
