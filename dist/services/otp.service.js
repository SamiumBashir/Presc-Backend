"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.invalidateOtpChallenge = exports.getOtpChallenge = exports.saveOtpChallenge = exports.generateResetGrant = exports.verifyOtpMatch = exports.timingSafeVerify = exports.sha256 = exports.hashOtp = exports.generateSecureOtp = void 0;
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../config/env");
const PasswordResetOtp_1 = require("../models/PasswordResetOtp");
/**
 * Generates a cryptographically secure 6-digit numeric OTP.
 * Uses Node.js crypto.randomInt to guarantee uniform randomness and eliminate modulo bias.
 */
const generateSecureOtp = () => {
    return crypto_1.default.randomInt(100000, 1000000).toString();
};
exports.generateSecureOtp = generateSecureOtp;
/**
 * Computes an HMAC-SHA256 digest of the raw OTP using the server-side pepper/secret.
 * This ensures that even if database storage is inspected, raw OTPs cannot be recovered.
 */
const hashOtp = (otp) => {
    const pepper = env_1.ENV.OTP_PEPPER || env_1.ENV.COOKIE_SECRET || 'docpresc_otp_pepper';
    return crypto_1.default.createHmac('sha256', pepper).update(otp.trim()).digest('hex');
};
exports.hashOtp = hashOtp;
/**
 * Legacy SHA-256 hash for backward compatibility.
 */
const sha256 = (value) => {
    return crypto_1.default.createHash('sha256').update(value).digest('hex');
};
exports.sha256 = sha256;
/**
 * Performs a constant-time, timing-safe string comparison between candidate OTP hash and stored hash.
 * Protects against timing attack side-channels.
 */
const timingSafeVerify = (candidateHash, storedHash) => {
    if (!candidateHash || !storedHash)
        return false;
    const candidateBuf = Buffer.from(candidateHash, 'hex');
    const storedBuf = Buffer.from(storedHash, 'hex');
    if (candidateBuf.length !== storedBuf.length)
        return false;
    return crypto_1.default.timingSafeEqual(candidateBuf, storedBuf);
};
exports.timingSafeVerify = timingSafeVerify;
/**
 * Verifies if candidate OTP matches stored hash, trying both HMAC-SHA256 and SHA256.
 */
const verifyOtpMatch = (candidateOtp, storedHash) => {
    const hmacCandidate = (0, exports.hashOtp)(candidateOtp);
    if ((0, exports.timingSafeVerify)(hmacCandidate, storedHash)) {
        return true;
    }
    const shaCandidate = (0, exports.sha256)(candidateOtp.trim());
    return (0, exports.timingSafeVerify)(shaCandidate, storedHash);
};
exports.verifyOtpMatch = verifyOtpMatch;
/**
 * Generates a cryptographically random, 256-bit (32 bytes) single-use password reset authorization grant.
 */
const generateResetGrant = () => {
    const rawToken = crypto_1.default.randomBytes(32).toString('hex');
    const hashedToken = (0, exports.sha256)(rawToken);
    // Reset grant valid for 10 minutes
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    return { rawToken, hashedToken, expiresAt };
};
exports.generateResetGrant = generateResetGrant;
/**
 * Saves or updates challenge state.
 */
const saveOtpChallenge = async (email, otp) => {
    const normalizedEmail = email.toLowerCase().trim();
    const otpHash = (0, exports.hashOtp)(otp);
    const expiresAt = new Date(Date.now() + env_1.ENV.OTP_EXPIRES_IN * 1000);
    await PasswordResetOtp_1.PasswordResetOtp.findOneAndUpdate({ email: normalizedEmail }, {
        email: normalizedEmail,
        otpHash,
        expiresAt,
        attempts: 0,
        lastSentAt: new Date(),
        resetTokenHash: undefined,
        resetTokenExpiresAt: undefined,
        verifiedAt: undefined,
    }, { upsert: true, new: true });
    return { otp, expiresAt };
};
exports.saveOtpChallenge = saveOtpChallenge;
/**
 * Retrieves the pending challenge state.
 */
const getOtpChallenge = async (email) => {
    const normalizedEmail = email.toLowerCase().trim();
    return PasswordResetOtp_1.PasswordResetOtp.findOne({ email: normalizedEmail });
};
exports.getOtpChallenge = getOtpChallenge;
/**
 * Atomically invalidates the OTP challenge upon completion or abort.
 */
const invalidateOtpChallenge = async (email) => {
    const normalizedEmail = email.toLowerCase().trim();
    await PasswordResetOtp_1.PasswordResetOtp.deleteMany({ email: normalizedEmail });
};
exports.invalidateOtpChallenge = invalidateOtpChallenge;
