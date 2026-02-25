import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTypingStore } from '../typing-store';

describe('InMemoryTypingStore', () => {
  let store: InMemoryTypingStore;

  beforeEach(() => {
    store = new InMemoryTypingStore();
  });

  it('setTyping + getTyping returns user', async () => {
    await store.setTyping('ch-1', 'user-1');
    const typing = await store.getTyping('ch-1');
    expect(typing).toEqual(['user-1']);
  });

  it('multiple users typing in same channel', async () => {
    await store.setTyping('ch-1', 'user-1');
    await store.setTyping('ch-1', 'user-2');
    const typing = await store.getTyping('ch-1');
    expect(typing.sort()).toEqual(['user-1', 'user-2']);
  });

  it('different channels are isolated', async () => {
    await store.setTyping('ch-1', 'user-1');
    await store.setTyping('ch-2', 'user-2');
    expect(await store.getTyping('ch-1')).toEqual(['user-1']);
    expect(await store.getTyping('ch-2')).toEqual(['user-2']);
  });

  it('getTyping returns empty for no typers', async () => {
    const typing = await store.getTyping('ch-empty');
    expect(typing).toEqual([]);
  });

  it('same user typing refreshes entry', async () => {
    await store.setTyping('ch-1', 'user-1');
    await store.setTyping('ch-1', 'user-1');
    const typing = await store.getTyping('ch-1');
    expect(typing).toEqual(['user-1']);
  });
});
