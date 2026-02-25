import { type FastifyRequest, type FastifyReply } from 'fastify';
import { AppError, ErrorCode, createLogger } from '@sovran/shared';

const logger = createLogger({ name: 'api:rate-limit' });

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

/**
 * Simple in-memory rate limiter keyed by IP (or fallback).
 * For production: replace with Redis-based limiter.
 */
export function createRateLimiter(opts: { windowMs: number; maxRequests: number }) {
  const buckets = new Map<string, RateLimitBucket>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }, opts.windowMs).unref();

  return async function rateLimit(request: FastifyRequest, _reply: FastifyReply) {
    const key = request.ip ?? 'unknown';
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, bucket);
    }

    bucket.count++;
    if (bucket.count > opts.maxRequests) {
      logger.warn({ requestId: request.id }, 'Rate limit exceeded');
      throw new AppError(ErrorCode.RATE_LIMITED, 'Too many requests, please try again later');
    }
  };
}
