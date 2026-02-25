import { describe, it, expect } from 'vitest';
import { AppError, ErrorCode } from '../errors';

describe('AppError', () => {
  it('creates an error with correct properties', () => {
    const err = new AppError(ErrorCode.NOT_FOUND, 'Resource not found', { resourceId: '123' });

    expect(err.code).toBe(ErrorCode.NOT_FOUND);
    expect(err.message).toBe('Resource not found');
    expect(err.httpStatus).toBe(404);
    expect(err.wsCloseCode).toBe(4001);
    expect(err.safeMeta).toEqual({ resourceId: '123' });
    expect(err.name).toBe('AppError');
  });

  it('maps all error codes to HTTP statuses', () => {
    const mappings: [ErrorCode, number][] = [
      [ErrorCode.INTERNAL, 500],
      [ErrorCode.NOT_FOUND, 404],
      [ErrorCode.UNAUTHORIZED, 401],
      [ErrorCode.FORBIDDEN, 403],
      [ErrorCode.VALIDATION, 422],
      [ErrorCode.RATE_LIMITED, 429],
      [ErrorCode.CONFLICT, 409],
      [ErrorCode.BAD_REQUEST, 400],
    ];

    for (const [code, expectedStatus] of mappings) {
      const err = new AppError(code, 'test');
      expect(err.httpStatus).toBe(expectedStatus);
    }
  });

  it('serializes to JSON without internal details', () => {
    const err = new AppError(ErrorCode.FORBIDDEN, 'Not allowed', { channelId: 'ch1' });
    const json = err.toJSON();

    expect(json).toEqual({
      code: 'FORBIDDEN',
      message: 'Not allowed',
      channelId: 'ch1',
    });
    expect(json).not.toHaveProperty('stack');
    expect(json).not.toHaveProperty('httpStatus');
  });

  it('defaults safeMeta to empty object', () => {
    const err = new AppError(ErrorCode.INTERNAL, 'fail');
    expect(err.safeMeta).toEqual({});
  });

  it('is an instance of Error', () => {
    const err = new AppError(ErrorCode.BAD_REQUEST, 'bad');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });
});
