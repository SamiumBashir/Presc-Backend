import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  phone?: string;
  passwordHash: string;
  role: 'doctor' | 'admin' | 'staff';
  status: 'active' | 'pending' | 'suspended';
  resetPasswordToken?: string;
  resetPasswordExpire?: Date;
  passwordChangedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['doctor', 'admin', 'staff'], default: 'doctor' },
    status: { type: String, enum: ['active', 'pending', 'suspended'], default: 'active' },
    resetPasswordToken: { type: String },
    resetPasswordExpire: { type: Date },
    passwordChangedAt: { type: Date },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);
