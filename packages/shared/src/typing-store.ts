import type Redis from 'ioredis';

export interface TypingStore {
  setTyping(channelId: string, userId: string): Promise<void>;
  getTyping(channelId: string): Promise<string[]>;
}

const TYPING_TTL = 8;
const KEY_PREFIX = 'typing:';

function typingKey(channelId: string, userId: string): string {
  return `${KEY_PREFIX}${channelId}:${userId}`;
}

function typingPattern(channelId: string): string {
  return `${KEY_PREFIX}${channelId}:*`;
}

export class RedisTypingStore implements TypingStore {
  constructor(private readonly redis: Redis) {}

  async setTyping(channelId: string, userId: string): Promise<void> {
    await this.redis.setex(typingKey(channelId, userId), TYPING_TTL, '1');
  }

  async getTyping(channelId: string): Promise<string[]> {
    const keys = await this.redis.keys(typingPattern(channelId));
    const prefix = `${KEY_PREFIX}${channelId}:`;
    return keys.map((k: string) => k.slice(prefix.length));
  }
}

export class InMemoryTypingStore implements TypingStore {
  private readonly data = new Map<string, number>();

  async setTyping(channelId: string, userId: string): Promise<void> {
    this.data.set(typingKey(channelId, userId), Date.now() + TYPING_TTL * 1000);
  }

  async getTyping(channelId: string): Promise<string[]> {
    const now = Date.now();
    const prefix = `${KEY_PREFIX}${channelId}:`;
    const result: string[] = [];
    for (const [key, expiresAt] of this.data) {
      if (key.startsWith(prefix)) {
        if (expiresAt > now) {
          result.push(key.slice(prefix.length));
        } else {
          this.data.delete(key);
        }
      }
    }
    return result;
  }
}
