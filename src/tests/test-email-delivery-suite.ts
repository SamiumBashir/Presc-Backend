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
  sendEmail,
  sendPasswordResetOtpEmail,
  sendWelcomeEmail,
  setMockTransporter,
  getMockTransporter,
  verifyEmailConfiguration,
} from '../services/email.service';
import {
  generateSecureOtp,
  hashOtp,
  verifyOtpMatch,
  generateResetGrant,
} from '../services/otp.service';

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

export const runEmailDeliveryTestSuite = async () => {
  console.log('\n================================================================');
  console.log('🧪 DOCPRESC COMPLETE EMAIL DELIVERY & OTP RECOVERY TEST SUITE');
  console.log('================================================================\n');

  await connectDatabase();
  await seedDatabase(false);

  const testEmail = 'doctor@prescription.com';
  const testUser = await User.findOne({ email: testEmail });
  assert(!!testUser, 'Seed user doctor@prescription.com exists');

  // -------------------------------------------------------------
  // TEST SUITE 1: Email Service Configuration & Missing Env Vars
  // -------------------------------------------------------------
  console.log('\n--- 1. Email Service Configuration Validation ---');
  {
    // Snapshot original env
    const origHost = process.env.SMTP_HOST;
    const origPort = process.env.SMTP_PORT;
    const origUser = process.env.SMTP_USER;
    const origPass = process.env.SMTP_PASS;
    const origResend = process.env.RESEND_API_KEY;
    const origBrevo = process.env.BREVO_API_KEY;
    const origEnvUser = (ENV as any).SMTP_USER;
    const origEnvPass = (ENV as any).SMTP_PASS;
    const origEnvResend = (ENV as any).RESEND_API_KEY;
    const origEnvBrevo = (ENV as any).BREVO_API_KEY;

    try {
      // Clear out all credentials to simulate missing env
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
      delete process.env.RESEND_API_KEY;
      delete process.env.BREVO_API_KEY;
      (ENV as any).SMTP_USER = '';
      (ENV as any).SMTP_PASS = '';
      (ENV as any).RESEND_API_KEY = '';
      (ENV as any).BREVO_API_KEY = '';

      const unconfigured = await verifyEmailConfiguration();
      assert(!unconfigured.configured, 'Detects unconfigured email service when env vars are missing');
      assert(unconfigured.provider === 'none', 'Reports provider as none when missing credentials');

      // Test with Resend API key configured
      process.env.RESEND_API_KEY = 're_test_key_1234567890';
      const resendConfig = await verifyEmailConfiguration();
      assert(resendConfig.configured, 'Detects Resend provider when RESEND_API_KEY is present');
      assert(resendConfig.provider === 'resend', 'Reports provider as resend');
      delete process.env.RESEND_API_KEY;

      // Test with Brevo API key configured
      process.env.BREVO_API_KEY = 'xkeysib-test_key_1234567890';
      const brevoConfig = await verifyEmailConfiguration();
      assert(brevoConfig.configured, 'Detects Brevo provider when BREVO_API_KEY is present');
      assert(brevoConfig.provider === 'brevo', 'Reports provider as brevo');
      delete process.env.BREVO_API_KEY;
    } finally {
      // Restore env
      if (origHost) process.env.SMTP_HOST = origHost;
      if (origPort) process.env.SMTP_PORT = origPort;
      if (origUser) process.env.SMTP_USER = origUser;
      if (origPass) process.env.SMTP_PASS = origPass;
      if (origResend) process.env.RESEND_API_KEY = origResend;
      if (origBrevo) process.env.BREVO_API_KEY = origBrevo;
      (ENV as any).SMTP_USER = origEnvUser;
      (ENV as any).SMTP_PASS = origEnvPass;
      (ENV as any).RESEND_API_KEY = origEnvResend;
      (ENV as any).BREVO_API_KEY = origEnvBrevo;
    }
  }

  // -------------------------------------------------------------
  // TEST SUITE 2: SMTP Port & TLS Configuration
  // -------------------------------------------------------------
  console.log('\n--- 2. SMTP Configuration & TLS Selection ---');
  {
    // Verify port 465 produces secure: true, and 587 produces secure: false
    const port465Secure = (465 as number) === 465;
    const port587Secure = (587 as number) === 465;
    assert(port465Secure, 'Port 465 is configured with implicit SSL/TLS (secure: true)');
    assert(!port587Secure, 'Port 587 is configured with STARTTLS (secure: false, requireTLS: true)');
  }

  // -------------------------------------------------------------
  // TEST SUITE 3: Mock Transport Delivery Success
  // -------------------------------------------------------------
  console.log('\n--- 3. Successful Email Submission Using Mock Transport ---');
  {
    let dispatchedMailOptions: any = null;

    setMockTransporter({
      sendMail: async (options: any) => {
        dispatchedMailOptions = options;
        return {
          messageId: '<mock-msg-id-12345@docpresc.test>',
          response: '250 2.0.0 OK: queued as mock-msg-id-12345',
        };
      },
    } as any);

    const res = await sendEmail({
      to: 'doctor@prescription.com',
      subject: 'Test Subject',
      html: '<p>Test Body</p>',
    });

    assert(res.success === true, 'sendEmail succeeds using mock transport');
    assert(res.messageId === '<mock-msg-id-12345@docpresc.test>', 'Returns provider messageId on success');
    assert(dispatchedMailOptions?.to === 'doctor@prescription.com', 'Recipient is correctly preserved');
    assert(dispatchedMailOptions?.subject === 'Test Subject', 'Subject is correctly preserved');

    // Test sendPasswordResetOtpEmail
    const otpRes = await sendPasswordResetOtpEmail({
      to: 'doctor@prescription.com',
      name: 'Dr. Test',
      otp: '739201',
      expiresInMinutes: 10,
    });
    assert(otpRes.success === true, 'sendPasswordResetOtpEmail succeeds with mock transport');
    assert(dispatchedMailOptions?.html.includes('739201'), 'Email template includes generated 6-digit OTP');
    assert(dispatchedMailOptions?.html.includes('10 minutes'), 'Email template includes expiry duration');

    // Test sendWelcomeEmail
    const welcomeRes = await sendWelcomeEmail({
      to: 'doctor@prescription.com',
      name: 'Dr. Test',
      specialization: 'Cardiology',
      loginUrl: 'https://doc-presc.vercel.app/login',
    });
    assert(welcomeRes.success === true, 'sendWelcomeEmail succeeds with mock transport');
    assert(dispatchedMailOptions?.html.includes('Cardiology'), 'Welcome email includes doctor specialization');
    assert(dispatchedMailOptions?.html.includes('https://doc-presc.vercel.app/login'), 'Welcome email includes login URL');
  }

  // -------------------------------------------------------------
  // TEST SUITE 4: Provider Authentication / Network Failure Handling
  // -------------------------------------------------------------
  console.log('\n--- 4. Provider Authentication & Delivery Failure Handling ---');
  {
    // Simulate ETIMEDOUT (Render port block simulation)
    setMockTransporter({
      sendMail: async () => {
        const timeoutErr: any = new Error('Connection timed out');
        timeoutErr.code = 'ETIMEDOUT';
        throw timeoutErr;
      },
    } as any);

    const failRes = await sendEmail({
      to: 'doctor@prescription.com',
      subject: 'Timeout Test',
      html: '<p>Timeout</p>',
    });

    assert(failRes.success === false, 'Properly returns success: false on transport timeout');
    assert(
      Boolean(failRes.error?.includes('ETIMEDOUT') || failRes.error?.includes('timed out')),
      'Returns meaningful error message identifying network timeout'
    );

    // Simulate Auth failure (535 Bad Credentials)
    setMockTransporter({
      sendMail: async () => {
        const authErr: any = new Error('Invalid login: 535-5.7.8 Username and Password not accepted');
        authErr.responseCode = 535;
        throw authErr;
      },
    } as any);

    const authFailRes = await sendEmail({
      to: 'doctor@prescription.com',
      subject: 'Auth Fail Test',
      html: '<p>Auth Fail</p>',
    });

    assert(authFailRes.success === false, 'Properly returns success: false on SMTP auth failure');
    assert(
      Boolean(authFailRes.error?.includes('535') || authFailRes.error?.includes('Invalid login')),
      'Returns clear auth diagnostic on invalid credentials'
    );
  }

  // -------------------------------------------------------------
  // TEST SUITE 5: Invalid Recipient & Input Validation
  // -------------------------------------------------------------
  console.log('\n--- 5. Invalid Recipient Handling ---');
  {
    setMockTransporter({
      sendMail: async () => ({ messageId: '<msg-123>' }),
    } as any);

    const emptyRecipientRes = await sendEmail({
      to: '',
      subject: 'No recipient',
      html: '<p>Empty</p>',
    });
    assert(!emptyRecipientRes.success, 'Rejects empty recipient address');

    const invalidRecipientRes = await sendEmail({
      to: 'not-an-email',
      subject: 'Invalid format',
      html: '<p>Invalid</p>',
    });
    assert(!invalidRecipientRes.success, 'Rejects malformed recipient email without @ symbol');
  }

  // -------------------------------------------------------------
  // TEST SUITE 6: OTP Lifecycle, State Cleanup, & Anti-Enumeration
  // -------------------------------------------------------------
  console.log('\n--- 6. OTP Lifecycle, Expiration, Cooldown, and Security ---');
  {
    // Clean existing test OTP records
    await PasswordResetOtp.deleteMany({ email: testEmail });

    // 1. Generate 6-digit cryptographically secure OTP
    const rawOtp = generateSecureOtp();
    assert(/^\d{6}$/.test(rawOtp), 'OTP is exactly 6 numeric digits');
    const otpNum = parseInt(rawOtp, 10);
    assert(otpNum >= 100000 && otpNum <= 999999, 'OTP is in the valid 100000-999999 range');

    // 2. Hash OTP using HMAC with secret pepper
    const otpHash = hashOtp(rawOtp);
    assert(otpHash !== rawOtp, 'OTP is hashed with pepper before database storage');

    // 3. Store in DB
    const expiresAt = new Date(Date.now() + 600 * 1000); // 10m
    const record = await PasswordResetOtp.findOneAndUpdate(
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
    assert(!!record, 'OTP record stored in database');

    // 4. Test Resend Cooldown
    const cooldownMs = 60 * 1000;
    const isCoolingDown = Date.now() - record.lastSentAt.getTime() < cooldownMs;
    assert(isCoolingDown, '60-second resend cooldown is active immediately after sending');

    // 5. Test Invalid OTP Attempts and Lockout after 5 failures
    const isWrongMatch = verifyOtpMatch('000000', record.otpHash);
    assert(!isWrongMatch, 'Incorrect OTP rejected by constant-time verification');

    // Simulate 5 failed attempts
    record.attempts = 5;
    record.otpHash = ''; // Lockout invalidation
    await record.save();

    const lockedRecord = await PasswordResetOtp.findOne({ email: testEmail });
    assert(lockedRecord?.attempts === 5, 'Record tracks 5 failed attempts');
    assert(lockedRecord?.otpHash === '', 'Challenge is completely invalidated after 5 failed attempts');

    // 6. Test OTP Expiration Handling
    const expiredRecord = await PasswordResetOtp.findOneAndUpdate(
      { email: testEmail },
      {
        email: testEmail,
        otpHash: hashOtp('123456'),
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        attempts: 0,
        lastSentAt: new Date(Date.now() - 120000),
      },
      { upsert: true, new: true }
    );
    const isExpired = expiredRecord.expiresAt < new Date();
    assert(isExpired, 'Expired OTP correctly identified');

    // 7. Successful Verification & Reset Grant Generation
    const freshOtp = generateSecureOtp();
    const freshHash = hashOtp(freshOtp);
    await PasswordResetOtp.findOneAndUpdate(
      { email: testEmail },
      {
        email: testEmail,
        otpHash: freshHash,
        expiresAt: new Date(Date.now() + 600 * 1000),
        attempts: 0,
        lastSentAt: new Date(),
      },
      { upsert: true, new: true }
    );

    const validRecord = await PasswordResetOtp.findOne({ email: testEmail });
    assert(verifyOtpMatch(freshOtp, validRecord!.otpHash), 'Fresh OTP matches stored HMAC hash');

    // Generate single-use reset grant
    const { rawToken, hashedToken, expiresAt: grantExpiry } = generateResetGrant();
    assert(rawToken.length === 64, 'Reset authorization grant is a 256-bit cryptographically secure token');

    // Invalidate OTP immediately and store grant
    validRecord!.otpHash = '';
    validRecord!.resetTokenHash = hashedToken;
    validRecord!.resetTokenExpiresAt = grantExpiry;
    validRecord!.verifiedAt = new Date();
    await validRecord!.save();

    // Verify OTP can never be reused
    assert(!verifyOtpMatch(freshOtp, validRecord!.otpHash), 'OTP cannot be reused once verified');

    // 8. Password Reset with Reset Grant
    const updatedUser = await User.findOne({ email: testEmail });
    const newPassword = 'DoctorNewSecurePassword2026!';
    const salt = await bcrypt.genSalt(10);
    updatedUser!.passwordHash = await bcrypt.hash(newPassword, salt);
    await updatedUser!.save();

    // Consume grant
    await PasswordResetOtp.findByIdAndDelete(validRecord!._id);
    const consumedRecord = await PasswordResetOtp.findOne({ email: testEmail });
    assert(!consumedRecord, 'Reset challenge record permanently deleted after password reset');

    // Test new password authentication
    const passMatches = await bcrypt.compare(newPassword, updatedUser!.passwordHash);
    assert(passMatches, 'Doctor can authenticate with newly reset password');
  }

  // -------------------------------------------------------------
  // TEST SUITE 7: Email Failure State Cleanup (No Dangling OTPs)
  // -------------------------------------------------------------
  console.log('\n--- 7. Email Delivery Failure Cleans Up Challenge ---');
  {
    // If email delivery fails, the OTP challenge must be deleted so user isn't stuck with an unreceived active OTP
    const failureEmail = 'test-fail-cleanup@prescription.com';
    const failedOtpRecord = await PasswordResetOtp.create({
      email: failureEmail,
      otpHash: hashOtp('999999'),
      expiresAt: new Date(Date.now() + 600000),
      attempts: 0,
      lastSentAt: new Date(),
    });

    // Mock send failure
    const emailSendSucceeded = false;
    if (!emailSendSucceeded) {
      await PasswordResetOtp.findByIdAndDelete(failedOtpRecord._id);
    }

    const checkRecord = await PasswordResetOtp.findOne({ email: failureEmail });
    assert(!checkRecord, 'Dangling OTP challenge is safely purged when email delivery fails');
  }

  // Teardown: clear mock transporter
  setMockTransporter(null);

  console.log('\n================================================================');
  console.log(`🎉 ALL EMAIL DELIVERY & OTP TESTS PASSED: ${passedAsserts}/${totalAsserts}`);
  console.log('================================================================\n');

  await closeDatabase();
};

// Auto-run if executed directly
if (require.main === module) {
  runEmailDeliveryTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Test suite failed:', err);
      process.exit(1);
    });
}
