import { Request, Response, NextFunction } from 'express';

export type AsyncRequestHandler = (
  req: Request | any,
  res: Response,
  next: NextFunction
) => Promise<any>;

/**
 * Wraps asynchronous Express route handlers to automatically catch any
 * rejected Promise or runtime exception and forward it to Express's next(err).
 * Essential for Express 4.x stability.
 */
export const asyncHandler = (fn: AsyncRequestHandler) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
