import { type Server, type Channel, type Member, type MemberRole, type ServerInvite } from './server';

export interface ServerRepository {
  create(tx: unknown, server: { id: string; name: string; ownerId: string }): Promise<Server>;
  findById(tx: unknown, id: string): Promise<Server | null>;
  updateOwner(tx: unknown, serverId: string, newOwnerId: string): Promise<void>;
  softDelete(tx: unknown, id: string): Promise<void>;
  listByUserId(tx: unknown, userId: string): Promise<Array<{ id: string; name: string; role: MemberRole }>>;
}

export interface ChannelRepository {
  create(tx: unknown, channel: { id: string; serverId: string; name: string; type: string; position: number }): Promise<Channel>;
  findById(tx: unknown, id: string): Promise<Channel | null>;
  findByServerAndName(tx: unknown, serverId: string, name: string): Promise<Channel | null>;
  rename(tx: unknown, id: string, name: string): Promise<void>;
  softDelete(tx: unknown, id: string): Promise<void>;
  listByServerId(tx: unknown, serverId: string): Promise<Channel[]>;
  countByServerId(tx: unknown, serverId: string): Promise<number>;
}

export interface MemberRepository {
  add(tx: unknown, member: { serverId: string; userId: string; role: MemberRole }): Promise<void>;
  remove(tx: unknown, serverId: string, userId: string): Promise<void>;
  findMember(tx: unknown, serverId: string, userId: string): Promise<Member | null>;
  listByServerId(tx: unknown, serverId: string): Promise<Member[]>;
  updateRole(tx: unknown, serverId: string, userId: string, role: MemberRole): Promise<void>;
}

export interface ServerInviteRepository {
  create(tx: unknown, invite: { id: string; serverId: string; codeHash: string; createdBy: string; expiresAt: Date; maxUses: number }): Promise<void>;
  findByCodeHash(tx: unknown, codeHash: string): Promise<ServerInvite | null>;
  incrementUses(tx: unknown, id: string): Promise<void>;
  revoke(tx: unknown, id: string): Promise<void>;
}
