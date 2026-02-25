import { z } from 'zod';

export const USER_REGISTERED = 'USER_REGISTERED' as const;
export const USER_DELETED = 'USER_DELETED' as const;

export const UserRegisteredPayload = z.object({
  userId: z.string(),
});

export const UserDeletedPayload = z.object({
  userId: z.string(),
});

export type UserRegistered = z.infer<typeof UserRegisteredPayload>;
export type UserDeleted = z.infer<typeof UserDeletedPayload>;
