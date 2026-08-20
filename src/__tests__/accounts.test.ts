import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import { prisma } from '../lib/prisma';

jest.mock('../lib/prisma');

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const JWT_SECRET = process.env.JWT_SECRET!;

function makeAccessToken(userId = 'user-1', email = 'test@example.com') {
  return jwt.sign({ sub: userId, email }, JWT_SECRET, { expiresIn: '15m' });
}

const baseAccount = {
  id: 'acct-1',
  name: 'Checking',
  type: 'ASSET' as const,
  currency: 'USD',
  balanceCents: BigInt(0),
  userId: 'user-1',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

// ---------------------------------------------------------------------------
// GET /accounts
// ---------------------------------------------------------------------------

describe('GET /accounts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns accounts for the authenticated user', async () => {
    (mockPrisma.account.findMany as jest.Mock).mockResolvedValue([baseAccount]);

    const res = await request(app)
      .get('/accounts')
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe('acct-1');
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/accounts');
    expect(res.status).toBe(401);
  });

  it('returns 401 with a malformed token', async () => {
    const res = await request(app)
      .get('/accounts')
      .set('Authorization', 'Bearer not-a-token');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /accounts/:id
// ---------------------------------------------------------------------------

describe('GET /accounts/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns a single account by id', async () => {
    (mockPrisma.account.findFirst as jest.Mock).mockResolvedValue(baseAccount);

    const res = await request(app)
      .get('/accounts/acct-1')
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('acct-1');
  });

  it('returns 404 when account does not exist', async () => {
    (mockPrisma.account.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .get('/accounts/nonexistent')
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// POST /accounts
// ---------------------------------------------------------------------------

describe('POST /accounts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates an account and returns 201', async () => {
    (mockPrisma.account.create as jest.Mock).mockResolvedValue(baseAccount);

    const res = await request(app)
      .post('/accounts')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ name: 'Checking', type: 'ASSET', currency: 'USD' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('acct-1');
    expect(mockPrisma.account.create).toHaveBeenCalledTimes(1);
  });

  it('returns 400 on missing required fields', async () => {
    const res = await request(app)
      .post('/accounts')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ currency: 'USD' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
  });

  it('returns 400 on invalid account type', async () => {
    const res = await request(app)
      .post('/accounts')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ name: 'Checking', type: 'INVALID' });

    expect(res.status).toBe(400);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app)
      .post('/accounts')
      .send({ name: 'Checking', type: 'ASSET' });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PATCH /accounts/:id
// ---------------------------------------------------------------------------

describe('PATCH /accounts/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates an account name', async () => {
    const updated = { ...baseAccount, name: 'Savings' };
    (mockPrisma.account.findFirst as jest.Mock).mockResolvedValue(baseAccount);
    (mockPrisma.account.update as jest.Mock).mockResolvedValue(updated);

    const res = await request(app)
      .patch('/accounts/acct-1')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ name: 'Savings' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Savings');
  });

  it('returns 404 when account is not found', async () => {
    (mockPrisma.account.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .patch('/accounts/nonexistent')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ name: 'Ghost' });

    expect(res.status).toBe(404);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app)
      .patch('/accounts/acct-1')
      .send({ name: 'Savings' });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /accounts/:id
// ---------------------------------------------------------------------------

describe('DELETE /accounts/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes an account and returns 204', async () => {
    (mockPrisma.account.findFirst as jest.Mock).mockResolvedValue(baseAccount);
    (mockPrisma.account.delete as jest.Mock).mockResolvedValue(baseAccount);

    const res = await request(app)
      .delete('/accounts/acct-1')
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(204);
    expect(mockPrisma.account.delete).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when account is not found', async () => {
    (mockPrisma.account.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .delete('/accounts/nonexistent')
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(404);
  });
});
