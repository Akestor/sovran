import type Redis from 'ioredis';

export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'offline';

export interface PresenceStore {
  setOnline(userId: string, serverIds: string[]): Promise<void>;
  setStatus(userId: string, status: PresenceStatus): Promise<void>;
  setOffline(userId: string): Promise<void>;
  getPresence(userId: string): Promise<{ status: PresenceStatus } | null>;
  getOnlineMembers(userIds: string[]): Promise<string[]>;
}

const PRESENCE_TTL = 60;
const KEY_PREFIX = 'presence:';

export class RedisPresenceStore implements PresenceStore {
  constructor(private readonly redis: Redis) {}

  async setOnline(userId: string, serverIds: string[]): Promise<void> {
    const key = KEY_PREFIX + userId;
    const value = JSON.stringify({ status: 'online', serverIds });
    await this.redis.setex(key, PRESENCE_TTL, value);
  }

  async setStatus(userId: string, status: PresenceStatus): Promise<void> {
    const key = KEY_PREFIX + userId;
    const existing = await this.redis.get(key);
    if (!existing) return;
    const data = JSON.parse(existing);
    data.status = status;
    const ttl = await this.redis.ttl(key);
    await this.redis.setex(key, ttl > 0 ? ttl : PRESENCE_TTL, JSON.stringify(data));
  }

  async setOffline(userId: string): Promise<void> {
    await this.redis.del(KEY_PREFIX + userId);
  }

  async getPresence(userId: string): Promise<{ status: PresenceStatus } | null> {
    const raw = await this.redis.get(KEY_PREFIX + userId);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return { status: data.status };
  }

  async getOnlineMembers(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const pipeline = this.redis.pipeline();
    for (const uid of userIds) {
      pipeline.exists(KEY_PREFIX + uid);
    }
    const results = await pipeline.exec();
    if (!results) return [];
    return userIds.filter((_, i) => results[i] && results[i][1] === 1);
  }
}

export class InMemoryPresenceStore implements PresenceStore {
  private readonly data = new Map<string, { status: PresenceStatus; serverIds: string[]; expiresAt: number }>();

  async setOnline(userId: string, serverIds: string[]): Promise<void> {
    this.data.set(userId, { status: 'online', serverIds, expiresAt: Date.now() + PRESENCE_TTL * 1000 });
  }

  async setStatus(userId: string, status: PresenceStatus): Promise<void> {
    const entry = this.data.get(userId);
    if (!entry || entry.expiresAt < Date.now()) return;
    entry.status = status;
  }

  async setOffline(userId: string): Promise<void> {
    this.data.delete(userId);
  }

  async getPresence(userId: string): Promise<{ status: PresenceStatus } | null> {
    const entry = this.data.get(userId);
    if (!entry || entry.expiresAt < Date.now()) {
      this.data.delete(userId);
      return null;
    }
    return { status: entry.status };
  }

  async getOnlineMembers(userIds: string[]): Promise<string[]> {
    const now = Date.now();
    return userIds.filter((uid) => {
      const entry = this.data.get(uid);
      return entry && entry.expiresAt > now;
    });
  }
}
