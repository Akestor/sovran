export enum ErrorCode {
  INTERNAL = 'INTERNAL',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  VALIDATION = 'VALIDATION',
  RATE_LIMITED = 'RATE_LIMITED',
  CONFLICT = 'CONFLICT',
  BAD_REQUEST = 'BAD_REQUEST',
}

const HTTP_STATUS_MAP: Record<ErrorCode, number> = {
  [ErrorCode.INTERNAL]: 500,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.VALIDATION]: 422,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.BAD_REQUEST]: 400,
};

const WS_CLOSE_MAP: Record<ErrorCode, number> = {
  [ErrorCode.INTERNAL]: 4000,
  [ErrorCode.NOT_FOUND]: 4001,
  [ErrorCode.UNAUTHORIZED]: 4002,
  [ErrorCode.FORBIDDEN]: 4003,
  [ErrorCode.VALIDATION]: 4004,
  [ErrorCode.RATE_LIMITED]: 4005,
  [ErrorCode.CONFLICT]: 4006,
  [ErrorCode.BAD_REQUEST]: 4007,
};

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly httpStatus: number;
  public readonly wsCloseCode: number;
  public readonly safeMeta: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, safeMeta: Record<string, unknown> = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = HTTP_STATUS_MAP[code];
    this.wsCloseCode = WS_CLOSE_MAP[code];
    this.safeMeta = safeMeta;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...this.safeMeta,
    };
  }
}
