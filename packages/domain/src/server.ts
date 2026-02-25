export type MemberRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface Server {
  id: string;
  name: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface Channel {
  id: string;
  serverId: string;
  name: string;
  type: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface Member {
  serverId: string;
  userId: string;
  role: MemberRole;
  createdAt: Date;
}

export interface ServerInvite {
  id: string;
  serverId: string;
  codeHash: string;
  createdBy: string;
  expiresAt: Date;
  maxUses: number;
  uses: number;
  revokedAt: Date | null;
  createdAt: Date;
}
