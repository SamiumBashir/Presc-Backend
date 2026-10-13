export const HTTP_STATUS = {
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
} as const;

export const ROLES = {
  DOCTOR: 'doctor',
  ADMIN: 'admin',
  STAFF: 'staff',
} as const;

export const PRESCRIPTION_STATUS = {
  DRAFT: 'DRAFT',
  FINALIZED: 'FINALIZED',
  CANCELLED: 'CANCELLED',
} as const;

export const MEDICINE_TYPES = {
  ALLOPATHIC: 'Allopathic',
  UNANI: 'Unani',
  AYURVEDIC: 'Ayurvedic',
  HERBAL: 'Herbal',
} as const;

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 200,
} as const;

export const OTP_CONFIG = {
  EXPIRY_SECONDS: 600, // 10 minutes
  RESEND_COOLDOWN_SECONDS: 60, // 1 minute
  MAX_ATTEMPTS: 5,
} as const;
