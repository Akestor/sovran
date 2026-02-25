import { type MemberRole } from './server';

const ROLE_HIERARCHY: Record<MemberRole, number> = {
  OWNER: 3,
  ADMIN: 2,
  MEMBER: 1,
};

export function hasRole(userRole: MemberRole, requiredRole: MemberRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export function canCreateChannel(role: MemberRole): boolean {
  return hasRole(role, 'ADMIN');
}

export function canDeleteChannel(role: MemberRole): boolean {
  return hasRole(role, 'ADMIN');
}

export function canRenameChannel(role: MemberRole): boolean {
  return hasRole(role, 'ADMIN');
}

export function canDeleteServer(role: MemberRole): boolean {
  return role === 'OWNER';
}

export function canManageInvites(role: MemberRole): boolean {
  return hasRole(role, 'ADMIN');
}

export function canKickMember(actorRole: MemberRole, targetRole: MemberRole): boolean {
  if (actorRole === 'MEMBER') return false;
  return ROLE_HIERARCHY[actorRole] > ROLE_HIERARCHY[targetRole];
}

export function canCreateChannelWithLimit(
  currentCount: number,
  role: MemberRole,
  maxChannels: number,
): boolean {
  return canCreateChannel(role) && currentCount < maxChannels;
}
