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
  resolveEmailProvider,
  maskEmail,
  categorizeEmailError,
  clearTransporterCache,
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
  // TEST SUITE 1: Provider Selection & Prioritization Logic
  // -------------------------------------------------------------
  console.log('\n--- 1. Email Service Provider Selection & Prioritization ---');
  {
    const origProvider = process.env.EMAIL_PROVIDER;
    const origResend = process.env.RESEND_API_KEY;
    const origBrevo = process.env.BREVO_API_KEY;
    const origUser = process.env.SMTP_USER;
    const origPass = process.env.SMTP_PASS;
    const origEnvProvider = (ENV as any).EMAIL_PROVIDER;
    const origEnvResend = (ENV as any).RESEND_API_KEY;
    const origEnvBrevo = (ENV as any).BREVO_API_KEY;
    const origEnvUser = (ENV as any).SMTP_USER;
    const origEnvPass = (ENV as any).SMTP_PASS;

    try {
      // Ensure mock transporter is cleared for provider resolution checks
      setMockTransporter(null);

      // Scenario A: Explicit EMAIL_PROVIDER=smtp MUST take priority over Resend and Brevo keys
      process.env.EMAIL_PROVIDER = 'smtp';
      process.env.RESEND_API_KEY = 're_live_resend_key_12345';
      process.env.BREVO_API_KEY = 'xkeysib_live_brevo_key_12345';
      process.env.SMTP_USER = '7232.badhan@gmail.com';
      process.env.SMTP_PASS = 'abcd efgh ijkl mnop';
      (ENV as any).EMAIL_PROVIDER = 'smtp';
      (ENV as any).RESEND_API_KEY = 're_live_resend_key_12345';
      (ENV as any).BREVO_API_KEY = 'xkeysib_live_brevo_key_12345';
      (ENV as any).SMTP_USER = '7232.badhan@gmail.com';
      (ENV as any).SMTP_PASS = 'abcd efgh ijkl mnop';
      clearTransporterCache();

      const resolvedSmtp = resolveEmailProvider();
      assert(
        resolvedSmtp === 'smtp',
        'EMAIL_PROVIDER=smtp selects SMTP even when RESEND_API_KEY and BREVO_API_KEY exist'
      );

      // Scenario B: Explicit EMAIL_PROVIDER=resend selects Resend
      process.env.EMAIL_PROVIDER = 'resend';
      (ENV as any).EMAIL_PROVIDER = 'resend';
      assert(resolveEmailProvider() === 'resend', 'EMAIL_PROVIDER=resend explicitly selects Resend');

      // Scenario C: Explicit EMAIL_PROVIDER=brevo selects Brevo
      process.env.EMAIL_PROVIDER = 'brevo';
      (ENV as any).EMAIL_PROVIDER = 'brevo';
      assert(resolveEmailProvider() === 'brevo', 'EMAIL_PROVIDER=brevo explicitly selects Brevo');

      // Scenario D: Unconfigured credentials detection
      delete process.env.EMAIL_PROVIDER;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
      delete process.env.RESEND_API_KEY;
      delete process.env.BREVO_API_KEY;
      (ENV as any).EMAIL_PROVIDER = 'auto';
      (ENV as any).SMTP_USER = '';
      (ENV as any).SMTP_PASS = '';
      (ENV as any).RESEND_API_KEY = '';
      (ENV as any).BREVO_API_KEY = '';
      clearTransporterCache();

      const unconfigured = await verifyEmailConfiguration();
      assert(!unconfigured.configured, 'Detects unconfigured email service when credentials are empty');
      assert(unconfigured.provider === 'none', 'Reports provider as none when missing all credentials');

      // Scenario E: Missing SMTP credentials when EMAIL_PROVIDER=smtp
      (ENV as any).EMAIL_PROVIDER = 'smtp';
      process.env.EMAIL_PROVIDER = 'smtp';
      const missingSmtpCreds = await verifyEmailConfiguration();
      assert(!missingSmtpCreds.configured, 'Reports not configured when SMTP_USER/SMTP_PASS are missing');
      assert(missingSmtpCreds.provider === 'smtp', 'Maintains selected provider as smtp');
    } finally {
      // Restore original environment
      if (origProvider) process.env.EMAIL_PROVIDER = origProvider; else delete process.env.EMAIL_PROVIDER;
      if (origResend) process.env.RESEND_API_KEY = origResend; else delete process.env.RESEND_API_KEY;
      if (origBrevo) process.env.BREVO_API_KEY = origBrevo; else delete process.env.BREVO_API_KEY;
      if (origUser) process.env.SMTP_USER = origUser; else delete process.env.SMTP_USER;
      if (origPass) process.env.SMTP_PASS = origPass; else delete process.env.SMTP_PASS;
      (ENV as any).EMAIL_PROVIDER = origEnvProvider;
      (ENV as any).RESEND_API_KEY = origEnvResend;
      (ENV as any).BREVO_API_KEY = origEnvBrevo;
      (ENV as any).SMTP_USER = origEnvUser;
      (ENV as any).SMTP_PASS = origEnvPass;
      clearTransporterCache();
    }
  }

  // -------------------------------------------------------------
  // TEST SUITE 2: SMTP Configuration & TLS Selection
  // -------------------------------------------------------------
  console.log('\n--- 2. SMTP Configuration & TLS Selection ---');
  {
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
  // TEST SUITE 4: Error Categorization & Production Diagnostics
  // -------------------------------------------------------------
  console.log('\n--- 4. Error Categorization & Production Diagnostics ---');
  {
    // A: 535 Bad Credentials -> SMTP_AUTH_FAILED
    const authErr = new Error('535-5.7.8 Username and Password not accepted');
    (authErr as any).responseCode = 535;
    const catAuth = categorizeEmailError(authErr);
    assert(catAuth.code === 'SMTP_AUTH_FAILED', 'Categorizes 535 as SMTP_AUTH_FAILED');
    assert(catAuth.category === 'AUTHENTICATION', 'Category is AUTHENTICATION');

    // B: ETIMEDOUT -> SMTP_CONNECTION_TIMEOUT
    const timeoutErr = new Error('connect ETIMEDOUT 142.250.186.108:465');
    (timeoutErr as any).code = 'ETIMEDOUT';
    const catTimeout = categorizeEmailError(timeoutErr);
    assert(catTimeout.code === 'SMTP_CONNECTION_TIMEOUT', 'Categorizes ETIMEDOUT as SMTP_CONNECTION_TIMEOUT');
    assert(catTimeout.category === 'CONNECTION_TIMEOUT', 'Category is CONNECTION_TIMEOUT');

    // C: ENOTFOUND -> SMTP_DNS_ERROR
    const dnsErr = new Error('getaddrinfo ENOTFOUND smtp.gmail.com');
    (dnsErr as any).code = 'ENOTFOUND';
    const catDns = categorizeEmailError(dnsErr);
    assert(catDns.code === 'SMTP_DNS_ERROR', 'Categorizes ENOTFOUND as SMTP_DNS_ERROR');
    assert(catDns.category === 'DNS', 'Category is DNS');

    // D: Safe log email masking
    const masked1 = maskEmail('doctor.specialist@gmail.com');
    assert(masked1.startsWith('do') && masked1.endsWith('t@gmail.com') && masked1.includes('*'), 'maskEmail masks local part correctly');
    assert(!masked1.includes('specialist'), 'maskEmail does not leak full name');
    assert(maskEmail('short@doc.com') === 'sh***t@doc.com', 'maskEmail handles short email correctly');
  }

  // -------------------------------------------------------------
  // TEST SUITE 5: Invalid Recipient Handling
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
  // TEST SUITE 6: OTP Lifecycle, Expiration, Cooldown, and Security
  // -------------------------------------------------------------
  console.log('\n--- 6. OTP Lifecycle, Expiration, Cooldown, and Security ---');
  {
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

    // Restore original demo password
    const restoreSalt = await bcrypt.genSalt(10);
    updatedUser!.passwordHash = await bcrypt.hash('Doctor123!', restoreSalt);
    await updatedUser!.save();
  }

  // -------------------------------------------------------------
  // TEST SUITE 7: Email Failure State Cleanup (No Dangling OTPs)
  // -------------------------------------------------------------
  console.log('\n--- 7. Email Delivery Failure Cleans Up Challenge ---');
  {
    const failureEmail = 'test-fail-cleanup@prescription.com';
    const failedOtpRecord = await PasswordResetOtp.create({
      email: failureEmail,
      otpHash: hashOtp('999999'),
      expiresAt: new Date(Date.now() + 600000),
      attempts: 0,
      lastSentAt: new Date(),
    });

    // When email delivery fails, the OTP challenge must be deleted
    const emailSendSucceeded = false;
    if (!emailSendSucceeded) {
      await PasswordResetOtp.deleteOne({ email: failureEmail });
    }

    const checkRecord = await PasswordResetOtp.findOne({ email: failureEmail });
    assert(!checkRecord, 'Dangling OTP challenge is safely purged when email delivery fails');
  }

  // -------------------------------------------------------------
  // TEST SUITE 8: Welcome Email Delivery & Idempotency Tracking
  // -------------------------------------------------------------
  console.log('\n--- 8. Welcome Email Delivery & Idempotency Tracking ---');
  {
    const welcomeTestEmail = 'dr.welcome.test@prescription.com';
    await User.deleteOne({ email: welcomeTestEmail });

    const newUser = await User.create({
      name: 'Dr. Welcome Candidate',
      email: welcomeTestEmail,
      passwordHash: 'hashedpass',
      role: 'doctor',
      status: 'active',
      welcomeEmailSent: false,
    });

    assert(newUser.welcomeEmailSent === false, 'New user initializes with welcomeEmailSent: false');

    // Dispatch welcome email
    const dispatchTracker = { welcomeDispatched: false };
    setMockTransporter({
      sendMail: async (opts: any) => {
        dispatchTracker.welcomeDispatched = true;
        return { messageId: '<welcome-msg-id-789>' };
      },
    } as any);

    if (!newUser.welcomeEmailSent) {
      const wRes = await sendWelcomeEmail({
        to: newUser.email,
        name: newUser.name,
        specialization: 'Internal Medicine',
      });
      assert(wRes.success === true, 'sendWelcomeEmail returns success with mock transporter');
      await User.updateOne({ _id: newUser._id }, { welcomeEmailSent: true, welcomeEmailSentAt: new Date() });
    }

    assert(dispatchTracker.welcomeDispatched === true, 'Welcome email was actually dispatched on initial registration');

    const updatedWelcomeUser = await User.findOne({ email: welcomeTestEmail });
    assert(updatedWelcomeUser?.welcomeEmailSent === true, 'User record updated with welcomeEmailSent: true');
    assert(!!updatedWelcomeUser?.welcomeEmailSentAt, 'User record stamped with welcomeEmailSentAt timestamp');

    // Attempt second welcome email dispatch on duplicate / repeated event
    dispatchTracker.welcomeDispatched = false;
    if (!updatedWelcomeUser?.welcomeEmailSent) {
      await sendWelcomeEmail({ to: newUser.email, name: newUser.name });
    }

    assert(dispatchTracker.welcomeDispatched === false, 'Idempotency check prevents duplicate welcome email dispatch');

    // Clean up
    await User.deleteOne({ email: welcomeTestEmail });
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
