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

const debitId = '00000000-0000-0000-0000-000000000001';
const creditId = '00000000-0000-0000-0000-000000000002';

const baseTxn = {
  id: 'txn-1',
  description: 'Rent payment',
  amountCents: BigInt(100000),
  date: new Date('2024-03-01'),
  createdAt: new Date('2024-03-01'),
  updatedAt: new Date('2024-03-01'),
  lines: [{ debitAccountId: debitId, creditAccountId: creditId }],
};

// ---------------------------------------------------------------------------
// GET /transactions
// ---------------------------------------------------------------------------

describe('GET /transactions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns transactions for the authenticated user', async () => {
    (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([baseTxn]);

    const res = await request(app)
      .get('/transactions')
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    // amountCents is serialized as a string for JSON transport
    expect(res.body.data[0].amountCents).toBe('100000');
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/transactions');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /transactions/:id
// ---------------------------------------------------------------------------

describe('GET /transactions/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns a transaction by id', async () => {
    (mockPrisma.transaction.findFirst as jest.Mock).mockResolvedValue(baseTxn);

    const res = await request(app)
      .get('/transactions/txn-1')
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('txn-1');
    expect(res.body.data.amountCents).toBe('100000');
  });

  it('returns 404 when transaction does not exist', async () => {
    (mockPrisma.transaction.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .get('/transactions/nonexistent')
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// POST /transactions
// ---------------------------------------------------------------------------

describe('POST /transactions', () => {
  beforeEach(() => jest.clearAllMocks());

  const validBody = {
    description: 'Rent payment',
    amountCents: 100000,
    date: '2024-03-01T00:00:00.000Z',
    debitAccountId: debitId,
    creditAccountId: creditId,
  };

  it('creates a double-entry transaction and returns 201', async () => {
    (mockPrisma.account.findMany as jest.Mock).mockResolvedValue([
      { id: debitId, userId: 'user-1' },
      { id: creditId, userId: 'user-1' },
    ]);
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: Function) =>
      fn(mockPrisma)
    );
    (mockPrisma.transaction.create as jest.Mock).mockResolvedValue(baseTxn);
    (mockPrisma.account.update as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/transactions')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('txn-1');
    expect(res.body.data.amountCents).toBe('100000');
  });

  it('returns 400 when debit and credit accounts are the same', async () => {
    const res = await request(app)
      .post('/transactions')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ ...validBody, creditAccountId: debitId });

    expect(res.status).toBe(400);
  });

  it('returns 404 when one account is not owned by the user', async () => {
    (mockPrisma.account.findMany as jest.Mock).mockResolvedValue([
      { id: debitId, userId: 'user-1' },
      // credit account missing — belongs to a different user
    ]);

    const res = await request(app)
      .post('/transactions')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send(validBody);

    expect(res.status).toBe(404);
  });

  it('returns 400 on missing required fields', async () => {
    const res = await request(app)
      .post('/transactions')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ description: 'Missing amount and accounts' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
  });

  it('returns 400 on negative amountCents', async () => {
    const res = await request(app)
      .post('/transactions')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ ...validBody, amountCents: -500 });

    expect(res.status).toBe(400);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).post('/transactions').send(validBody);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PATCH /transactions/:id
// ---------------------------------------------------------------------------

describe('PATCH /transactions/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates description and returns the updated transaction', async () => {
    const updated = { ...baseTxn, description: 'Updated description' };
    (mockPrisma.transaction.findFirst as jest.Mock).mockResolvedValue(baseTxn);
    (mockPrisma.transaction.update as jest.Mock).mockResolvedValue(updated);

    const res = await request(app)
      .patch('/transactions/txn-1')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ description: 'Updated description' });

    expect(res.status).toBe(200);
    expect(res.body.data.description).toBe('Updated description');
  });

  it('returns 404 when transaction is not found', async () => {
    (mockPrisma.transaction.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .patch('/transactions/nonexistent')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ description: 'Ghost' });

    expect(res.status).toBe(404);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app)
      .patch('/transactions/txn-1')
      .send({ description: 'No auth' });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /transactions/:id
// ---------------------------------------------------------------------------

describe('DELETE /transactions/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes a transaction, reverses balances, and returns 204', async () => {
    (mockPrisma.transaction.findFirst as jest.Mock).mockResolvedValue(baseTxn);
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: Function) =>
      fn(mockPrisma)
    );
    (mockPrisma.account.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.transaction.delete as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .delete('/transactions/txn-1')
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(204);
  });

  it('returns 404 when transaction is not found', async () => {
    (mockPrisma.transaction.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .delete('/transactions/nonexistent')
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(404);
  });
});
