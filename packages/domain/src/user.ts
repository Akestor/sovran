export interface User {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface InviteCode {
  id: string;
  codeHash: string;
  createdBy: string | null;
  expiresAt: Date;
  maxUses: number;
  useCount: number;
  createdAt: Date;
}
