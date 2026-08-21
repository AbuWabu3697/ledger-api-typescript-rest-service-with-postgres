import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';

const JWT_SECRET = process.env.JWT_SECRET!;

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  it('returns status ok and a timestamp', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('timestamp');
    expect(typeof res.body.timestamp).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// 404 fallback
// ---------------------------------------------------------------------------

describe('unknown routes', () => {
  it('returns 404 for an unmatched path', async () => {
    const res = await request(app).get('/this-does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Not found');
  });
});

// ---------------------------------------------------------------------------
// auth middleware
// ---------------------------------------------------------------------------

describe('auth middleware', () => {
  it('passes a request with a valid Bearer token', async () => {
    const token = jwt.sign(
      { sub: 'user-1', email: 'test@example.com' },
      JWT_SECRET,
      { expiresIn: '15m' }
    );
    // /accounts requires auth; prisma is mocked globally for this module
    // We just need to confirm we get past the auth middleware (i.e. not 401).
    // The service call will fail or return empty, not a 401.
    const { prisma } = require('../lib/prisma');
    (prisma.account.findMany as jest.Mock).mockResolvedValue([]);

    const res = await request(app)
      .get('/accounts')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).not.toBe(401);
  });

  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/accounts');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects a request with a malformed header (no Bearer prefix)', async () => {
    const token = jwt.sign(
      { sub: 'user-1', email: 'test@example.com' },
      JWT_SECRET,
      { expiresIn: '15m' }
    );
    const res = await request(app)
      .get('/accounts')
      .set('Authorization', token); // missing "Bearer "
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const token = jwt.sign(
      { sub: 'user-1', email: 'test@example.com' },
      JWT_SECRET,
      { expiresIn: '-1s' } // already expired
    );
    const res = await request(app)
      .get('/accounts')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Token invalid or expired');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const token = jwt.sign(
      { sub: 'user-1', email: 'test@example.com' },
      'wrong-secret',
      { expiresIn: '15m' }
    );
    const res = await request(app)
      .get('/accounts')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// validate middleware — tested through an auth route
// ---------------------------------------------------------------------------

describe('validate middleware', () => {
  it('returns 400 with structured errors on invalid body', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'pw' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.length).toBeGreaterThan(0);
    // Each detail has path and message
    expect(res.body.details[0]).toHaveProperty('path');
    expect(res.body.details[0]).toHaveProperty('message');
  });

  it('passes a valid body through to the handler', async () => {
    const { prisma } = require('../lib/prisma');
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.user.create as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'valid@example.com',
      passwordHash: 'hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'valid@example.com', password: 'validpassword' });

    expect(res.status).toBe(201);
  });
});
