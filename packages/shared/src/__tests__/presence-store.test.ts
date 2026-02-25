import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryPresenceStore } from '../presence-store';

describe('InMemoryPresenceStore', () => {
  let store: InMemoryPresenceStore;

  beforeEach(() => {
    store = new InMemoryPresenceStore();
  });

  it('setOnline + getPresence returns online', async () => {
    await store.setOnline('user-1', ['srv-1']);
    const presence = await store.getPresence('user-1');
    expect(presence).toEqual({ status: 'online' });
  });

  it('setStatus changes status', async () => {
    await store.setOnline('user-1', ['srv-1']);
    await store.setStatus('user-1', 'idle');
    const presence = await store.getPresence('user-1');
    expect(presence).toEqual({ status: 'idle' });
  });

  it('setStatus on non-existent user is no-op', async () => {
    await store.setStatus('user-99', 'dnd');
    const presence = await store.getPresence('user-99');
    expect(presence).toBeNull();
  });

  it('setOffline removes presence', async () => {
    await store.setOnline('user-1', ['srv-1']);
    await store.setOffline('user-1');
    const presence = await store.getPresence('user-1');
    expect(presence).toBeNull();
  });

  it('getOnlineMembers filters to online users', async () => {
    await store.setOnline('user-1', ['srv-1']);
    await store.setOnline('user-2', ['srv-1']);
    const online = await store.getOnlineMembers(['user-1', 'user-2', 'user-3']);
    expect(online).toEqual(['user-1', 'user-2']);
  });

  it('getOnlineMembers returns empty for no users', async () => {
    const online = await store.getOnlineMembers([]);
    expect(online).toEqual([]);
  });

  it('getPresence returns null for unknown user', async () => {
    const presence = await store.getPresence('user-unknown');
    expect(presence).toBeNull();
  });
});
