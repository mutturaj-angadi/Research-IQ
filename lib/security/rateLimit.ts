import { AppError } from '../errors';

/** In-memory fixed-window limiter. Single-process only; use a shared store if the API runs on several instances. */
export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): void {
    const t = this.now();
    const w = this.windows.get(key);
    if (!w || t - w.start >= this.windowMs) {
      this.windows.set(key, { start: t, count: 1 });
      return;
    }
    if (w.count >= this.limit) throw new AppError('RATE_LIMITED', 'Too many requests, please try again later');
    w.count++;
  }
}
