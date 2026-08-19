import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { CreateAccountSchema, UpdateAccountSchema } from '../schemas/account';
import * as accountService from '../services/accountService';
import { AuthRequest } from '../types';

const router = Router();

// All account routes require authentication.
router.use(authenticate);

/** GET /accounts — list accounts for the authenticated user */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const accounts = await accountService.listAccounts(req.user!.sub);
    res.json({ data: accounts });
  } catch (err: unknown) {
    const e = err as { message: string; statusCode?: number };
    res.status(e.statusCode ?? 500).json({ error: e.message });
  }
});

/** GET /accounts/:id */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const account = await accountService.getAccount(req.user!.sub, req.params.id);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    res.json({ data: account });
  } catch (err: unknown) {
    const e = err as { message: string; statusCode?: number };
    res.status(e.statusCode ?? 500).json({ error: e.message });
  }
});

/** POST /accounts — create a new account */
router.post('/', validate(CreateAccountSchema), async (req: AuthRequest, res: Response) => {
  try {
    const account = await accountService.createAccount(req.user!.sub, req.body);
    res.status(201).json({ data: account });
  } catch (err: unknown) {
    const e = err as { message: string; statusCode?: number };
    res.status(e.statusCode ?? 500).json({ error: e.message });
  }
});

/** PATCH /accounts/:id — update name */
router.patch('/:id', validate(UpdateAccountSchema), async (req: AuthRequest, res: Response) => {
  try {
    const account = await accountService.updateAccount(req.user!.sub, req.params.id, req.body);
    res.json({ data: account });
  } catch (err: unknown) {
    const e = err as { message: string; statusCode?: number };
    res.status(e.statusCode ?? 500).json({ error: e.message });
  }
});

/** DELETE /accounts/:id */
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await accountService.deleteAccount(req.user!.sub, req.params.id);
    res.status(204).send();
  } catch (err: unknown) {
    const e = err as { message: string; statusCode?: number };
    res.status(e.statusCode ?? 500).json({ error: e.message });
  }
});

export default router;
