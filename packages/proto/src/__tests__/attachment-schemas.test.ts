import { describe, it, expect } from 'vitest';
import {
  InitAttachmentRequestSchema,
  MAX_ATTACHMENT_SIZE,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from '../api/attachment';

describe('InitAttachmentRequestSchema', () => {
  it('accepts valid init request', () => {
    const result = InitAttachmentRequestSchema.safeParse({
      filename: 'image.png',
      contentType: 'image/png',
      sizeBytes: 1024,
    });
    expect(result.success).toBe(true);
    expect(result.data?.filename).toBe('image.png');
    expect(result.data?.contentType).toBe('image/png');
    expect(result.data?.sizeBytes).toBe(1024);
  });

  it('accepts all allowed content types', () => {
    const types = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];
    for (const ct of types) {
      const result = InitAttachmentRequestSchema.safeParse({
        filename: 'file',
        contentType: ct,
        sizeBytes: 1,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects disallowed content type', () => {
    const result = InitAttachmentRequestSchema.safeParse({
      filename: 'file.exe',
      contentType: 'application/x-msdownload',
      sizeBytes: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects size exceeding MAX_ATTACHMENT_SIZE', () => {
    const result = InitAttachmentRequestSchema.safeParse({
      filename: 'large.pdf',
      contentType: 'application/pdf',
      sizeBytes: MAX_ATTACHMENT_SIZE + 1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts size at MAX_ATTACHMENT_SIZE', () => {
    const result = InitAttachmentRequestSchema.safeParse({
      filename: 'large.pdf',
      contentType: 'application/pdf',
      sizeBytes: MAX_ATTACHMENT_SIZE,
    });
    expect(result.success).toBe(true);
  });

  it('rejects size 0', () => {
    const result = InitAttachmentRequestSchema.safeParse({
      filename: 'empty',
      contentType: 'image/png',
      sizeBytes: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty filename', () => {
    const result = InitAttachmentRequestSchema.safeParse({
      filename: '',
      contentType: 'image/png',
      sizeBytes: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects filename exceeding 255 chars', () => {
    const result = InitAttachmentRequestSchema.safeParse({
      filename: 'a'.repeat(256),
      contentType: 'image/png',
      sizeBytes: 100,
    });
    expect(result.success).toBe(false);
  });

  it('coerces sizeBytes from string', () => {
    const result = InitAttachmentRequestSchema.safeParse({
      filename: 'test.png',
      contentType: 'image/png',
      sizeBytes: '2048',
    });
    expect(result.success).toBe(true);
    expect(result.data?.sizeBytes).toBe(2048);
  });
});

describe('constants', () => {
  it('MAX_ATTACHMENT_SIZE is 10MB', () => {
    expect(MAX_ATTACHMENT_SIZE).toBe(10 * 1024 * 1024);
  });

  it('MAX_ATTACHMENTS_PER_MESSAGE is 5', () => {
    expect(MAX_ATTACHMENTS_PER_MESSAGE).toBe(5);
  });
});
