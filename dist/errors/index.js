"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitError = exports.ConflictError = exports.ValidationError = exports.ForbiddenError = exports.UnauthorizedError = exports.NotFoundError = exports.AppError = void 0;
class AppError extends Error {
    statusCode;
    code;
    isOperational;
    errors;
    constructor(message, statusCode = 500, code = 'INTERNAL_SERVER_ERROR', errors, isOperational = true) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.code = code;
        this.errors = errors;
        this.isOperational = isOperational;
        Object.setPrototypeOf(this, new.target.prototype);
        Error.captureStackTrace(this, this.constructor);
    }
    static badRequest(message, code = 'BAD_REQUEST', errors) {
        return new AppError(message, 400, code, errors);
    }
    static unauthorized(message = 'Authentication required. Please log in.', code = 'UNAUTHORIZED') {
        return new AppError(message, 401, code);
    }
    static forbidden(message = 'You do not have permission to perform this action.', code = 'FORBIDDEN') {
        return new AppError(message, 403, code);
    }
    static notFound(message = 'Requested resource not found.', code = 'NOT_FOUND') {
        return new AppError(message, 404, code);
    }
    static conflict(message, code = 'CONFLICT') {
        return new AppError(message, 409, code);
    }
    static unprocessable(message, errors, code = 'VALIDATION_ERROR') {
        return new AppError(message, 422, code, errors);
    }
}
exports.AppError = AppError;
class NotFoundError extends AppError {
    constructor(message = 'Resource not found', code = 'NOT_FOUND') {
        super(message, 404, code);
    }
}
exports.NotFoundError = NotFoundError;
class UnauthorizedError extends AppError {
    constructor(message = 'Authentication required', code = 'UNAUTHORIZED') {
        super(message, 401, code);
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ForbiddenError extends AppError {
    constructor(message = 'Access forbidden', code = 'FORBIDDEN') {
        super(message, 403, code);
    }
}
exports.ForbiddenError = ForbiddenError;
class ValidationError extends AppError {
    constructor(message = 'Validation failed', errors) {
        super(message, 400, 'VALIDATION_ERROR', errors);
    }
}
exports.ValidationError = ValidationError;
class ConflictError extends AppError {
    constructor(message = 'Resource conflict', code = 'CONFLICT') {
        super(message, 409, code);
    }
}
exports.ConflictError = ConflictError;
class RateLimitError extends AppError {
    constructor(message = 'Too many requests, please try again later.', code = 'RATE_LIMIT_EXCEEDED') {
        super(message, 429, code);
    }
}
exports.RateLimitError = RateLimitError;
