import { type FastifyInstance } from 'fastify';
import { AppError, ErrorCode } from '@sovran/shared';
import { AuthError, type AuthService } from '@sovran/domain';
import {
  RegisterRequestSchema,
  LoginRequestSchema,
  RefreshRequestSchema,
} from '@sovran/proto';
import { type createAuthMiddleware } from '../plugins/auth';
import { type createRateLimiter } from '../plugins/rate-limit';

interface AuthRouteDeps {
  authService: AuthService;
  authenticate: ReturnType<typeof createAuthMiddleware>;
  authRateLimit: ReturnType<typeof createRateLimiter>;
}

function mapAuthError(err: unknown): never {
  if (err instanceof AuthError) {
    const codeMap: Record<string, ErrorCode> = {
      UNAUTHORIZED: ErrorCode.UNAUTHORIZED,
      CONFLICT: ErrorCode.CONFLICT,
      VALIDATION: ErrorCode.VALIDATION,
      NOT_FOUND: ErrorCode.NOT_FOUND,
    };
    throw new AppError(codeMap[err.kind] ?? ErrorCode.INTERNAL, err.message);
  }
  throw err;
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  const { authService, authenticate, authRateLimit } = deps;

  app.post('/auth/register', { preHandler: [authRateLimit] }, async (request, reply) => {
    const parsed = RegisterRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(ErrorCode.VALIDATION, 'Invalid registration data', {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    try {
      const result = await authService.register(parsed.data);
      return reply.status(201).send({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
      });
    } catch (err) {
      return mapAuthError(err);
    }
  });

  app.post('/auth/login', { preHandler: [authRateLimit] }, async (request, reply) => {
    const parsed = LoginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(ErrorCode.VALIDATION, 'Invalid login data', {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    try {
      const result = await authService.login(parsed.data);
      return reply.status(200).send({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
      });
    } catch (err) {
      return mapAuthError(err);
    }
  });

  app.post('/auth/refresh', { preHandler: [authRateLimit] }, async (request, reply) => {
    const parsed = RefreshRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(ErrorCode.VALIDATION, 'Invalid refresh request');
    }

    try {
      const result = await authService.refresh(parsed.data.refreshToken);
      return reply.status(200).send({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
    } catch (err) {
      return mapAuthError(err);
    }
  });

  app.post('/auth/logout', { preHandler: [authenticate] }, async (request, reply) => {
    const userId = request.userId!;
    await authService.logout(userId);
    return reply.status(204).send();
  });

  app.get('/auth/me', { preHandler: [authenticate] }, async (request, reply) => {
    const userId = request.userId!;
    const user = await authService.getMe(userId);
    if (!user) {
      throw new AppError(ErrorCode.NOT_FOUND, 'User not found');
    }
    return reply.status(200).send({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      createdAt: user.createdAt.toISOString(),
    });
  });
}
