import { z } from 'zod';

export const BaseConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  NODE_ID: z.coerce.number().int().min(0).max(1023).default(0),
});

export type BaseConfig = z.infer<typeof BaseConfigSchema>;

export const DatabaseConfigSchema = z.object({
  DATABASE_URL: z.string().min(1),
});

export const RedisConfigSchema = z.object({
  REDIS_URL: z.string().default('redis://localhost:6379'),
});

export const NatsConfigSchema = z.object({
  NATS_URL: z.string().default('nats://localhost:4222'),
});

export const ApiConfigSchema = BaseConfigSchema.merge(DatabaseConfigSchema)
  .merge(RedisConfigSchema)
  .extend({
    API_HOST: z.string().default('0.0.0.0'),
    API_PORT: z.coerce.number().default(3000),
  });

export const GatewayConfigSchema = BaseConfigSchema.merge(RedisConfigSchema)
  .merge(NatsConfigSchema)
  .extend({
    GATEWAY_HOST: z.string().default('0.0.0.0'),
    GATEWAY_PORT: z.coerce.number().default(4000),
    MAX_PAYLOAD_BYTES: z.coerce.number().default(65536),
    RATE_LIMIT_PER_SECOND: z.coerce.number().default(30),
  });

export const WorkerConfigSchema = BaseConfigSchema.merge(DatabaseConfigSchema)
  .merge(RedisConfigSchema)
  .merge(NatsConfigSchema)
  .extend({
    OUTBOX_POLL_INTERVAL_MS: z.coerce.number().default(1000),
    OUTBOX_BATCH_SIZE: z.coerce.number().default(100),
    WORKER_HEALTHCHECK_PATH: z.string().default('/tmp/.worker-healthy'),
  });

export function loadConfig<T extends z.ZodType>(
  schema: T,
  env: Record<string, string | undefined> = process.env,
): z.infer<T> {
  const result = schema.safeParse(env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Config validation failed:\n${formatted}`);
  }
  return result.data;
}
