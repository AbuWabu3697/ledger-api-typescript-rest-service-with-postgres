import { Account } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { CreateAccountInput, UpdateAccountInput } from '../schemas/account';

/**
 * Returns all accounts owned by `userId`, ordered by creation date ascending.
 */
export async function listAccounts(userId: string): Promise<Account[]> {
  return prisma.account.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Returns a single account by id, scoped to `userId`.
 * Returns null if not found or owned by a different user.
 */
export async function getAccount(
  userId: string,
  accountId: string
): Promise<Account | null> {
  return prisma.account.findFirst({
    where: { id: accountId, userId },
  });
}

/**
 * Creates a new account for `userId` with the validated input.
 * `balanceCents` starts at 0 and is updated by transaction writes.
 */
export async function createAccount(
  userId: string,
  input: CreateAccountInput
): Promise<Account> {
  return prisma.account.create({
    data: {
      name: input.name,
      type: input.type,
      currency: input.currency,
      userId,
    },
  });
}

/**
 * Updates mutable fields on an account (currently only `name`).
 * Throws if the account does not exist or belongs to a different user.
 */
export async function updateAccount(
  userId: string,
  accountId: string,
  input: UpdateAccountInput
): Promise<Account> {
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
  });
  if (!account) {
    throw Object.assign(new Error('Account not found'), { statusCode: 404 });
  }

  return prisma.account.update({
    where: { id: accountId },
    data: { name: input.name },
  });
}

/**
 * Deletes an account by id, scoped to `userId`.
 * Throws 404 if the account does not exist or belongs to a different user.
 * Throws 409 if the account has undeleted transaction lines attached.
 */
export async function deleteAccount(
  userId: string,
  accountId: string
): Promise<void> {
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
  });
  if (!account) {
    throw Object.assign(new Error('Account not found'), { statusCode: 404 });
  }

  await prisma.account.delete({ where: { id: accountId } });
}
