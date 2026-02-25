import { describe, it, expect } from 'vitest';
import { SnowflakeGenerator } from '../id';

describe('SnowflakeGenerator', () => {
  it('generates unique IDs', () => {
    const gen = new SnowflakeGenerator(1);
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(gen.generate());
    }
    expect(ids.size).toBe(1000);
  });

  it('generates monotonically increasing IDs', () => {
    const gen = new SnowflakeGenerator(0);
    let prev = BigInt(gen.generate());
    for (let i = 0; i < 100; i++) {
      const current = BigInt(gen.generate());
      expect(current).toBeGreaterThan(prev);
      prev = current;
    }
  });

  it('parses an ID back to components', () => {
    const gen = new SnowflakeGenerator(42);
    const id = gen.generate();
    const parsed = SnowflakeGenerator.parse(id);

    expect(parsed.nodeId).toBe(42);
    expect(parsed.timestamp).toBeInstanceOf(Date);
    expect(parsed.timestamp.getTime()).toBeGreaterThan(Date.now() - 5000);
    expect(parsed.timestamp.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('rejects invalid nodeId', () => {
    expect(() => new SnowflakeGenerator(-1)).toThrow();
    expect(() => new SnowflakeGenerator(1024)).toThrow();
  });

  it('accepts boundary nodeId values', () => {
    expect(() => new SnowflakeGenerator(0)).not.toThrow();
    expect(() => new SnowflakeGenerator(1023)).not.toThrow();
  });
});
