import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IPatient extends Document {
  patientId: string;
  doctorId: Types.ObjectId;
  name: string;
  phone: string;
  email?: string;
  dob?: Date;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  bloodGroup?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'Unknown';
  address?: string;
  emergencyContact?: string;
  allergies: string[];
  medicalHistory: string[];
  notes?: string;
  lastVisit?: Date;
  lastDiagnosis?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PatientSchema: Schema = new Schema(
  {
    patientId: { type: String, required: true, index: true },
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, lowercase: true, trim: true },
    dob: { type: Date },
    age: { type: Number, required: true, min: 0, max: 130 },
    gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
    bloodGroup: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'],
      default: 'Unknown',
    },
    address: { type: String, trim: true },
    emergencyContact: { type: String, trim: true },
    allergies: [{ type: String }],
    medicalHistory: [{ type: String }],
    notes: { type: String },
    lastVisit: { type: Date },
    lastDiagnosis: { type: String },
  },
  { timestamps: true }
);

// Compound index for super-fast doctor-scoped search and timeline sorting
PatientSchema.index({ doctorId: 1, phone: 1 });
PatientSchema.index({ doctorId: 1, name: 'text', patientId: 'text' });
PatientSchema.index({ doctorId: 1, updatedAt: -1 });
PatientSchema.index({ doctorId: 1, createdAt: -1 });

export const Patient = mongoose.model<IPatient>('Patient', PatientSchema);
