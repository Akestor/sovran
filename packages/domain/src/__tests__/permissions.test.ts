import { describe, it, expect } from 'vitest';
import {
  hasRole,
  canCreateChannel,
  canDeleteChannel,
  canRenameChannel,
  canDeleteServer,
  canManageInvites,
  canKickMember,
  canCreateChannelWithLimit,
} from '../permissions';

describe('hasRole', () => {
  it('OWNER has all roles', () => {
    expect(hasRole('OWNER', 'OWNER')).toBe(true);
    expect(hasRole('OWNER', 'ADMIN')).toBe(true);
    expect(hasRole('OWNER', 'MEMBER')).toBe(true);
  });

  it('ADMIN has ADMIN and MEMBER', () => {
    expect(hasRole('ADMIN', 'OWNER')).toBe(false);
    expect(hasRole('ADMIN', 'ADMIN')).toBe(true);
    expect(hasRole('ADMIN', 'MEMBER')).toBe(true);
  });

  it('MEMBER has only MEMBER', () => {
    expect(hasRole('MEMBER', 'OWNER')).toBe(false);
    expect(hasRole('MEMBER', 'ADMIN')).toBe(false);
    expect(hasRole('MEMBER', 'MEMBER')).toBe(true);
  });
});

describe('canCreateChannel', () => {
  it('OWNER can create', () => expect(canCreateChannel('OWNER')).toBe(true));
  it('ADMIN can create', () => expect(canCreateChannel('ADMIN')).toBe(true));
  it('MEMBER cannot create', () => expect(canCreateChannel('MEMBER')).toBe(false));
});

describe('canDeleteChannel', () => {
  it('OWNER can delete', () => expect(canDeleteChannel('OWNER')).toBe(true));
  it('ADMIN can delete', () => expect(canDeleteChannel('ADMIN')).toBe(true));
  it('MEMBER cannot delete', () => expect(canDeleteChannel('MEMBER')).toBe(false));
});

describe('canRenameChannel', () => {
  it('OWNER can rename', () => expect(canRenameChannel('OWNER')).toBe(true));
  it('ADMIN can rename', () => expect(canRenameChannel('ADMIN')).toBe(true));
  it('MEMBER cannot rename', () => expect(canRenameChannel('MEMBER')).toBe(false));
});

describe('canDeleteServer', () => {
  it('only OWNER can delete server', () => {
    expect(canDeleteServer('OWNER')).toBe(true);
    expect(canDeleteServer('ADMIN')).toBe(false);
    expect(canDeleteServer('MEMBER')).toBe(false);
  });
});

describe('canManageInvites', () => {
  it('OWNER can manage', () => expect(canManageInvites('OWNER')).toBe(true));
  it('ADMIN can manage', () => expect(canManageInvites('ADMIN')).toBe(true));
  it('MEMBER cannot manage', () => expect(canManageInvites('MEMBER')).toBe(false));
});

describe('canKickMember', () => {
  it('OWNER can kick ADMIN', () => expect(canKickMember('OWNER', 'ADMIN')).toBe(true));
  it('OWNER can kick MEMBER', () => expect(canKickMember('OWNER', 'MEMBER')).toBe(true));
  it('ADMIN can kick MEMBER', () => expect(canKickMember('ADMIN', 'MEMBER')).toBe(true));
  it('ADMIN cannot kick ADMIN', () => expect(canKickMember('ADMIN', 'ADMIN')).toBe(false));
  it('ADMIN cannot kick OWNER', () => expect(canKickMember('ADMIN', 'OWNER')).toBe(false));
  it('MEMBER cannot kick anyone', () => {
    expect(canKickMember('MEMBER', 'MEMBER')).toBe(false);
    expect(canKickMember('MEMBER', 'ADMIN')).toBe(false);
  });
});

describe('canCreateChannelWithLimit', () => {
  it('ADMIN can create when under limit', () => {
    expect(canCreateChannelWithLimit(10, 'ADMIN', 200)).toBe(true);
  });
  it('ADMIN cannot create when at limit', () => {
    expect(canCreateChannelWithLimit(200, 'ADMIN', 200)).toBe(false);
  });
  it('MEMBER cannot create even under limit', () => {
    expect(canCreateChannelWithLimit(0, 'MEMBER', 200)).toBe(false);
  });
});
