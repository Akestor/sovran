import { describe, it, expect } from 'vitest';
import {
  CreateServerRequestSchema,
  CreateChannelRequestSchema,
  RenameChannelRequestSchema,
  JoinServerRequestSchema,
  CreateServerInviteRequestSchema,
} from '../api/server';

describe('CreateServerRequestSchema', () => {
  it('validates and trims name', () => {
    const result = CreateServerRequestSchema.parse({ name: '  My Server  ' });
    expect(result.name).toBe('My Server');
  });

  it('rejects empty name', () => {
    expect(() => CreateServerRequestSchema.parse({ name: '' })).toThrow();
  });

  it('rejects name over 100 chars', () => {
    expect(() => CreateServerRequestSchema.parse({ name: 'a'.repeat(101) })).toThrow();
  });
});

describe('CreateChannelRequestSchema', () => {
  it('normalizes to lowercase and trims', () => {
    const result = CreateChannelRequestSchema.parse({ name: '  General  ' });
    expect(result.name).toBe('general');
    expect(result.type).toBe('text');
  });

  it('rejects invalid characters', () => {
    expect(() => CreateChannelRequestSchema.parse({ name: 'my channel' })).toThrow();
    expect(() => CreateChannelRequestSchema.parse({ name: 'my_channel' })).toThrow();
  });

  it('accepts valid channel names', () => {
    expect(CreateChannelRequestSchema.parse({ name: 'general' }).name).toBe('general');
    expect(CreateChannelRequestSchema.parse({ name: 'off-topic' }).name).toBe('off-topic');
    expect(CreateChannelRequestSchema.parse({ name: 'channel-123' }).name).toBe('channel-123');
  });
});

describe('RenameChannelRequestSchema', () => {
  it('normalizes name', () => {
    const result = RenameChannelRequestSchema.parse({ name: 'New-Name' });
    expect(result.name).toBe('new-name');
  });
});

describe('JoinServerRequestSchema', () => {
  it('validates invite code', () => {
    const result = JoinServerRequestSchema.parse({ inviteCode: 'abc123' });
    expect(result.inviteCode).toBe('abc123');
  });

  it('rejects empty invite code', () => {
    expect(() => JoinServerRequestSchema.parse({ inviteCode: '' })).toThrow();
  });
});

describe('CreateServerInviteRequestSchema', () => {
  it('uses defaults', () => {
    const result = CreateServerInviteRequestSchema.parse({});
    expect(result.maxUses).toBe(25);
    expect(result.expiresInDays).toBe(7);
  });

  it('accepts custom values', () => {
    const result = CreateServerInviteRequestSchema.parse({ maxUses: 100, expiresInDays: 14 });
    expect(result.maxUses).toBe(100);
    expect(result.expiresInDays).toBe(14);
  });

  it('rejects out of range', () => {
    expect(() => CreateServerInviteRequestSchema.parse({ maxUses: 0 })).toThrow();
    expect(() => CreateServerInviteRequestSchema.parse({ expiresInDays: 31 })).toThrow();
  });
});
