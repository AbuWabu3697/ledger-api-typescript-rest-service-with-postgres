import { Transaction } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { CreateTransactionInput, UpdateTransactionInput } from '../schemas/transaction';

type TransactionWithLines = Transaction & {
  lines: {
    debitAccountId: string;
    creditAccountId: string;
  }[];
};

/**
 * Returns all transactions whose lines reference at least one account
 * owned by `userId`, ordered by date descending.
 */
export async function listTransactions(
  userId: string
): Promise<TransactionWithLines[]> {
  return prisma.transaction.findMany({
    where: {
      lines: {
        some: {
          OR: [
            { debitAccount: { userId } },
            { creditAccount: { userId } },
          ],
        },
      },
    },
    include: {
      lines: { select: { debitAccountId: true, creditAccountId: true } },
    },
    orderBy: { date: 'desc' },
  });
}

/**
 * Returns a single transaction by id, provided one of its lines references
 * an account owned by `userId`. Returns null otherwise.
 */
export async function getTransaction(
  userId: string,
  transactionId: string
): Promise<TransactionWithLines | null> {
  return prisma.transaction.findFirst({
    where: {
      id: transactionId,
      lines: {
        some: {
          OR: [
            { debitAccount: { userId } },
            { creditAccount: { userId } },
          ],
        },
      },
    },
    include: {
      lines: { select: { debitAccountId: true, creditAccountId: true } },
    },
  });
}

/**
 * Creates a transaction and a single double-entry line in a serializable
 * transaction, then updates `balanceCents` on both accounts atomically.
 *
 * `debitAccountId` and `creditAccountId` must both belong to `userId`.
 * Throws 404 if either account is not found.
 * Throws 400 if both ids are identical.
 */
export async function createTransaction(
  userId: string,
  input: CreateTransactionInput
): Promise<TransactionWithLines> {
  if (input.debitAccountId === input.creditAccountId) {
    throw Object.assign(
      new Error('Debit and credit accounts must be different'),
      { statusCode: 400 }
    );
  }

  // Verify ownership of both accounts.
  const accounts = await prisma.account.findMany({
    where: { id: { in: [input.debitAccountId, input.creditAccountId] }, userId },
  });
  if (accounts.length !== 2) {
    throw Object.assign(new Error('One or both accounts not found'), { statusCode: 404 });
  }

  return prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        description: input.description,
        amountCents: BigInt(input.amountCents),
        date: new Date(input.date),
        lines: {
          create: {
            debitAccountId: input.debitAccountId,
            creditAccountId: input.creditAccountId,
          },
        },
      },
      include: {
        lines: { select: { debitAccountId: true, creditAccountId: true } },
      },
    });

    // Update running balances: debit increases asset/expense, decreases others.
    await tx.account.update({
      where: { id: input.debitAccountId },
      data: { balanceCents: { increment: BigInt(input.amountCents) } },
    });
    await tx.account.update({
      where: { id: input.creditAccountId },
      data: { balanceCents: { decrement: BigInt(input.amountCents) } },
    });

    return transaction;
  });
}

/**
 * Updates mutable fields on a transaction (description, date).
 * Throws 404 if the transaction does not reference any account owned by `userId`.
 */
export async function updateTransaction(
  userId: string,
  transactionId: string,
  input: UpdateTransactionInput
): Promise<TransactionWithLines> {
  const existing = await getTransaction(userId, transactionId);
  if (!existing) {
    throw Object.assign(new Error('Transaction not found'), { statusCode: 404 });
  }

  return prisma.transaction.update({
    where: { id: transactionId },
    data: {
      ...(input.description !== undefined && { description: input.description }),
      ...(input.date !== undefined && { date: new Date(input.date) }),
    },
    include: {
      lines: { select: { debitAccountId: true, creditAccountId: true } },
    },
  });
}

/**
 * Deletes a transaction and reverses the balance adjustments on both accounts
 * inside a serializable database transaction.
 * Throws 404 if the transaction does not reference any account owned by `userId`.
 */
export async function deleteTransaction(
  userId: string,
  transactionId: string
): Promise<void> {
  const existing = await getTransaction(userId, transactionId);
  if (!existing) {
    throw Object.assign(new Error('Transaction not found'), { statusCode: 404 });
  }

  await prisma.$transaction(async (tx) => {
    const line = existing.lines[0];

    // Reverse balance adjustments.
    await tx.account.update({
      where: { id: line.debitAccountId },
      data: { balanceCents: { decrement: existing.amountCents } },
    });
    await tx.account.update({
      where: { id: line.creditAccountId },
      data: { balanceCents: { increment: existing.amountCents } },
    });

    await tx.transaction.delete({ where: { id: transactionId } });
  });
}
