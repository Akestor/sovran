import { describe, it, expect } from 'vitest';
import { resolveOwnerTransfer } from '../owner-transfer';
import { type Member } from '../server';

function makeMember(userId: string, role: 'OWNER' | 'ADMIN' | 'MEMBER', createdAt: string): Member {
  return {
    serverId: 'srv-1',
    userId,
    role,
    createdAt: new Date(createdAt),
  };
}

describe('resolveOwnerTransfer', () => {
  it('transfers to oldest admin', () => {
    const members = [
      makeMember('owner-1', 'OWNER', '2026-01-01'),
      makeMember('admin-2', 'ADMIN', '2026-01-03'),
      makeMember('admin-1', 'ADMIN', '2026-01-02'),
      makeMember('member-1', 'MEMBER', '2026-01-01'),
    ];

    const result = resolveOwnerTransfer(members, 'owner-1');
    expect(result.action).toBe('transferred');
    expect(result.newOwnerId).toBe('admin-1');
  });

  it('transfers to oldest member when no admins', () => {
    const members = [
      makeMember('owner-1', 'OWNER', '2026-01-01'),
      makeMember('member-2', 'MEMBER', '2026-01-03'),
      makeMember('member-1', 'MEMBER', '2026-01-02'),
    ];

    const result = resolveOwnerTransfer(members, 'owner-1');
    expect(result.action).toBe('transferred');
    expect(result.newOwnerId).toBe('member-1');
  });

  it('deletes server when no other members', () => {
    const members = [
      makeMember('owner-1', 'OWNER', '2026-01-01'),
    ];

    const result = resolveOwnerTransfer(members, 'owner-1');
    expect(result.action).toBe('server_deleted');
    expect(result.newOwnerId).toBeUndefined();
  });

  it('deletes server when members list is empty', () => {
    const result = resolveOwnerTransfer([], 'owner-1');
    expect(result.action).toBe('server_deleted');
  });
});
