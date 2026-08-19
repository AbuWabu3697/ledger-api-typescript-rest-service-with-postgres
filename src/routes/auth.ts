import { Router, Request, Response } from 'express';
import { validate } from '../middleware/validate';
import { RegisterSchema, LoginSchema, RefreshSchema } from '../schemas/auth';
import * as authService from '../services/authService';

const router = Router();

/**
 * POST /auth/register
 * Body: { email, password }
 * Returns: { data: { accessToken, refreshToken } }
 */
router.post('/register', validate(RegisterSchema), async (req: Request, res: Response) => {
  try {
    const tokens = await authService.register(req.body);
    res.status(201).json({ data: tokens });
  } catch (err: unknown) {
    const e = err as { message: string; statusCode?: number };
    res.status(e.statusCode ?? 500).json({ error: e.message });
  }
});

/**
 * POST /auth/login
 * Body: { email, password }
 * Returns: { data: { accessToken, refreshToken } }
 */
router.post('/login', validate(LoginSchema), async (req: Request, res: Response) => {
  try {
    const tokens = await authService.login(req.body);
    res.json({ data: tokens });
  } catch (err: unknown) {
    const e = err as { message: string; statusCode?: number };
    res.status(e.statusCode ?? 500).json({ error: e.message });
  }
});

/**
 * POST /auth/refresh
 * Body: { refreshToken }
 * Returns: { data: { accessToken, refreshToken } }
 */
router.post('/refresh', validate(RefreshSchema), async (req: Request, res: Response) => {
  try {
    const tokens = await authService.refresh(req.body.refreshToken);
    res.json({ data: tokens });
  } catch (err: unknown) {
    const e = err as { message: string; statusCode?: number };
    res.status(e.statusCode ?? 500).json({ error: e.message });
  }
});

/**
 * POST /auth/logout
 * Body: { refreshToken }
 * Deletes the token from the rotation store.
 */
router.post('/logout', validate(RefreshSchema), async (req: Request, res: Response) => {
  try {
    await authService.logout(req.body.refreshToken);
    res.status(204).send();
  } catch (err: unknown) {
    const e = err as { message: string; statusCode?: number };
    res.status(e.statusCode ?? 500).json({ error: e.message });
  }
});

export default router;
