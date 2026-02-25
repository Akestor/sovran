import pino from 'pino';

const PII_PATTERNS = new Set([
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'email',
  'ip',
  'ipaddress',
  'remoteaddress',
  'deviceid',
  'sessionid',
  'authorization',
  'cookie',
  'content',
  'messagecontent',
  'body',
  'attachmentcontent',
]);

function isPiiKey(key: string): boolean {
  return PII_PATTERNS.has(key.toLowerCase());
}

function sanitize(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isPiiKey(key)) {
      result[key] = '[REDACTED]';
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitize(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item !== null && typeof item === 'object'
          ? sanitize(item as Record<string, unknown>)
          : item,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

export interface SafeLogger {
  info(meta: Record<string, unknown>, msg: string): void;
  warn(meta: Record<string, unknown>, msg: string): void;
  error(meta: Record<string, unknown>, msg: string): void;
  debug(meta: Record<string, unknown>, msg: string): void;
  fatal(meta: Record<string, unknown>, msg: string): void;
  child(bindings: Record<string, unknown>): SafeLogger;
}

function wrapPino(logger: pino.Logger): SafeLogger {
  return {
    info(meta: Record<string, unknown>, msg: string) {
      logger.info(sanitize(meta), msg);
    },
    warn(meta: Record<string, unknown>, msg: string) {
      logger.warn(sanitize(meta), msg);
    },
    error(meta: Record<string, unknown>, msg: string) {
      logger.error(sanitize(meta), msg);
    },
    debug(meta: Record<string, unknown>, msg: string) {
      logger.debug(sanitize(meta), msg);
    },
    fatal(meta: Record<string, unknown>, msg: string) {
      logger.fatal(sanitize(meta), msg);
    },
    child(bindings: Record<string, unknown>): SafeLogger {
      return wrapPino(logger.child(sanitize(bindings)));
    },
  };
}

export function createLogger(opts: { name: string; level?: string }): SafeLogger {
  const pinoInstance = pino({
    name: opts.name,
    level: opts.level ?? 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
  });
  return wrapPino(pinoInstance);
}
