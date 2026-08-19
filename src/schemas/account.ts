import { z } from 'zod';

export const AccountTypeEnum = z.enum([
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'EXPENSE',
]);

export const CreateAccountSchema = z.object({
  name: z.string().min(1).max(120),
  type: AccountTypeEnum,
  currency: z.string().length(3).toUpperCase().default('USD'),
});

export const UpdateAccountSchema = z.object({
  name: z.string().min(1).max(120).optional(),
});

export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;
export type UpdateAccountInput = z.infer<typeof UpdateAccountSchema>;
