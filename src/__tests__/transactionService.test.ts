/**
 * Unit tests for transactionService.
 */
import { prisma } from '../lib/prisma';
import * as transactionService from '../services/transactionService';

jest.mock('../lib/prisma');

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

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

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// listTransactions
// ---------------------------------------------------------------------------

describe('transactionService.listTransactions', () => {
  it('returns transactions for the user', async () => {
    (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([baseTxn]);

    const result = await transactionService.listTransactions('user-1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('txn-1');
  });
});

// ---------------------------------------------------------------------------
// getTransaction
// ---------------------------------------------------------------------------

describe('transactionService.getTransaction', () => {
  it('returns a transaction when found', async () => {
    (mockPrisma.transaction.findFirst as jest.Mock).mockResolvedValue(baseTxn);

    const result = await transactionService.getTransaction('user-1', 'txn-1');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('txn-1');
  });

  it('returns null when transaction is not found', async () => {
    (mockPrisma.transaction.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await transactionService.getTransaction('user-1', 'nonexistent');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createTransaction
// ---------------------------------------------------------------------------

describe('transactionService.createTransaction', () => {
  it('throws 400 when debit and credit accounts are the same', async () => {
    await expect(
      transactionService.createTransaction('user-1', {
        description: 'Self transfer',
        amountCents: 1000,
        date: '2024-03-01T00:00:00.000Z',
        debitAccountId: debitId,
        creditAccountId: debitId,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 404 when one or both accounts are not found', async () => {
    (mockPrisma.account.findMany as jest.Mock).mockResolvedValue([
      { id: debitId, userId: 'user-1' },
      // credit account missing
    ]);

    await expect(
      transactionService.createTransaction('user-1', {
        description: 'Test',
        amountCents: 1000,
        date: '2024-03-01T00:00:00.000Z',
        debitAccountId: debitId,
        creditAccountId: creditId,
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('creates a transaction and updates balances atomically', async () => {
    (mockPrisma.account.findMany as jest.Mock).mockResolvedValue([
      { id: debitId, userId: 'user-1' },
      { id: creditId, userId: 'user-1' },
    ]);
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: Function) =>
      fn(mockPrisma)
    );
    (mockPrisma.transaction.create as jest.Mock).mockResolvedValue(baseTxn);
    (mockPrisma.account.update as jest.Mock).mockResolvedValue({});

    const result = await transactionService.createTransaction('user-1', {
      description: 'Rent payment',
      amountCents: 100000,
      date: '2024-03-01T00:00:00.000Z',
      debitAccountId: debitId,
      creditAccountId: creditId,
    });

    expect(result.id).toBe('txn-1');
    // Both accounts should have been updated (debit incremented, credit decremented)
    expect(mockPrisma.account.update).toHaveBeenCalledTimes(2);
    const calls = (mockPrisma.account.update as jest.Mock).mock.calls;
    const debitCall = calls.find((c: unknown[]) => (c[0] as { where: { id: string } }).where.id === debitId);
    const creditCall = calls.find((c: unknown[]) => (c[0] as { where: { id: string } }).where.id === creditId);
    expect(debitCall[0].data.balanceCents).toEqual({ increment: BigInt(100000) });
    expect(creditCall[0].data.balanceCents).toEqual({ decrement: BigInt(100000) });
  });
});

// ---------------------------------------------------------------------------
// updateTransaction
// ---------------------------------------------------------------------------

describe('transactionService.updateTransaction', () => {
  it('updates the description', async () => {
    const updated = { ...baseTxn, description: 'Updated' };
    (mockPrisma.transaction.findFirst as jest.Mock).mockResolvedValue(baseTxn);
    (mockPrisma.transaction.update as jest.Mock).mockResolvedValue(updated);

    const result = await transactionService.updateTransaction('user-1', 'txn-1', {
      description: 'Updated',
    });

    expect(result.description).toBe('Updated');
  });

  it('throws 404 when transaction is not found', async () => {
    (mockPrisma.transaction.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      transactionService.updateTransaction('user-1', 'nonexistent', { description: 'Ghost' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ---------------------------------------------------------------------------
// deleteTransaction
// ---------------------------------------------------------------------------

describe('transactionService.deleteTransaction', () => {
  it('deletes a transaction and reverses balances', async () => {
    (mockPrisma.transaction.findFirst as jest.Mock).mockResolvedValue(baseTxn);
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: Function) =>
      fn(mockPrisma)
    );
    (mockPrisma.account.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.transaction.delete as jest.Mock).mockResolvedValue({});

    await transactionService.deleteTransaction('user-1', 'txn-1');

    expect(mockPrisma.transaction.delete).toHaveBeenCalledWith({
      where: { id: 'txn-1' },
    });
    expect(mockPrisma.account.update).toHaveBeenCalledTimes(2);
  });

  it('throws 404 when transaction is not found', async () => {
    (mockPrisma.transaction.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      transactionService.deleteTransaction('user-1', 'nonexistent')
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
