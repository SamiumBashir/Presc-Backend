import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '../models/User';
import { Doctor } from '../models/Doctor';
import { Chamber } from '../models/Chamber';
import { Patient } from '../models/Patient';
import { Prescription } from '../models/Prescription';
import { Template } from '../models/Template';
import { PasswordResetOtp } from '../models/PasswordResetOtp';
import { sendPasswordResetOtpEmail, sendWelcomeEmail } from '../services/email.service';
import {
  generateSecureOtp,
  hashOtp,
  verifyOtpMatch,
  generateResetGrant,
  sha256,
} from '../services/otp.service';
import { ENV } from '../config/env';
import { AuthRequest } from '../middleware/auth';
import { logAuditEvent } from '../middleware/audit';
import {
  RegisterDoctorSchema,
  LoginSchema,
  ForgotPasswordSchema,
  VerifyOtpSchema,
  ResendOtpSchema,
  ResetPasswordSchema,
} from '../validators/schemas';

const generateToken = (id: string, role: string, rememberMe?: boolean): string => {
  return jwt.sign({ id, role }, ENV.JWT_SECRET, {
    expiresIn: rememberMe ? '30d' : ((ENV.JWT_EXPIRES_IN as any) || '7d'),
  });
};

const setAuthCookie = (res: Response, token: string, rememberMe?: boolean) => {
  const days = rememberMe ? 30 : 7;
  res.cookie('token', token, {
    httpOnly: true,
    secure: ENV.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: days * 24 * 60 * 60 * 1000,
  });
};

export const registerDoctor = async (req: AuthRequest, res: Response): Promise<void> => {
  const validated = RegisterDoctorSchema.parse(req.body);

  const existingUser = await User.findOne({ email: validated.email.toLowerCase() });
  if (existingUser) {
    res.status(400).json({ success: false, message: 'An account with this email already exists.' });
    return;
  }

  if (validated.bmdcNumber && validated.bmdcNumber.trim()) {
    const existingBmdc = await Doctor.findOne({ bmdcNumber: validated.bmdcNumber.trim() });
    if (existingBmdc) {
      res.status(400).json({ success: false, message: 'A doctor with this BMDC registration number already exists.' });
      return;
    }
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(validated.password, salt);

  const user = await User.create({
    name: validated.name,
    email: validated.email.toLowerCase(),
    phone: validated.phone,
    passwordHash,
    role: 'doctor',
    status: 'active',
  });

  const doctor = await Doctor.create({
    userId: user._id,
    name: validated.name,
    qualification: validated.qualification || 'MBBS',
    specialization: validated.specialization || 'General Physician',
    healthcareAuthority: 'BMDC',
    registrationNumber: validated.bmdcNumber || '',
    institutionRegNumbers: validated.bmdcNumber ? { BMDC: validated.bmdcNumber } : {},
    bmdcNumber: validated.bmdcNumber || '',
    workplace: validated.workplace || '',
    phone: validated.phone,
    email: validated.email.toLowerCase(),
    settings: {
      paperSize: 'A4',
      defaultLanguage: 'en',
      defaultFollowUp: '7 days',
      headerVisibility: true,
      footerVisibility: true,
      themeColor: '#008ba3',
      showWatermark: true,
      showQrCode: true,
    },
  });

  const token = generateToken(user._id.toString(), user.role);
  setAuthCookie(res, token);

  await logAuditEvent(req, {
    action: 'DOCTOR_REGISTER',
    resource: 'Doctor',
    resourceId: doctor._id.toString(),
    details: { email: user.email, bmdcNumber: doctor.bmdcNumber },
  });

  // Dispatch Welcome Email asynchronously to onboard the new doctor
  const frontendBaseUrl =
    ENV.NODE_ENV === 'production'
      ? 'https://doc-presc.vercel.app'
      : (process.env.FRONTEND_URL || (ENV.CORS_ORIGIN ? ENV.CORS_ORIGIN.split(',')[0].trim() : 'http://localhost:5173'));

  console.log(`[Auth Controller] Registered doctor ${user.email}. Triggering welcome email...`);
  sendWelcomeEmail({
    to: user.email,
    name: user.name,
    specialization: doctor.specialization,
    loginUrl: `${frontendBaseUrl.replace(/\/$/, '')}/login`,
  }).catch((err: any) => {
    console.error(`[Auth Controller] Failed to dispatch welcome email to ${user.email}:`, err.message);
  });

  res.status(201).json({
    success: true,
    message: 'Doctor account registered successfully.',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      doctor,
      chambers: [],
      token,
    },
  });
};

export const login = async (req: AuthRequest, res: Response): Promise<void> => {
  const validated = LoginSchema.parse(req.body);

  const user = await User.findOne({ email: validated.email.toLowerCase() });
  if (!user) {
    res.status(401).json({ success: false, message: 'Invalid email or password.' });
    return;
  }

  if (user.status !== 'active') {
    res.status(403).json({
      success: false,
      message: 'Account is pending approval or has been suspended. Please contact admin.',
    });
    return;
  }

  const isMatch = await bcrypt.compare(validated.password, user.passwordHash);
  if (!isMatch) {
    res.status(401).json({ success: false, message: 'Invalid email or password.' });
    return;
  }

  let doctor = null;
  let chambers: any[] = [];
  if (user.role === 'doctor') {
    doctor = await Doctor.findOne({ userId: user._id }).populate('defaultChamberId').lean();
    if (doctor) {
      chambers = await Chamber.find({ doctorId: (doctor as any)._id, status: 'active' })
        .sort({ isDefault: -1, createdAt: 1 })
        .lean();
    }
  }

  const token = generateToken(user._id.toString(), user.role, validated.rememberMe);
  setAuthCookie(res, token, validated.rememberMe);

  await logAuditEvent(req, {
    action: 'USER_LOGIN',
    resource: 'User',
    resourceId: user._id.toString(),
    details: { email: user.email, role: user.role, rememberMe: validated.rememberMe },
  });

  res.json({
    success: true,
    message: 'Login successful.',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      doctor,
      chambers,
      token,
    },
  });
};

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Not authenticated.' });
    return;
  }

  let doctor = null;
  let chambers: any[] = [];
  if (req.user.role === 'doctor') {
    doctor = await Doctor.findOne({ userId: req.user._id }).populate('defaultChamberId').lean();
    if (doctor) {
      chambers = await Chamber.find({ doctorId: (doctor as any)._id, status: 'active' })
        .sort({ isDefault: -1, createdAt: 1 })
        .lean();
    }
  } else if (req.user.role === 'admin') {
    doctor = await Doctor.findOne({ userId: req.user._id }).populate('defaultChamberId').lean();
    if (doctor) {
      chambers = await Chamber.find({ doctorId: (doctor as any)._id, status: 'active' })
        .sort({ isDefault: -1, createdAt: 1 })
        .lean();
    }
  }

  res.json({
    success: true,
    data: {
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone,
        role: req.user.role,
      },
      doctor,
      chambers,
    },
  });
};

export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out successfully.' });
};

export const updateDoctorProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.doctor) {
    res.status(403).json({ success: false, message: 'Doctor profile not found.' });
    return;
  }

  const {
    name,
    qualification,
    specialization,
    designation,
    workplace,
    healthcareInstitutions,
    healthcareAuthority,
    healthcareInstitution,
    registrationNumber,
    institutionRegNumbers,
    phone,
    email,
    profileImage,
    signature,
    logo,
    bmdcNumber,
  } = req.body;

  const doctor = req.doctor;
  if (name) doctor.name = name;
  if (qualification) doctor.qualification = qualification;
  if (specialization) doctor.specialization = specialization;
  if (designation !== undefined) doctor.designation = designation;
  if (workplace !== undefined) doctor.workplace = workplace;
  if (healthcareInstitutions !== undefined) {
    doctor.healthcareInstitutions = Array.isArray(healthcareInstitutions)
      ? healthcareInstitutions
      : healthcareInstitutions
      ? [healthcareInstitutions]
      : [];
  }
  if (healthcareAuthority !== undefined) doctor.healthcareAuthority = healthcareAuthority;
  if (healthcareInstitution !== undefined) doctor.healthcareAuthority = healthcareInstitution;
  if (!doctor.healthcareAuthority && doctor.healthcareInstitutions && doctor.healthcareInstitutions.length > 0) {
    doctor.healthcareAuthority = doctor.healthcareInstitutions[0];
  }

  if (institutionRegNumbers !== undefined) {
    doctor.institutionRegNumbers = institutionRegNumbers;
  }

  const effectiveRegNumber =
    registrationNumber !== undefined
      ? registrationNumber
      : bmdcNumber !== undefined
      ? bmdcNumber
      : doctor.healthcareAuthority && doctor.institutionRegNumbers && doctor.institutionRegNumbers[doctor.healthcareAuthority]
      ? doctor.institutionRegNumbers[doctor.healthcareAuthority]
      : undefined;

  if (effectiveRegNumber !== undefined) {
    doctor.registrationNumber = effectiveRegNumber;
    doctor.bmdcNumber = effectiveRegNumber;
  }

  if (phone) doctor.phone = phone;
  if (email) doctor.email = email;
  if (profileImage !== undefined) doctor.profileImage = profileImage;
  if (signature !== undefined) doctor.signature = signature;
  if (logo !== undefined) doctor.logo = logo;

  await doctor.save();

  if (name && req.user) {
    req.user.name = name;
    await req.user.save();
  }

  await logAuditEvent(req, {
    action: 'DOCTOR_PROFILE_UPDATE',
    resource: 'Doctor',
    resourceId: doctor._id.toString(),
  });

  res.json({
    success: true,
    message: 'Profile updated successfully.',
    data: doctor,
  });
};

export const updateDoctorSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.doctor) {
    res.status(403).json({ success: false, message: 'Doctor profile not found.' });
    return;
  }

  req.doctor.settings = {
    ...req.doctor.settings,
    ...req.body,
  };

  await req.doctor.save();

  res.json({
    success: true,
    message: 'Settings updated successfully.',
    data: req.doctor.settings,
  });
};

export const forgotPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  const validated = ForgotPasswordSchema.parse(req.body);
  const email = validated.email.toLowerCase().trim();

  const user = await User.findOne({ email });
  let generatedOtp: string | undefined;

  if (!user) {
    res.status(404).json({
      success: false,
      message: `No doctor account found with email "${email}". Please verify your email or create a new account.`,
    });
    return;
  }

  // Check if there is an active resend cooldown (60s)
  const existingOtp = await PasswordResetOtp.findOne({ email });
  const now = Date.now();
  const cooldownMs = ENV.OTP_RESEND_COOLDOWN * 1000;

  if (existingOtp && now - existingOtp.lastSentAt.getTime() < cooldownMs) {
    const waitSeconds = Math.ceil((cooldownMs - (now - existingOtp.lastSentAt.getTime())) / 1000);
    res.status(429).json({
      success: false,
      message: `Please wait ${waitSeconds} seconds before requesting a new OTP.`,
    });
    return;
  }

  // Cryptographically secure 6-digit numeric OTP (100000 - 999999)
  const otp = generateSecureOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(Date.now() + ENV.OTP_EXPIRES_IN * 1000);
  generatedOtp = otp;

  // Atomically upsert challenge in state store
  const record = await PasswordResetOtp.findOneAndUpdate(
    { email },
    {
      email,
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

  // Dispatch transactional email
  const emailResult = await sendPasswordResetOtpEmail({
    to: user.email,
    name: user.name,
    otp,
    expiresInMinutes: Math.round(ENV.OTP_EXPIRES_IN / 60),
  });

  if (!emailResult.success) {
    console.error(`[Auth Controller] Email delivery unavailable for ${user.email}`);
    if (record) {
      await PasswordResetOtp.findByIdAndDelete(record._id);
    }
    res.status(503).json({
      success: false,
      message: 'Failed to send OTP to your email. Outbound mail delivery is unavailable. Please check your email configuration.',
    });
    return;
  }

  await logAuditEvent(req, {
    action: 'PASSWORD_RESET_OTP_REQUESTED',
    resource: 'User',
    resourceId: user._id.toString(),
    details: { email: user.email },
  });

  res.status(200).json({
    success: true,
    message: 'Verification code has been sent to your email. Please check your inbox and spam folder.',
  });
};

export const verifyOtp = async (req: AuthRequest, res: Response): Promise<void> => {
  const validated = VerifyOtpSchema.parse(req.body);
  const email = validated.email.toLowerCase().trim();
  const inputOtp = validated.otp.trim();

  const record = await PasswordResetOtp.findOne({ email });

  if (!record || !record.otpHash || record.expiresAt < new Date()) {
    res.status(400).json({
      success: false,
      message: 'OTP has expired or no active reset request was found. Please request a new OTP.',
    });
    return;
  }

  // Max 5 attempts check
  if (record.attempts >= 5) {
    record.otpHash = ''; // Invalidate challenge
    await record.save();
    res.status(429).json({
      success: false,
      message: 'Too many failed verification attempts. For your security, this challenge has been invalidated. Please request a new OTP.',
    });
    return;
  }

  // Constant-time, timing-safe OTP verification
  const isMatch = verifyOtpMatch(inputOtp, record.otpHash);

  if (!isMatch) {
    record.attempts += 1;
    if (record.attempts >= 5) {
      record.otpHash = ''; // Lock out on 5th failure
    }
    await record.save();
    const remaining = Math.max(0, 5 - record.attempts);
    res.status(400).json({
      success: false,
      message:
        remaining > 0
          ? `Invalid OTP. You have ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} remaining.`
          : 'Too many failed verification attempts. This code has been invalidated. Please request a new OTP.',
    });
    return;
  }

  // OTP is valid -> Issue cryptographically random, short-lived reset authorization grant
  const { rawToken, hashedToken, expiresAt } = generateResetGrant();

  record.otpHash = ''; // Atomically invalidate OTP immediately to prevent re-use
  record.resetTokenHash = hashedToken;
  record.resetTokenExpiresAt = expiresAt;
  record.verifiedAt = new Date();
  await record.save();

  // Return reset grant as dedicated reset authorization token, NOT as JWT access token
  res.json({
    success: true,
    message: 'OTP verified successfully.',
    resetToken: rawToken,
    data: {
      resetToken: rawToken,
      expiresInMinutes: 10,
    },
  });
};

export const resendOtp = async (req: AuthRequest, res: Response): Promise<void> => {
  const validated = ResendOtpSchema.parse(req.body);
  const email = validated.email.toLowerCase().trim();

  const record = await PasswordResetOtp.findOne({ email });
  const now = Date.now();
  const cooldownMs = ENV.OTP_RESEND_COOLDOWN * 1000;

  if (record && now - record.lastSentAt.getTime() < cooldownMs) {
    const waitSeconds = Math.ceil((cooldownMs - (now - record.lastSentAt.getTime())) / 1000);
    res.status(429).json({
      success: false,
      message: `Please wait ${waitSeconds} seconds before requesting a new OTP.`,
    });
    return;
  }

  const user = await User.findOne({ email });
  if (!user) {
    res.status(404).json({
      success: false,
      message: `No doctor account found with email "${email}".`,
    });
    return;
  }

  const otp = generateSecureOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(Date.now() + ENV.OTP_EXPIRES_IN * 1000);
  const generatedOtp = otp;

  const updatedRecord = await PasswordResetOtp.findOneAndUpdate(
    { email },
    {
      email,
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

  const emailResult = await sendPasswordResetOtpEmail({
    to: user.email,
    name: user.name,
    otp,
    expiresInMinutes: Math.round(ENV.OTP_EXPIRES_IN / 60),
  });

  if (!emailResult.success) {
    console.error(`[Auth Controller] Resend OTP email delivery unavailable for ${user.email}`);
    if (updatedRecord) {
      await PasswordResetOtp.findByIdAndDelete(updatedRecord._id);
    }
    res.status(503).json({
      success: false,
      message: 'Failed to send OTP to your email. Outbound mail delivery is unavailable. Please check your email configuration.',
    });
    return;
  }

  await logAuditEvent(req, {
    action: 'PASSWORD_RESET_OTP_RESENT',
    resource: 'User',
    resourceId: user._id.toString(),
    details: { email: user.email },
  });

  res.status(200).json({
    success: true,
    message: 'A new verification code has been sent to your email. Please check your inbox and spam folder.',
  });
};

export const resetPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  const tokenParam = req.params.token;
  const { resetToken, password, newPassword, confirmPassword } = req.body;

  const targetToken = resetToken || tokenParam;
  if (!targetToken) {
    res.status(400).json({
      success: false,
      message: 'Reset authorization token is required.',
    });
    return;
  }

  const targetPassword = newPassword || password;
  if (!targetPassword) {
    res.status(400).json({
      success: false,
      message: 'New password is required.',
    });
    return;
  }

  if (targetPassword.length < 8) {
    res.status(400).json({
      success: false,
      message: 'Password must be at least 8 characters long.',
    });
    return;
  }

  // Validate password confirmation if provided
  if (confirmPassword && targetPassword !== confirmPassword) {
    res.status(400).json({
      success: false,
      message: 'Password confirmation does not match.',
    });
    return;
  }

  // Validate standard password complexity policy
  if (!/[A-Z]/.test(targetPassword) || !/[a-z]/.test(targetPassword) || !/[^A-Za-z0-9]/.test(targetPassword)) {
    res.status(400).json({
      success: false,
      message: 'Password must contain at least one uppercase letter, one lowercase letter, and one special character.',
    });
    return;
  }

  const hashedToken = sha256(targetToken);

  // 1. Look up pending grant in PasswordResetOtp collection
  const otpRecord = await PasswordResetOtp.findOne({
    resetTokenHash: hashedToken,
    resetTokenExpiresAt: { $gt: new Date() },
  });

  let targetUser = null;

  if (otpRecord) {
    targetUser = await User.findOne({ email: otpRecord.email });
  } else {
    // 2. Legacy fallback to User model reset token if exists
    targetUser = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: new Date() },
    });
  }

  if (!targetUser) {
    res.status(400).json({
      success: false,
      message: 'Invalid, expired, or already consumed password reset grant. Please request a new OTP.',
    });
    return;
  }

  // Securely hash new password using bcrypt
  const salt = await bcrypt.genSalt(10);
  targetUser.passwordHash = await bcrypt.hash(targetPassword, salt);
  targetUser.resetPasswordToken = undefined;
  targetUser.resetPasswordExpire = undefined;
  targetUser.passwordChangedAt = new Date(); // Revokes pre-existing JWT sessions
  await targetUser.save();

  // Atomically consume reset grant to prevent any reuse
  if (otpRecord) {
    await PasswordResetOtp.findByIdAndDelete(otpRecord._id);
  }

  // Clear existing authentication cookie
  res.clearCookie('token');

  await logAuditEvent(req, {
    action: 'PASSWORD_RESET_SUCCESS',
    resource: 'User',
    resourceId: targetUser._id.toString(),
    details: { email: targetUser.email },
  });

  res.status(200).json({
    success: true,
    message: 'Your password has been reset successfully. Please sign in.',
  });
};

export const deleteAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Not authenticated.' });
    return;
  }

  const userId = req.user._id;

  // If user is a doctor, cascade delete related records
  const doctor = await Doctor.findOne({ userId });
  if (doctor) {
    await Chamber.deleteMany({ doctorId: doctor._id });
    await Template.deleteMany({ doctorId: doctor._id });
    await Patient.deleteMany({ doctorId: doctor._id });
    await Prescription.deleteMany({ doctorId: doctor._id });
    await Doctor.findByIdAndDelete(doctor._id);
  }

  await User.findByIdAndDelete(userId);

  await logAuditEvent(req, {
    action: 'USER_ACCOUNT_DELETED',
    resource: 'User',
    resourceId: userId.toString(),
    details: { email: req.user.email, role: req.user.role },
  });

  res.clearCookie('token');

  res.json({
    success: true,
    message: 'Your account and all associated data have been permanently deleted.',
  });
};
