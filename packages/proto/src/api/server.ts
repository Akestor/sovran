import { z } from 'zod';

export const CreateServerRequestSchema = z.object({
  name: z.string().trim().min(1, 'Server name is required').max(100, 'Server name must be at most 100 characters'),
});

export const UpdateServerRequestSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
});

export const ServerResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerId: z.string(),
  createdAt: z.string().datetime(),
});

export const ServerListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']),
});

export const CreateChannelRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Channel name is required')
    .max(80, 'Channel name must be at most 80 characters')
    .regex(/^[a-z0-9-]+$/, 'Channel name may only contain a-z, 0-9, and hyphens'),
  type: z.enum(['text']).default('text'),
});

export const RenameChannelRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Channel name may only contain a-z, 0-9, and hyphens'),
});

export const ChannelResponseSchema = z.object({
  id: z.string(),
  serverId: z.string(),
  name: z.string(),
  type: z.string(),
  position: z.number(),
  createdAt: z.string().datetime(),
});

export const MemberResponseSchema = z.object({
  userId: z.string(),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']),
  joinedAt: z.string().datetime(),
});

export const CreateServerInviteRequestSchema = z.object({
  maxUses: z.number().int().min(1).max(1000).default(25),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

export const ServerInviteResponseSchema = z.object({
  code: z.string(),
  expiresAt: z.string().datetime(),
  maxUses: z.number(),
  uses: z.number(),
});

export const JoinServerRequestSchema = z.object({
  inviteCode: z.string().min(1, 'Invite code is required'),
});

export type CreateServerRequest = z.infer<typeof CreateServerRequestSchema>;
export type UpdateServerRequest = z.infer<typeof UpdateServerRequestSchema>;
export type ServerResponse = z.infer<typeof ServerResponseSchema>;
export type ServerListItem = z.infer<typeof ServerListItemSchema>;
export type CreateChannelRequest = z.infer<typeof CreateChannelRequestSchema>;
export type RenameChannelRequest = z.infer<typeof RenameChannelRequestSchema>;
export type ChannelResponse = z.infer<typeof ChannelResponseSchema>;
export type MemberResponse = z.infer<typeof MemberResponseSchema>;
export type CreateServerInviteRequest = z.infer<typeof CreateServerInviteRequestSchema>;
export type ServerInviteResponse = z.infer<typeof ServerInviteResponseSchema>;
export type JoinServerRequest = z.infer<typeof JoinServerRequestSchema>;
