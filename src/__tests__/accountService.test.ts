/**
 * Unit tests for accountService.
 */
import { prisma } from '../lib/prisma';
import * as accountService from '../services/accountService';

jest.mock('../lib/prisma');

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

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

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// listAccounts
// ---------------------------------------------------------------------------

describe('accountService.listAccounts', () => {
  it('returns accounts ordered by createdAt asc', async () => {
    (mockPrisma.account.findMany as jest.Mock).mockResolvedValue([baseAccount]);

    const result = await accountService.listAccounts('user-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('acct-1');
    expect(mockPrisma.account.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'asc' },
    });
  });
});

// ---------------------------------------------------------------------------
// getAccount
// ---------------------------------------------------------------------------

describe('accountService.getAccount', () => {
  it('returns an account when found', async () => {
    (mockPrisma.account.findFirst as jest.Mock).mockResolvedValue(baseAccount);

    const result = await accountService.getAccount('user-1', 'acct-1');
    expect(result).toEqual(baseAccount);
  });

  it('returns null when account is not found', async () => {
    (mockPrisma.account.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await accountService.getAccount('user-1', 'nonexistent');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createAccount
// ---------------------------------------------------------------------------

describe('accountService.createAccount', () => {
  it('creates an account with the provided fields', async () => {
    (mockPrisma.account.create as jest.Mock).mockResolvedValue(baseAccount);

    const result = await accountService.createAccount('user-1', {
      name: 'Checking',
      type: 'ASSET',
      currency: 'USD',
    });

    expect(result.name).toBe('Checking');
    expect(mockPrisma.account.create).toHaveBeenCalledWith({
      data: {
        name: 'Checking',
        type: 'ASSET',
        currency: 'USD',
        userId: 'user-1',
      },
    });
  });
});

// ---------------------------------------------------------------------------
// updateAccount
// ---------------------------------------------------------------------------

describe('accountService.updateAccount', () => {
  it('updates an account name', async () => {
    const updated = { ...baseAccount, name: 'Savings' };
    (mockPrisma.account.findFirst as jest.Mock).mockResolvedValue(baseAccount);
    (mockPrisma.account.update as jest.Mock).mockResolvedValue(updated);

    const result = await accountService.updateAccount('user-1', 'acct-1', {
      name: 'Savings',
    });

    expect(result.name).toBe('Savings');
    expect(mockPrisma.account.update).toHaveBeenCalledWith({
      where: { id: 'acct-1' },
      data: { name: 'Savings' },
    });
  });

  it('throws 404 when account is not found', async () => {
    (mockPrisma.account.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      accountService.updateAccount('user-1', 'nonexistent', { name: 'Ghost' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ---------------------------------------------------------------------------
// deleteAccount
// ---------------------------------------------------------------------------

describe('accountService.deleteAccount', () => {
  it('deletes an account', async () => {
    (mockPrisma.account.findFirst as jest.Mock).mockResolvedValue(baseAccount);
    (mockPrisma.account.delete as jest.Mock).mockResolvedValue(baseAccount);

    await accountService.deleteAccount('user-1', 'acct-1');

    expect(mockPrisma.account.delete).toHaveBeenCalledWith({
      where: { id: 'acct-1' },
    });
  });

  it('throws 404 when account is not found', async () => {
    (mockPrisma.account.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      accountService.deleteAccount('user-1', 'nonexistent')
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
