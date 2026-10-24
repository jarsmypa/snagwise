import type { Provider } from "./types.js";

/*
  Remembers which free providers are cooling down after hitting a limit, so each request
  starts with the first provider that is likely to answer. Cooldowns use the provider's
  Retry-After when given; otherwise they double on each consecutive limit hit (1 min → 6 h),
  which covers both per-minute and daily caps without knowing which one was hit.
*/

const BASE_COOLDOWN_MS = 60_000;
const MAX_COOLDOWN_MS = 6 * 60 * 60_000;

export class Rotation {
  private state = new Map<string, { until: number; strikes: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  available(providers: readonly Provider[]): Provider[] {
    const t = this.now();
    return providers.filter((p) => (this.state.get(p.id)?.until ?? 0) <= t);
  }

  limited(providerId: string, retryAfterMs?: number): void {
    const strikes = (this.state.get(providerId)?.strikes ?? 0) + 1;
    const backoff = Math.min(MAX_COOLDOWN_MS, BASE_COOLDOWN_MS * 2 ** (strikes - 1));
    this.state.set(providerId, { until: this.now() + (retryAfterMs ?? backoff), strikes });
  }

  ok(providerId: string): void {
    this.state.delete(providerId);
  }

  // When every provider is cooling down: the earliest moment one comes back.
  nextAvailableAt(providers: readonly Provider[]): number | undefined {
    const times = providers.map((p) => this.state.get(p.id)?.until ?? 0);
    return times.length ? Math.min(...times) : undefined;
  }
}
