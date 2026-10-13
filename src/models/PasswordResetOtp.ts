import mongoose, { Document, Schema } from 'mongoose';

export interface IPasswordResetOtp extends Document {
  email: string;
  otpHash: string;
  expiresAt: Date;
  attempts: number;
  lastSentAt: Date;
  resetTokenHash?: string;
  resetTokenExpiresAt?: Date;
  verifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PasswordResetOtpSchema: Schema = new Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    otpHash: {
      type: String,
      default: '',
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // MongoDB TTL Index: automatically removes document after expiresAt
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
      max: 10,
    },
    lastSentAt: {
      type: Date,
      default: Date.now,
    },
    resetTokenHash: {
      type: String,
    },
    resetTokenExpiresAt: {
      type: Date,
    },
    verifiedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

export const PasswordResetOtp = mongoose.model<IPasswordResetOtp>(
  'PasswordResetOtp',
  PasswordResetOtpSchema
);
