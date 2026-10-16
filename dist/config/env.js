"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENV = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
dotenv_1.default.config();
const envSchema = zod_1.z.object({
    PORT: zod_1.z.coerce.number().default(5000),
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    MONGODB_URI: zod_1.z.string().default(''),
    JWT_SECRET: zod_1.z.string().default('doctor_prescription_super_secret_jwt_key_2026'),
    JWT_EXPIRES_IN: zod_1.z.string().default('7d'),
    COOKIE_SECRET: zod_1.z.string().default('cookie_secret_prescription_2026'),
    CORS_ORIGIN: zod_1.z.string().default('http://localhost:5173'),
    EMAIL_PROVIDER: zod_1.z.string().default('smtp').transform((val) => val.trim().toLowerCase()),
    ENABLE_EMAIL_FALLBACK: zod_1.z.preprocess((val) => val === 'true' || val === true, zod_1.z.boolean().default(false)),
    RESEND_API_KEY: zod_1.z.string().default(''),
    BREVO_API_KEY: zod_1.z.string().default(''),
    EMAIL_FROM: zod_1.z.string().default('Doc Presc <7232.badhan@gmail.com>'),
    SMTP_HOST: zod_1.z.string().default('smtp.gmail.com'),
    SMTP_PORT: zod_1.z.coerce.number().default(465),
    SMTP_USER: zod_1.z.string().default(''),
    SMTP_PASS: zod_1.z.string().default(''),
    OTP_EXPIRES_IN: zod_1.z.coerce.number().default(600), // 10 minutes OTP TTL
    OTP_RESEND_COOLDOWN: zod_1.z.coerce.number().default(60), // 60s cooldown
    OTP_PEPPER: zod_1.z.string().default('docpresc_otp_security_pepper_2026'),
    REDIS_URL: zod_1.z.string().default(''),
    CLOUDINARY_CLOUD_NAME: zod_1.z.string().default(''),
    CLOUDINARY_API_KEY: zod_1.z.string().default(''),
    CLOUDINARY_API_SECRET: zod_1.z.string().default(''),
});
const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
    console.error('[Config] Invalid environment variables:', parsedEnv.error.flatten().fieldErrors);
}
exports.ENV = parsedEnv.success ? parsedEnv.data : {
    PORT: Number(process.env.PORT) || 5000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    MONGODB_URI: process.env.MONGODB_URI || '',
    JWT_SECRET: process.env.JWT_SECRET || 'doctor_prescription_super_secret_jwt_key_2026',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
    COOKIE_SECRET: process.env.COOKIE_SECRET || 'cookie_secret_prescription_2026',
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
    EMAIL_PROVIDER: (process.env.EMAIL_PROVIDER || 'smtp').trim().toLowerCase(),
    ENABLE_EMAIL_FALLBACK: process.env.ENABLE_EMAIL_FALLBACK === 'true',
    RESEND_API_KEY: process.env.RESEND_API_KEY || '',
    BREVO_API_KEY: process.env.BREVO_API_KEY || '',
    EMAIL_FROM: process.env.EMAIL_FROM || 'Doc Presc <7232.badhan@gmail.com>',
    SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
    SMTP_PORT: Number(process.env.SMTP_PORT) || 465,
    SMTP_USER: process.env.SMTP_USER || '',
    SMTP_PASS: process.env.SMTP_PASS || '',
    OTP_EXPIRES_IN: Number(process.env.OTP_EXPIRES_IN) || 600,
    OTP_RESEND_COOLDOWN: Number(process.env.OTP_RESEND_COOLDOWN) || 60,
    OTP_PEPPER: process.env.OTP_PEPPER || 'docpresc_otp_security_pepper_2026',
    REDIS_URL: process.env.REDIS_URL || '',
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',
};
