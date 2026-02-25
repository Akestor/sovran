import { describe, it, expect } from 'vitest';
import { SendMessageRequestSchema, ListMessagesQuerySchema } from '../api/message';

describe('SendMessageRequestSchema', () => {
  it('accepts valid message', () => {
    const result = SendMessageRequestSchema.safeParse({ content: 'Hello, world!' });
    expect(result.success).toBe(true);
    expect(result.data?.content).toBe('Hello, world!');
  });

  it('trims whitespace', () => {
    const result = SendMessageRequestSchema.safeParse({ content: '  trimmed  ' });
    expect(result.success).toBe(true);
    expect(result.data?.content).toBe('trimmed');
  });

  it('rejects empty content', () => {
    expect(SendMessageRequestSchema.safeParse({ content: '' }).success).toBe(false);
    expect(SendMessageRequestSchema.safeParse({ content: '   ' }).success).toBe(false);
  });

  it('rejects content exceeding 4000 chars', () => {
    const result = SendMessageRequestSchema.safeParse({ content: 'a'.repeat(4001) });
    expect(result.success).toBe(false);
  });

  it('accepts content at max length', () => {
    const result = SendMessageRequestSchema.safeParse({ content: 'a'.repeat(4000) });
    expect(result.success).toBe(true);
  });

  it('accepts optional nonce', () => {
    const result = SendMessageRequestSchema.safeParse({ content: 'test', nonce: 'abc-123' });
    expect(result.success).toBe(true);
    expect(result.data?.nonce).toBe('abc-123');
  });

  it('rejects nonce exceeding 64 chars', () => {
    const result = SendMessageRequestSchema.safeParse({ content: 'test', nonce: 'x'.repeat(65) });
    expect(result.success).toBe(false);
  });
});

describe('ListMessagesQuerySchema', () => {
  it('uses defaults', () => {
    const result = ListMessagesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data?.limit).toBe(50);
    expect(result.data?.before).toBeUndefined();
  });

  it('accepts before and limit', () => {
    const result = ListMessagesQuerySchema.safeParse({ before: '12345', limit: '25' });
    expect(result.success).toBe(true);
    expect(result.data?.before).toBe('12345');
    expect(result.data?.limit).toBe(25);
  });

  it('rejects limit > 100', () => {
    expect(ListMessagesQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });

  it('rejects limit < 1', () => {
    expect(ListMessagesQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });
});
