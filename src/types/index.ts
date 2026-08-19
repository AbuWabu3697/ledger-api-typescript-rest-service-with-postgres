import { Request } from 'express';

/** Payload embedded in a signed JWT. */
export interface JwtPayload {
  sub: string;   // user id
  email: string;
  iat?: number;
  exp?: number;
}

/** Express Request extended with the authenticated user's identity. */
export interface AuthRequest extends Request {
  user?: JwtPayload;
}

/** Standard JSON envelope returned by every route. */
export interface ApiResponse<T = unknown> {
  data: T;
  error?: never;
}

export interface ApiError {
  error: string;
  details?: unknown;
  data?: never;
}
