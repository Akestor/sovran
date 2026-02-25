import { type FastifyRequest } from 'fastify';
import { AppError, ErrorCode } from '@sovran/shared';
import { type TokenService } from '@sovran/domain';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

export function createAuthMiddleware(tokenService: TokenService) {
  return async function authenticate(request: FastifyRequest) {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Missing or invalid authorization header');
    }

    const token = header.slice(7);
    try {
      const { userId } = await tokenService.verifyAccessToken(token);
      request.userId = userId;
    } catch {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Invalid or expired access token');
    }
  };
}
