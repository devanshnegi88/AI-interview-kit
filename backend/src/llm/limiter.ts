/**
 * Conservative free-tier gate: at most N in-flight calls and a minimum
 * interval between starts.
 */
export class LlmLimiter {
  private active = 0;
  private readonly waiters: Array<() => void> = [];
  private nextAllowed = 0;

  constructor(
    private readonly maxConcurrency: number,
    private readonly minIntervalMs: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      const wait = this.nextAllowed - this.now();
      this.nextAllowed = Math.max(this.now(), this.nextAllowed) + this.minIntervalMs;
      if (wait > 0) await this.sleep(wait);
      return await fn();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.active < this.maxConcurrency) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
      return;
    }
    this.active -= 1;
  }
}
