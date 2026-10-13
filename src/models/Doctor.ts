import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IDoctorSettings {
  paperSize: 'A4' | 'Letter' | 'A5';
  defaultLanguage: 'en' | 'bn';
  defaultFollowUp: string;
  headerVisibility: boolean;
  footerVisibility: boolean;
  themeColor: string;
  showWatermark: boolean;
  showQrCode: boolean;
}

export interface IDoctor extends Document {
  userId: Types.ObjectId;
  name: string;
  qualification: string;
  specialization: string;
  bmdcNumber: string;
  designation?: string;
  workplace?: string;
  healthcareInstitutions?: string[];
  healthcareAuthority?: string;
  registrationNumber?: string;
  institutionRegNumbers?: Record<string, string>;
  phone: string;
  email: string;
  profileImage?: string;
  signature?: string;
  logo?: string;
  favoriteMedicines: Types.ObjectId[];
  defaultChamberId?: Types.ObjectId;
  settings: IDoctorSettings;
  createdAt: Date;
  updatedAt: Date;
}

const DoctorSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, required: true, trim: true },
    qualification: { type: String, required: true, default: 'MBBS' },
    specialization: { type: String, required: true, default: 'General Physician' },
    bmdcNumber: { type: String, trim: true },
    healthcareAuthority: { type: String, trim: true, default: 'BMDC' },
    registrationNumber: { type: String, trim: true },
    institutionRegNumbers: { type: Schema.Types.Mixed, default: {} },
    designation: { type: String, trim: true },
    workplace: { type: String, trim: true },
    healthcareInstitutions: [{ type: String, trim: true }],
    phone: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    profileImage: { type: String },
    signature: { type: String },
    logo: { type: String },
    favoriteMedicines: [{ type: Schema.Types.ObjectId, ref: 'Medicine' }],
    defaultChamberId: { type: Schema.Types.ObjectId, ref: 'Chamber' },
    settings: {
      paperSize: { type: String, enum: ['A4', 'Letter', 'A5'], default: 'A4' },
      defaultLanguage: { type: String, enum: ['en', 'bn'], default: 'en' },
      defaultFollowUp: { type: String, default: '7 days' },
      headerVisibility: { type: Boolean, default: true },
      footerVisibility: { type: Boolean, default: true },
      themeColor: { type: String, default: '#008ba3' },
      showWatermark: { type: Boolean, default: true },
      showQrCode: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

export const Doctor = mongoose.model<IDoctor>('Doctor', DoctorSchema);
