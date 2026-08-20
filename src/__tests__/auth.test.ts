import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import { prisma } from '../lib/prisma';

jest.mock('../lib/prisma');

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAccessToken(userId = 'user-1', email = 'test@example.com') {
  return jwt.sign({ sub: userId, email }, JWT_SECRET, { expiresIn: '15m' });
}

function makeRefreshToken(userId = 'user-1', email = 'test@example.com') {
  return jwt.sign({ sub: userId, email }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

// ---------------------------------------------------------------------------
// POST /auth/register
// ---------------------------------------------------------------------------

describe('POST /auth/register', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a user and returns a token pair', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.user.create as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      passwordHash: '$2a$12$hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    (mockPrisma.refreshToken.create as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
  });

  it('returns 409 when email is already registered', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
    });

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 on missing email', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
    expect(res.body).toHaveProperty('details');
  });

  it('returns 400 on short password', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'test@example.com', password: 'short' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------

describe('POST /auth/login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns tokens on valid credentials', async () => {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('password123', 1);

    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      passwordHash: hash,
    });
    (mockPrisma.refreshToken.create as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
  });

  it('returns 401 when user does not exist', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 401 on wrong password', async () => {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('correct-password', 1);

    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      passwordHash: hash,
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'wrong-password' });

    expect(res.status).toBe(401);
  });

  it('returns 400 on missing body fields', async () => {
    const res = await request(app).post('/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
  });
});

// ---------------------------------------------------------------------------
// POST /auth/refresh
// ---------------------------------------------------------------------------

describe('POST /auth/refresh', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rotates a valid refresh token', async () => {
    const refreshToken = makeRefreshToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    (mockPrisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      token: refreshToken,
      userId: 'user-1',
      expiresAt,
    });
    (mockPrisma.refreshToken.delete as jest.Mock).mockResolvedValue({});
    (mockPrisma.refreshToken.create as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(mockPrisma.refreshToken.delete).toHaveBeenCalledTimes(1);
  });

  it('returns 401 for an unknown token', async () => {
    const refreshToken = makeRefreshToken();
    (mockPrisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(401);
  });

  it('returns 401 for a tampered token', async () => {
    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: 'not.a.valid.token' });

    expect(res.status).toBe(401);
  });

  it('returns 400 when refreshToken field is missing', async () => {
    const res = await request(app).post('/auth/refresh').send({});
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------

describe('POST /auth/logout', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes the refresh token and returns 204', async () => {
    const refreshToken = makeRefreshToken();
    (mockPrisma.refreshToken.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post('/auth/logout')
      .send({ refreshToken });

    expect(res.status).toBe(204);
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { token: refreshToken },
    });
  });

  it('returns 204 even if the token was already deleted (idempotent)', async () => {
    const refreshToken = makeRefreshToken();
    (mockPrisma.refreshToken.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

    const res = await request(app)
      .post('/auth/logout')
      .send({ refreshToken });

    expect(res.status).toBe(204);
  });
});
