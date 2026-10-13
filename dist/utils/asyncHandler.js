"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = void 0;
/**
 * Wraps asynchronous Express route handlers to automatically catch any
 * rejected Promise or runtime exception and forward it to Express's next(err).
 * Essential for Express 4.x stability.
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
exports.asyncHandler = asyncHandler;
