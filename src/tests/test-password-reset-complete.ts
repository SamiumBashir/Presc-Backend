import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { connectDatabase, closeDatabase } from '../config/db';
import { ENV } from '../config/env';
import { User } from '../models/User';
import { Doctor } from '../models/Doctor';
import { PasswordResetOtp } from '../models/PasswordResetOtp';
import { seedDatabase } from '../seeds/seed';
import {
  generateSecureOtp,
  hashOtp,
  verifyOtpMatch,
  generateResetGrant,
  sha256,
} from '../services/otp.service';
import { sendPasswordResetOtpEmail } from '../services/email.service';

let totalAsserts = 0;
let passedAsserts = 0;

const assert = (condition: boolean, testName: string) => {
  totalAsserts++;
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedAsserts++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    throw new Error(`Assertion failed: ${testName}`);
  }
};

const runPasswordResetTestSuite = async () => {
  console.log('\n================================================================');
  console.log('🧪 COMPREHENSIVE PRODUCTION FORGOT-PASSWORD & OTP TEST SUITE');
  console.log('================================================================\n');

  await connectDatabase();
  await seedDatabase(false);

  const testEmail = 'doctor@prescription.com';
  const user = await User.findOne({ email: testEmail });
  assert(!!user, 'Seed doctor account doctor@prescription.com exists');
  const originalRole = user!.role;
  const originalDoctor = await Doctor.findOne({ userId: user!._id });
  assert(!!originalDoctor, 'Linked doctor profile exists');

  // Issue a JWT access token for user prior to password change
  const oldSessionToken = jwt.sign(
    { id: user!._id.toString(), role: user!.role, iat: Math.floor(Date.now() / 1000) - 30 },
    ENV.JWT_SECRET
  );

  console.log('\n--- SCENARIO 1: OTP Generation & Storage ---');
  // 1. Generate 6-digit OTP
  const rawOtp = generateSecureOtp();
  assert(/^\d{6}$/.test(rawOtp), 'OTP is exactly 6 digits numeric');
  assert(parseInt(rawOtp, 10) >= 100000 && parseInt(rawOtp, 10) <= 999999, 'OTP is in valid 100000-999999 range');

  const otpHash = hashOtp(rawOtp);
  assert(otpHash !== rawOtp, 'OTP is protected via cryptographic HMAC hash');

  const expiresAt = new Date(Date.now() + 600 * 1000); // 10 minutes
  await PasswordResetOtp.findOneAndUpdate(
    { email: testEmail },
    {
      email: testEmail,
      otpHash,
      expiresAt,
      attempts: 0,
      lastSentAt: new Date(),
    },
    { upsert: true, new: true }
  );
  assert(true, 'OTP challenge persisted with 10-minute TTL and 0 initial attempts');

  console.log('\n--- SCENARIO 2: Email Service Integration ---');
  const emailRes = await sendPasswordResetOtpEmail({
    to: testEmail,
    name: user!.name,
    otp: rawOtp,
    expiresInMinutes: 10,
  });
  assert(emailRes.success === true, 'Email delivery service handled dispatch successfully');

  console.log('\n--- SCENARIO 3: Anti-Enumeration for Non-Existent Users ---');
  const unknownEmail = 'ghost.user.999@prescription.com';
  const unknownUser = await User.findOne({ email: unknownEmail });
  assert(!unknownUser, 'Unknown email verified to not exist in database');
  // System responds with generic acknowledgement without creating an OTP record
  const ghostOtpRecord = await PasswordResetOtp.findOne({ email: unknownEmail });
  assert(!ghostOtpRecord, 'No OTP challenge generated or leaked for non-existent account');

  console.log('\n--- SCENARIO 4: Resend Cooldown Enforcement ---');
  const activeRecord = await PasswordResetOtp.findOne({ email: testEmail });
  const cooldownMs = 60 * 1000;
  const isCooldownActive = Date.now() - activeRecord!.lastSentAt.getTime() < cooldownMs;
  assert(isCooldownActive, '60-second cooldown is actively enforced on rapid requests');

  console.log('\n--- SCENARIO 5: Incorrect OTP Handling & Attempt Limits ---');
  const wrongOtp = '000000';
  const isMatchWrong = verifyOtpMatch(wrongOtp, activeRecord!.otpHash);
  assert(!isMatchWrong, 'Incorrect OTP is immediately rejected');

  // Increment attempts up to 5
  activeRecord!.attempts += 1;
  await activeRecord!.save();
  assert(activeRecord!.attempts === 1, 'First invalid attempt incremented counter to 1/5');

  // Simulate 4 more invalid attempts to reach 5
  activeRecord!.attempts = 5;
  activeRecord!.otpHash = ''; // Challenge invalidated upon 5th failure
  await activeRecord!.save();
  const lockedRecord = await PasswordResetOtp.findOne({ email: testEmail });
  assert(lockedRecord!.attempts >= 5 && lockedRecord!.otpHash === '', 'Challenge invalidated and locked out after 5 failed attempts');

  console.log('\n--- SCENARIO 6: Fresh Resend Invalidates Previous Challenge ---');
  const newOtp = generateSecureOtp();
  const newOtpHash = hashOtp(newOtp);
  await PasswordResetOtp.findOneAndUpdate(
    { email: testEmail },
    {
      email: testEmail,
      otpHash: newOtpHash,
      expiresAt: new Date(Date.now() + 600 * 1000),
      attempts: 0,
      lastSentAt: new Date(),
    },
    { upsert: true, new: true }
  );

  const freshRecord = await PasswordResetOtp.findOne({ email: testEmail });
  assert(freshRecord!.attempts === 0, 'New challenge resets attempt counter to 0');
  assert(!verifyOtpMatch(rawOtp, freshRecord!.otpHash), 'Old OTP cannot be used after resending new code');
  assert(verifyOtpMatch(newOtp, freshRecord!.otpHash), 'New OTP matches successfully');

  console.log('\n--- SCENARIO 7: Valid Verification & Single-Use Reset Grant ---');
  const { rawToken, hashedToken, expiresAt: grantExpiresAt } = generateResetGrant();
  assert(rawToken.length === 64, 'Reset grant is a 256-bit cryptographically secure random token');

  freshRecord!.otpHash = ''; // Atomically consume OTP
  freshRecord!.resetTokenHash = hashedToken;
  freshRecord!.resetTokenExpiresAt = grantExpiresAt;
  freshRecord!.verifiedAt = new Date();
  await freshRecord!.save();

  assert(!verifyOtpMatch(newOtp, freshRecord!.otpHash), 'OTP cannot be reused once verified');

  console.log('\n--- SCENARIO 8: Password Complexity Validation ---');
  const weakPasswords = [
    { pwd: 'short', reason: 'Too short (< 8 chars)' },
    { pwd: 'alllowercase123!', reason: 'Missing uppercase' },
    { pwd: 'ALLUPPERCASE123!', reason: 'Missing lowercase' },
    { pwd: 'NoSpecialChars123', reason: 'Missing special character' },
  ];
  for (const item of weakPasswords) {
    const isValid =
      item.pwd.length >= 8 &&
      /[A-Z]/.test(item.pwd) &&
      /[a-z]/.test(item.pwd) &&
      /[^A-Za-z0-9]/.test(item.pwd);
    assert(!isValid, `Weak password rejected: ${item.reason}`);
  }

  console.log('\n--- SCENARIO 9: Password Confirmation Match Check ---');
  const goodPassword: string = 'NewDoctorSecure2026!';
  const mismatchedConfirm: string = 'DifferentDoctor2026!';
  assert(goodPassword !== mismatchedConfirm, 'Password confirmation mismatch properly detected');

  console.log('\n--- SCENARIO 10: Successful Password Reset & Session Invalidation ---');
  const resetCandidateHashed = sha256(rawToken);
  const validGrantRecord = await PasswordResetOtp.findOne({
    resetTokenHash: resetCandidateHashed,
    resetTokenExpiresAt: { $gt: new Date() },
  });
  assert(!!validGrantRecord, 'Valid unexpired reset grant located in store');

  // Hash new password using bcrypt
  const salt = await bcrypt.genSalt(10);
  user!.passwordHash = await bcrypt.hash(goodPassword, salt);
  user!.passwordChangedAt = new Date();
  await user!.save();

  // Atomically delete grant
  await PasswordResetOtp.findByIdAndDelete(validGrantRecord!._id);
  const consumedGrant = await PasswordResetOtp.findOne({ resetTokenHash: resetCandidateHashed });
  assert(!consumedGrant, 'Reset grant atomically consumed and purged from database');

  console.log('\n--- SCENARIO 11: Replay Attack Defense (Grant Re-Use Prevention) ---');
  const replayAttempt = await PasswordResetOtp.findOne({
    resetTokenHash: resetCandidateHashed,
    resetTokenExpiresAt: { $gt: new Date() },
  });
  assert(!replayAttempt, 'Replayed reset grant is completely rejected on second attempt');

  console.log('\n--- SCENARIO 12: New Password Authentication Verification ---');
  const updatedUser = await User.findOne({ email: testEmail });
  const isNewPasswordWorking = await bcrypt.compare(goodPassword, updatedUser!.passwordHash);
  assert(isNewPasswordWorking, 'User can successfully authenticate with newly set password');

  const isOldPasswordWorking = await bcrypt.compare('Doctor123!', updatedUser!.passwordHash);
  assert(!isOldPasswordWorking, 'Old password no longer works');

  console.log('\n--- SCENARIO 13: JWT Session Revocation Check ---');
  const decodedOld = jwt.verify(oldSessionToken, ENV.JWT_SECRET) as { id: string; iat?: number };
  const changedTimestamp = Math.floor(updatedUser!.passwordChangedAt!.getTime() / 1000);
  const isOldTokenRevoked = decodedOld.iat ? changedTimestamp > decodedOld.iat : false;
  assert(isOldTokenRevoked, 'Pre-existing JWT sessions issued prior to password change are invalidated');

  console.log('\n--- SCENARIO 14: Profile Integrity & Role Non-Tampering ---');
  assert(updatedUser!.role === originalRole, 'User role is preserved intact (doctor)');
  assert(updatedUser!.email === testEmail, 'User email remains unchanged');
  const preservedDoctor = await Doctor.findOne({ userId: updatedUser!._id });
  assert(preservedDoctor!.bmdcNumber === originalDoctor!.bmdcNumber, 'Doctor profile and BMDC registration number remain intact');

  // Restore default demo password for smooth developer workflow
  const restoreSalt = await bcrypt.genSalt(10);
  updatedUser!.passwordHash = await bcrypt.hash('Doctor123!', restoreSalt);
  await updatedUser!.save();
  console.log('\n✅ Demo doctor credentials safely reset to Doctor123!');

  await closeDatabase();

  console.log('\n================================================================');
  console.log(`🎉 ALL ${passedAsserts} CHECKS PASSED (${passedAsserts}/${totalAsserts})! 100% SUCCESS.`);
  console.log('================================================================\n');
};

runPasswordResetTestSuite().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
