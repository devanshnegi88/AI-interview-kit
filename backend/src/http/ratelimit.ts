export interface RateLimiter {
  acquire(host: string): Promise<void>;
}

/**
 * Per-host minimum interval. Reusable by the crawler so every origin
 * is paced, including redirects and robots.txt fetches.
 */
export class HostRateLimiter implements RateLimiter {
  private readonly nextAllowed = new Map<string, number>();

  constructor(
    private readonly minIntervalMs: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  async acquire(host: string): Promise<void> {
    if (this.minIntervalMs <= 0) return;
    const key = host.toLowerCase();
    const now = this.now();
    const allowedAt = this.nextAllowed.get(key) ?? 0;
    const wait = allowedAt - now;
    this.nextAllowed.set(key, Math.max(now, allowedAt) + this.minIntervalMs);
    if (wait > 0) await this.sleep(wait);
  }
}
