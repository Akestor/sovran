import { describe, it, expect } from 'vitest';
import { loadConfig, BaseConfigSchema, ApiConfigSchema } from '../config';

describe('loadConfig', () => {
  it('parses valid base config with defaults', () => {
    const config = loadConfig(BaseConfigSchema, {});

    expect(config.NODE_ENV).toBe('development');
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.NODE_ID).toBe(0);
  });

  it('parses explicit values', () => {
    const config = loadConfig(BaseConfigSchema, {
      NODE_ENV: 'production',
      LOG_LEVEL: 'error',
      NODE_ID: '512',
    });

    expect(config.NODE_ENV).toBe('production');
    expect(config.LOG_LEVEL).toBe('error');
    expect(config.NODE_ID).toBe(512);
  });

  it('throws on invalid NODE_ENV', () => {
    expect(() =>
      loadConfig(BaseConfigSchema, { NODE_ENV: 'staging' }),
    ).toThrow('Config validation failed');
  });

  it('throws on NODE_ID out of range', () => {
    expect(() =>
      loadConfig(BaseConfigSchema, { NODE_ID: '2000' }),
    ).toThrow('Config validation failed');
  });

  it('requires DATABASE_URL for API config', () => {
    expect(() =>
      loadConfig(ApiConfigSchema, {}),
    ).toThrow('Config validation failed');
  });

  it('parses full API config', () => {
    const config = loadConfig(ApiConfigSchema, {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
    });

    expect(config.DATABASE_URL).toBe('postgresql://test:test@localhost:5432/test');
    expect(config.API_PORT).toBe(3000);
    expect(config.API_HOST).toBe('0.0.0.0');
  });
});
