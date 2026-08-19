import { z } from 'zod';

export const CreateTransactionSchema = z.object({
  description: z.string().min(1).max(255),
  amountCents: z.number().int().positive(),
  date: z.string().datetime(),
  debitAccountId: z.string().uuid(),
  creditAccountId: z.string().uuid(),
});

export const UpdateTransactionSchema = z.object({
  description: z.string().min(1).max(255).optional(),
  date: z.string().datetime().optional(),
});

export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof UpdateTransactionSchema>;
