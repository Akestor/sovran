import { type ConnectionState } from './connections';

export class RateLimiter {
  private readonly maxPerSecond: number;

  constructor(maxPerSecond: number) {
    this.maxPerSecond = maxPerSecond;
  }

  allow(state: ConnectionState): boolean {
    const now = Date.now();
    if (now - state.messageWindowStart >= 1000) {
      state.messageCount = 0;
      state.messageWindowStart = now;
    }
    state.messageCount++;
    return state.messageCount <= this.maxPerSecond;
  }
}
