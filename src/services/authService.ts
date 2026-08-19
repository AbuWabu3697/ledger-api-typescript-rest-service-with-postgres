import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { RegisterInput, LoginInput } from '../schemas/auth';
import { JwtPayload } from '../types';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Creates a new user record with a bcrypt-hashed password.
 * Returns the access/refresh token pair on success.
 * Throws if the email is already taken.
 */
export async function register(input: RegisterInput): Promise<TokenPair> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw Object.assign(new Error('Email already registered'), { statusCode: 409 });
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: { email: input.email, passwordHash },
  });

  return issueTokenPair(user.id, user.email);
}

/**
 * Verifies credentials against the stored bcrypt hash.
 * Returns a new token pair on success.
 * Throws 401 if credentials are invalid.
 */
export async function login(input: LoginInput): Promise<TokenPair> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
  }

  return issueTokenPair(user.id, user.email);
}

/**
 * Validates an existing refresh token, deletes it (rotation), and issues a new pair.
 * Throws 401 if the token is unknown or expired.
 */
export async function refresh(token: string): Promise<TokenPair> {
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, config.jwt.refreshSecret) as JwtPayload;
  } catch {
    throw Object.assign(new Error('Refresh token invalid or expired'), { statusCode: 401 });
  }

  const stored = await prisma.refreshToken.findUnique({ where: { token } });
  if (!stored || stored.expiresAt < new Date()) {
    throw Object.assign(new Error('Refresh token revoked or expired'), { statusCode: 401 });
  }

  // Rotate: delete old token, issue new pair.
  await prisma.refreshToken.delete({ where: { token } });
  return issueTokenPair(payload.sub, payload.email);
}

/**
 * Deletes the given refresh token from the database, ending the session.
 * Silently succeeds if the token is not found.
 */
export async function logout(token: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { token } });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function issueTokenPair(userId: string, email: string): Promise<TokenPair> {
  const jwtPayload: JwtPayload = { sub: userId, email };

  const accessToken = jwt.sign(jwtPayload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
  });

  const refreshToken = jwt.sign(jwtPayload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'],
  });

  // Persist refresh token for rotation tracking.
  const decoded = jwt.decode(refreshToken) as { exp?: number };
  const expiresAt = decoded.exp
    ? new Date(decoded.exp * 1000)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: { token: refreshToken, userId, expiresAt },
  });

  return { accessToken, refreshToken };
}
