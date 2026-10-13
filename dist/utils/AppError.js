"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
class AppError extends Error {
    statusCode;
    code;
    errors;
    isOperational;
    constructor(message, statusCode = 500, code = 'INTERNAL_SERVER_ERROR', errors) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.code = code;
        this.errors = errors;
        this.isOperational = true;
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
