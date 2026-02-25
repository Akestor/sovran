export interface MessageRateLimiter {
  checkSendRate(userId: string, channelId: string): Promise<boolean>;
}

/**
 * In-memory sliding-window rate limiter for message sending.
 * Keyed by userId+channelId. Suitable for single-instance;
 * replace with Redis-based implementation for multi-instance.
 */
export class InMemoryMessageRateLimiter implements MessageRateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly maxPerWindow: number = 5,
    private readonly windowMs: number = 5000,
  ) {}

  async checkSendRate(userId: string, channelId: string): Promise<boolean> {
    const key = `${userId}:${channelId}`;
    const now = Date.now();
    const window = this.windows.get(key);

    if (!window || now >= window.resetAt) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (window.count >= this.maxPerWindow) {
      return false;
    }

    window.count++;
    return true;
  }
}
