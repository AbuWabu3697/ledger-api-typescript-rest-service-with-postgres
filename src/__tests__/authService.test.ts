/**
 * Unit tests for authService — exercises service logic directly
 * without going through the HTTP layer.
 */
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import * as authService from '../services/authService';

jest.mock('../lib/prisma');

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

describe('authService.register', () => {
  it('creates a user and returns a token pair', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.user.create as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'new@example.com',
    });
    (mockPrisma.refreshToken.create as jest.Mock).mockResolvedValue({});

    const tokens = await authService.register({
      email: 'new@example.com',
      password: 'strongpassword',
    });

    expect(tokens).toHaveProperty('accessToken');
    expect(tokens).toHaveProperty('refreshToken');

    const decoded = jwt.verify(tokens.accessToken, JWT_SECRET) as { sub: string; email: string };
    expect(decoded.sub).toBe('user-1');
    expect(decoded.email).toBe('new@example.com');
  });

  it('throws 409 when email is already taken', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'existing-user' });

    await expect(
      authService.register({ email: 'taken@example.com', password: 'strongpassword' })
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

describe('authService.login', () => {
  it('throws 401 when user does not exist', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      authService.login({ email: 'nobody@example.com', password: 'irrelevant' })
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 401 on wrong password', async () => {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('correct-password', 1);

    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      passwordHash: hash,
    });

    await expect(
      authService.login({ email: 'test@example.com', password: 'wrong' })
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

// ---------------------------------------------------------------------------
// refresh
// ---------------------------------------------------------------------------

describe('authService.refresh', () => {
  it('deletes the old token and issues a new pair', async () => {
    const oldRefresh = jwt.sign(
      { sub: 'user-1', email: 'test@example.com' },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    (mockPrisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      token: oldRefresh,
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 60_000),
    });
    (mockPrisma.refreshToken.delete as jest.Mock).mockResolvedValue({});
    (mockPrisma.refreshToken.create as jest.Mock).mockResolvedValue({});

    const tokens = await authService.refresh(oldRefresh);

    expect(tokens).toHaveProperty('accessToken');
    expect(tokens).toHaveProperty('refreshToken');
    expect(mockPrisma.refreshToken.delete).toHaveBeenCalledWith({
      where: { token: oldRefresh },
    });
  });

  it('throws 401 when token is not in the database', async () => {
    const token = jwt.sign(
      { sub: 'user-1', email: 'test@example.com' },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    (mockPrisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(authService.refresh(token)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 401 for a tampered token string', async () => {
    await expect(authService.refresh('not.a.valid.jwt')).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('throws 401 when stored token is past expiresAt', async () => {
    const token = jwt.sign(
      { sub: 'user-1', email: 'test@example.com' },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    (mockPrisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      token,
      userId: 'user-1',
      expiresAt: new Date(Date.now() - 1000), // already past
    });

    await expect(authService.refresh(token)).rejects.toMatchObject({ statusCode: 401 });
  });
});

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------

describe('authService.logout', () => {
  it('deletes the refresh token', async () => {
    (mockPrisma.refreshToken.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

    await authService.logout('some-token');

    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { token: 'some-token' },
    });
  });

  it('silently succeeds when the token does not exist', async () => {
    (mockPrisma.refreshToken.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

    await expect(authService.logout('nonexistent-token')).resolves.toBeUndefined();
  });
});
