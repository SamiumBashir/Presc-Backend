"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OTP_CONFIG = exports.PAGINATION = exports.MEDICINE_TYPES = exports.PRESCRIPTION_STATUS = exports.ROLES = exports.HTTP_STATUS = void 0;
exports.HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE_ENTITY: 422,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
};
exports.ROLES = {
    DOCTOR: 'doctor',
    ADMIN: 'admin',
    STAFF: 'staff',
};
exports.PRESCRIPTION_STATUS = {
    DRAFT: 'DRAFT',
    FINALIZED: 'FINALIZED',
    CANCELLED: 'CANCELLED',
};
exports.MEDICINE_TYPES = {
    ALLOPATHIC: 'Allopathic',
    UNANI: 'Unani',
    AYURVEDIC: 'Ayurvedic',
    HERBAL: 'Herbal',
};
exports.PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 200,
};
exports.OTP_CONFIG = {
    EXPIRY_SECONDS: 600, // 10 minutes
    RESEND_COOLDOWN_SECONDS: 60, // 1 minute
    MAX_ATTEMPTS: 5,
};
