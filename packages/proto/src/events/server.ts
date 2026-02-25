import { z } from 'zod';

export const SERVER_MEMBER_JOIN = 'SERVER_MEMBER_JOIN' as const;
export const SERVER_MEMBER_LEAVE = 'SERVER_MEMBER_LEAVE' as const;
export const SERVER_DELETE = 'SERVER_DELETE' as const;
export const SERVER_OWNER_TRANSFERRED = 'SERVER_OWNER_TRANSFERRED' as const;

export const CHANNEL_CREATE = 'CHANNEL_CREATE' as const;
export const CHANNEL_DELETE = 'CHANNEL_DELETE' as const;
export const CHANNEL_RENAME = 'CHANNEL_RENAME' as const;

export const ServerMemberJoinPayload = z.object({
  serverId: z.string(),
  userId: z.string(),
  role: z.string(),
});

export const ServerMemberLeavePayload = z.object({
  serverId: z.string(),
  userId: z.string(),
});

export const ServerDeletePayload = z.object({
  serverId: z.string(),
});

export const ServerOwnerTransferredPayload = z.object({
  serverId: z.string(),
  previousOwnerId: z.string(),
  newOwnerId: z.string(),
});

export const ChannelCreatePayload = z.object({
  serverId: z.string(),
  channelId: z.string(),
  name: z.string(),
  type: z.string(),
});

export const ChannelDeletePayload = z.object({
  serverId: z.string(),
  channelId: z.string(),
});

export const ChannelRenamePayload = z.object({
  serverId: z.string(),
  channelId: z.string(),
  name: z.string(),
});

export type ServerMemberJoin = z.infer<typeof ServerMemberJoinPayload>;
export type ServerMemberLeave = z.infer<typeof ServerMemberLeavePayload>;
export type ServerDelete = z.infer<typeof ServerDeletePayload>;
export type ServerOwnerTransferred = z.infer<typeof ServerOwnerTransferredPayload>;
export type ChannelCreate = z.infer<typeof ChannelCreatePayload>;
export type ChannelDelete = z.infer<typeof ChannelDeletePayload>;
export type ChannelRename = z.infer<typeof ChannelRenamePayload>;
