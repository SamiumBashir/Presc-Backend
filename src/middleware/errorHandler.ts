import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError';
import { ENV } from '../config/env';

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Developer logging (structured with timestamp, route, method)
  if (ENV.NODE_ENV !== 'test') {
    console.error(`[Error] ${new Date().toISOString()} ${req.method} ${req.originalUrl}:`, {
      name: err.name,
      message: err.message,
      statusCode: err.statusCode || 500,
      code: err.code,
      ...(ENV.NODE_ENV === 'development' ? { stack: err.stack } : {}),
    });
  }

  // 1. AppError (Explicit operational application errors)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
      errors: err.errors || {},
    });
    return;
  }

  // 2. Zod Validation Error
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    err.errors.forEach((issue) => {
      const path = issue.path.join('.') || 'general';
      if (!fieldErrors[path]) {
        fieldErrors[path] = issue.message;
      }
    });

    const firstMessage = Object.values(fieldErrors)[0] || 'Validation failed';

    res.status(400).json({
      success: false,
      message: firstMessage,
      code: 'VALIDATION_ERROR',
      errors: fieldErrors,
    });
    return;
  }

  // 3. Mongoose Schema Validation Error
  if (err.name === 'ValidationError' && err.errors) {
    const fieldErrors: Record<string, string> = {};
    Object.keys(err.errors).forEach((key) => {
      fieldErrors[key] = err.errors[key].message;
    });

    const firstMessage = Object.values(fieldErrors)[0] || 'Validation failed';

    res.status(400).json({
      success: false,
      message: firstMessage,
      code: 'VALIDATION_ERROR',
      errors: fieldErrors,
    });
    return;
  }

  // 4. MongoDB Duplicate Key (E11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'resource';
    const capitalized = field.charAt(0).toUpperCase() + field.slice(1);
    const message = `${capitalized} already exists in the system.`;

    res.status(409).json({
      success: false,
      message,
      code: 'DUPLICATE_RESOURCE',
      errors: { [field]: message },
    });
    return;
  }

  // 5. Mongoose CastError (Malformed ObjectId)
  if (err.name === 'CastError') {
    res.status(404).json({
      success: false,
      message: `Invalid resource identifier '${err.value}'.`,
      code: 'RESOURCE_NOT_FOUND',
      errors: {},
    });
    return;
  }

  // 6. JWT Token Errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      message: 'Invalid session authorization token. Please sign in again.',
      code: 'INVALID_TOKEN',
      errors: {},
    });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      message: 'Your session has expired. Please sign in again.',
      code: 'TOKEN_EXPIRED',
      errors: {},
    });
    return;
  }

  // 7. Generic / Unexpected Internal Error
  const statusCode = typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode <= 599
    ? err.statusCode
    : 500;

  const isProduction = ENV.NODE_ENV === 'production';
  const message = statusCode === 500 && isProduction
    ? 'An unexpected error occurred. Please try again later.'
    : err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    message,
    code: err.code || (statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR'),
    errors: err.errors || {},
    ...(ENV.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
};
