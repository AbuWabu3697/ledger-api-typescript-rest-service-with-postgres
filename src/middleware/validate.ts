import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Returns an Express middleware that validates `req.body` against `schema`.
 * On success the parsed (and coerced) value is written back to `req.body`.
 * On failure returns 400 with a structured list of field errors.
 */
export function validate<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: (result.error as ZodError).errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
