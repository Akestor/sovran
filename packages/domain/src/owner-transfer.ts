import { type Member } from './server';

export interface OwnerTransferResult {
  action: 'transferred' | 'server_deleted';
  newOwnerId?: string;
}

/**
 * Determines what happens when a server owner is deleted.
 * Deterministic: oldest admin by created_at, then oldest member, then delete server.
 */
export function resolveOwnerTransfer(
  members: Member[],
  deletedOwnerId: string,
): OwnerTransferResult {
  const candidates = members
    .filter((m) => m.userId !== deletedOwnerId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const oldestAdmin = candidates.find((m) => m.role === 'ADMIN');
  if (oldestAdmin) {
    return { action: 'transferred', newOwnerId: oldestAdmin.userId };
  }

  const oldestMember = candidates.find((m) => m.role === 'MEMBER');
  if (oldestMember) {
    return { action: 'transferred', newOwnerId: oldestMember.userId };
  }

  return { action: 'server_deleted' };
}
