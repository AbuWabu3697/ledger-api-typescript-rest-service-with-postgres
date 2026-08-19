import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { CreateTransactionSchema, UpdateTransactionSchema } from '../schemas/transaction';
import * as transactionService from '../services/transactionService';
import { AuthRequest } from '../types';

const router = Router();

router.use(authenticate);

/** GET /transactions — list transactions visible to the authenticated user */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const txns = await transactionService.listTransactions(req.user!.sub);
    // Serialize BigInt balances as strings for JSON transport.
    res.json({ data: txns.map(serializeTransaction) });
  } catch (err: unknown) {
    const e = err as { message: string; statusCode?: number };
    res.status(e.statusCode ?? 500).json({ error: e.message });
  }
});

/** GET /transactions/:id */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const txn = await transactionService.getTransaction(req.user!.sub, req.params.id);
    if (!txn) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }
    res.json({ data: serializeTransaction(txn) });
  } catch (err: unknown) {
    const e = err as { message: string; statusCode?: number };
    res.status(e.statusCode ?? 500).json({ error: e.message });
  }
});

/** POST /transactions — create a double-entry transaction */
router.post(
  '/',
  validate(CreateTransactionSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const txn = await transactionService.createTransaction(req.user!.sub, req.body);
      res.status(201).json({ data: serializeTransaction(txn) });
    } catch (err: unknown) {
      const e = err as { message: string; statusCode?: number };
      res.status(e.statusCode ?? 500).json({ error: e.message });
    }
  }
);

/** PATCH /transactions/:id — update description or date */
router.patch(
  '/:id',
  validate(UpdateTransactionSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const txn = await transactionService.updateTransaction(
        req.user!.sub,
        req.params.id,
        req.body
      );
      res.json({ data: serializeTransaction(txn) });
    } catch (err: unknown) {
      const e = err as { message: string; statusCode?: number };
      res.status(e.statusCode ?? 500).json({ error: e.message });
    }
  }
);

/** DELETE /transactions/:id — delete and reverse balance adjustments */
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await transactionService.deleteTransaction(req.user!.sub, req.params.id);
    res.status(204).send();
  } catch (err: unknown) {
    const e = err as { message: string; statusCode?: number };
    res.status(e.statusCode ?? 500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serializeTransaction(txn: { amountCents: bigint; [key: string]: unknown }) {
  return {
    ...txn,
    amountCents: txn.amountCents.toString(),
  };
}

export default router;
