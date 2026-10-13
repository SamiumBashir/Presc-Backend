import crypto from 'crypto';
import { ENV } from '../config/env';
import { PasswordResetOtp } from '../models/PasswordResetOtp';

/**
 * Key convention aligned with Redis cache architecture:
 * auth:password-reset:challenge:<email>
 * auth:password-reset:attempts:<email>
 * auth:password-reset:grant:<grant-hash>
 * auth:password-reset:cooldown:<email>
 */

export interface IOtpChallengeState {
  email: string;
  otpHash: string;
  expiresAt: Date;
  attempts: number;
  lastSentAt: Date;
  resetTokenHash?: string;
  resetTokenExpiresAt?: Date;
  verifiedAt?: Date;
}

/**
 * Generates a cryptographically secure 6-digit numeric OTP.
 * Uses Node.js crypto.randomInt to guarantee uniform randomness and eliminate modulo bias.
 */
export const generateSecureOtp = (): string => {
  return crypto.randomInt(100000, 1000000).toString();
};

/**
 * Computes an HMAC-SHA256 digest of the raw OTP using the server-side pepper/secret.
 * This ensures that even if database storage is inspected, raw OTPs cannot be recovered.
 */
export const hashOtp = (otp: string): string => {
  const pepper = ENV.OTP_PEPPER || ENV.COOKIE_SECRET || 'docpresc_otp_pepper';
  return crypto.createHmac('sha256', pepper).update(otp.trim()).digest('hex');
};

/**
 * Legacy SHA-256 hash for backward compatibility.
 */
export const sha256 = (value: string): string => {
  return crypto.createHash('sha256').update(value).digest('hex');
};

/**
 * Performs a constant-time, timing-safe string comparison between candidate OTP hash and stored hash.
 * Protects against timing attack side-channels.
 */
export const timingSafeVerify = (candidateHash: string, storedHash: string): boolean => {
  if (!candidateHash || !storedHash) return false;
  const candidateBuf = Buffer.from(candidateHash, 'hex');
  const storedBuf = Buffer.from(storedHash, 'hex');
  if (candidateBuf.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(candidateBuf, storedBuf);
};

/**
 * Verifies if candidate OTP matches stored hash, trying both HMAC-SHA256 and SHA256.
 */
export const verifyOtpMatch = (candidateOtp: string, storedHash: string): boolean => {
  const hmacCandidate = hashOtp(candidateOtp);
  if (timingSafeVerify(hmacCandidate, storedHash)) {
    return true;
  }
  const shaCandidate = sha256(candidateOtp.trim());
  return timingSafeVerify(shaCandidate, storedHash);
};

/**
 * Generates a cryptographically random, 256-bit (32 bytes) single-use password reset authorization grant.
 */
export const generateResetGrant = (): { rawToken: string; hashedToken: string; expiresAt: Date } => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = sha256(rawToken);
  // Reset grant valid for 10 minutes
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  return { rawToken, hashedToken, expiresAt };
};

/**
 * Saves or updates challenge state.
 */
export const saveOtpChallenge = async (
  email: string,
  otp: string
): Promise<{ otp: string; expiresAt: Date }> => {
  const normalizedEmail = email.toLowerCase().trim();
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(Date.now() + ENV.OTP_EXPIRES_IN * 1000);

  await PasswordResetOtp.findOneAndUpdate(
    { email: normalizedEmail },
    {
      email: normalizedEmail,
      otpHash,
      expiresAt,
      attempts: 0,
      lastSentAt: new Date(),
      resetTokenHash: undefined,
      resetTokenExpiresAt: undefined,
      verifiedAt: undefined,
    },
    { upsert: true, new: true }
  );

  return { otp, expiresAt };
};

/**
 * Retrieves the pending challenge state.
 */
export const getOtpChallenge = async (email: string) => {
  const normalizedEmail = email.toLowerCase().trim();
  return PasswordResetOtp.findOne({ email: normalizedEmail });
};

/**
 * Atomically invalidates the OTP challenge upon completion or abort.
 */
export const invalidateOtpChallenge = async (email: string) => {
  const normalizedEmail = email.toLowerCase().trim();
  await PasswordResetOtp.deleteMany({ email: normalizedEmail });
};
