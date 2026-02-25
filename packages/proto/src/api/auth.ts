import { z } from 'zod';

const USERNAME_REGEX = /^[a-z0-9._-]+$/;

export const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Username must be at least 3 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(USERNAME_REGEX, 'Username may only contain a-z, 0-9, dots, underscores, and hyphens');

export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

export const RegisterRequestSchema = z.object({
  username: UsernameSchema,
  password: PasswordSchema,
  displayName: z.string().trim().min(1).max(64).optional(),
  inviteCode: z.string().min(1, 'Invite code is required'),
});

export const LoginRequestSchema = z.object({
  username: UsernameSchema,
  password: PasswordSchema,
});

export const AuthUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
});

export const AuthTokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: AuthUserSchema,
});

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

export const RefreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const MeResponseSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  createdAt: z.string().datetime(),
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type AuthTokenResponse = z.infer<typeof AuthTokenResponseSchema>;
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;
