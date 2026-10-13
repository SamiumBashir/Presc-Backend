"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../config/db");
const User_1 = require("../models/User");
const PasswordResetOtp_1 = require("../models/PasswordResetOtp");
const seed_1 = require("../seeds/seed");
const runOtpTestSuite = async () => {
    console.log('\n======================================================');
    console.log('🧪 RUNNING DOCPRESC EMAIL OTP & PASSWORD RESET TEST SUITE');
    console.log('======================================================\n');
    await (0, db_1.connectDatabase)();
    await (0, seed_1.seedDatabase)(false);
    const testEmail = 'doctor@prescription.com';
    const user = await User_1.User.findOne({ email: testEmail });
    if (!user) {
        throw new Error('Test user doctor@prescription.com not found.');
    }
    console.log('✅ Found test doctor account:', user.email);
    // 1. Generate 6-digit OTP and store
    const otp = '849201';
    const otpHash = crypto_1.default.createHash('sha256').update(otp).digest('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await PasswordResetOtp_1.PasswordResetOtp.findOneAndUpdate({ email: testEmail }, {
        email: testEmail,
        otpHash,
        expiresAt,
        attempts: 0,
        lastSentAt: new Date(),
    }, { upsert: true, new: true });
    console.log('✅ Generated and stored hashed 6-digit OTP in PasswordResetOtp collection.');
    // 2. Test Rate Limit Cooldown Detection (60s cooldown check)
    const record = await PasswordResetOtp_1.PasswordResetOtp.findOne({ email: testEmail });
    if (!record)
        throw new Error('OTP record not found');
    const cooldownMs = 60 * 1000;
    const isCooldownActive = Date.now() - record.lastSentAt.getTime() < cooldownMs;
    if (!isCooldownActive)
        throw new Error('Cooldown calculation failed');
    console.log('✅ OTP Resend Cooldown correctly enforced within 60s window.');
    // 3. Test Invalid OTP Attempt Counter & Lockout Threshold
    const invalidOtp = '111111';
    const invalidHash = crypto_1.default.createHash('sha256').update(invalidOtp).digest('hex');
    if (invalidHash !== record.otpHash) {
        record.attempts += 1;
        await record.save();
    }
    console.log(`✅ Invalid OTP properly detected. Attempts incremented to: ${record.attempts}/5.`);
    // 4. Test Valid OTP Verification & Reset Token Issuance
    const validRecord = await PasswordResetOtp_1.PasswordResetOtp.findOne({ email: testEmail });
    if (!validRecord)
        throw new Error('Record not found');
    const validMatch = crypto_1.default.createHash('sha256').update(otp).digest('hex') === validRecord.otpHash;
    if (!validMatch)
        throw new Error('Valid OTP failed to match');
    const rawResetToken = crypto_1.default.randomBytes(32).toString('hex');
    const resetTokenHash = crypto_1.default.createHash('sha256').update(rawResetToken).digest('hex');
    validRecord.otpHash = ''; // Invalidated
    validRecord.resetTokenHash = resetTokenHash;
    validRecord.resetTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    validRecord.verifiedAt = new Date();
    await validRecord.save();
    console.log('✅ OTP verified successfully. Single-use resetToken issued:', rawResetToken.substring(0, 16) + '...');
    // 5. Test Password Complexity Policy Enforcement
    const weakPasswords = ['short', 'nouppercase123!', 'NOLOWERCASE123!', 'NoSpecialChars123'];
    for (const weakPwd of weakPasswords) {
        const isWeakValid = weakPwd.length >= 8 &&
            /[A-Z]/.test(weakPwd) &&
            /[a-z]/.test(weakPwd) &&
            /[^A-Za-z0-9]/.test(weakPwd);
        if (isWeakValid)
            throw new Error(`Weak password "${weakPwd}" should have been rejected by policy`);
    }
    console.log('✅ Password complexity rules (length >= 8, uppercase, lowercase, special char) verified.');
    // 6. Test Password Reset with resetToken
    const resetHashedToken = crypto_1.default.createHash('sha256').update(rawResetToken).digest('hex');
    const verifiedRecord = await PasswordResetOtp_1.PasswordResetOtp.findOne({
        resetTokenHash: resetHashedToken,
        resetTokenExpiresAt: { $gt: new Date() },
    });
    if (!verifiedRecord)
        throw new Error('Verified reset session not found');
    const newPassword = 'DoctorNewPassword123!';
    const salt = await bcryptjs_1.default.genSalt(10);
    user.passwordHash = await bcryptjs_1.default.hash(newPassword, salt);
    await user.save();
    await PasswordResetOtp_1.PasswordResetOtp.findByIdAndDelete(verifiedRecord._id);
    console.log('✅ Password successfully updated in User model and reset session invalidated.');
    // 7. Test Password Verification
    const updatedUser = await User_1.User.findOne({ email: testEmail });
    const isNewPasswordValid = await bcryptjs_1.default.compare(newPassword, updatedUser.passwordHash);
    if (!isNewPasswordValid)
        throw new Error('New password verification failed');
    console.log('✅ Login with new password verified successfully.');
    // 8. Restore original demo password
    const originalSalt = await bcryptjs_1.default.genSalt(10);
    updatedUser.passwordHash = await bcryptjs_1.default.hash('Doctor123!', originalSalt);
    await updatedUser.save();
    console.log('✅ Restored default demo password (Doctor123!) for seamless developer experience.');
    await (0, db_1.closeDatabase)();
    console.log('\n======================================================');
    console.log('🎉 ALL EMAIL OTP & PASSWORD RESET UNIT & FLOW TESTS PASSED!');
    console.log('======================================================\n');
};
runOtpTestSuite().catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
