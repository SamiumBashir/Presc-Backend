import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IPrescriptionMedicine {
  medicineId?: Types.ObjectId;
  brandName: string;
  genericName?: string;
  dosageForm: string;
  strength?: string;
  dose: string;
  frequency: string;
  duration: string;
  instruction: string;
  customNote?: string;
  order: number;
}

export interface IPrescriptionChiefComplaint {
  complaint: string;
  duration?: string;
  note?: string;
}

export interface IPrescriptionDiagnosis {
  name: string;
  icdCode?: string;
  type?: 'provisional' | 'differential' | 'confirmed';
}

export interface IPrescriptionVitals {
  bpSystolic?: number;
  bpDiastolic?: number;
  pulse?: number;
  temperature?: number;
  spo2?: number;
  weight?: number; // kg
  height?: number; // cm or inches
  bmi?: number;
}

export interface IPrescription extends Document {
  prescriptionId: string;
  doctorId: Types.ObjectId;
  chamberId?: Types.ObjectId;
  patientId: Types.ObjectId;
  patientSnapshot: {
    patientId: string;
    name: string;
    age: number;
    gender: string;
    phone: string;
    bloodGroup?: string;
    allergies?: string[];
  };
  doctorSnapshot?: {
    name: string;
    qualification: string;
    specialization: string;
    bmdcNumber: string;
    designation?: string;
    workplace?: string;
    phone?: string;
    email?: string;
    chamberName?: string;
    chamberAddress?: string;
    chamberWebsite?: string;
    signature?: string;
    logo?: string;
  };
  vitals?: IPrescriptionVitals;
  chiefComplaints: IPrescriptionChiefComplaint[];
  history?: string;
  examination?: string;
  diagnosis: IPrescriptionDiagnosis[];
  medicines: IPrescriptionMedicine[];
  investigations: string[];
  advice: string[];
  followUp?: {
    duration: string;
    date?: Date;
    notes?: string;
  };
  notes?: string;
  status: 'DRAFT' | 'FINALIZED' | 'CANCELLED';
  finalizedAt?: Date;
  shareToken: string;
  version: number;
  parentPrescriptionId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PrescriptionMedicineSchema = new Schema(
  {
    medicineId: { type: Schema.Types.ObjectId, ref: 'Medicine' },
    brandName: { type: String, required: true },
    genericName: { type: String },
    dosageForm: { type: String, default: 'Tablet' },
    strength: { type: String },
    dose: { type: String, default: '1 tablet' },
    frequency: { type: String, default: '1+0+1' },
    duration: { type: String, default: '5 days' },
    instruction: { type: String, default: 'After meal' },
    customNote: { type: String },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const PrescriptionSchema: Schema = new Schema(
  {
    prescriptionId: { type: String, required: true, unique: true, index: true },
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    chamberId: { type: Schema.Types.ObjectId, ref: 'Chamber' },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    patientSnapshot: {
      patientId: { type: String, required: true },
      name: { type: String, required: true },
      age: { type: Number, required: true },
      gender: { type: String, required: true },
      phone: { type: String, default: '' },
      bloodGroup: { type: String },
      allergies: [{ type: String }],
    },
    doctorSnapshot: {
      name: { type: String },
      qualification: { type: String },
      specialization: { type: String },
      bmdcNumber: { type: String },
      designation: { type: String },
      workplace: { type: String },
      phone: { type: String },
      email: { type: String },
      chamberName: { type: String },
      chamberAddress: { type: String },
      chamberWebsite: { type: String },
      signature: { type: String },
      logo: { type: String },
    },
    vitals: {
      bpSystolic: { type: Number },
      bpDiastolic: { type: Number },
      pulse: { type: Number },
      temperature: { type: Number },
      spo2: { type: Number },
      weight: { type: Number },
      height: { type: Number },
      bmi: { type: Number },
    },
    chiefComplaints: [
      {
        complaint: { type: String, required: true },
        duration: { type: String },
        note: { type: String },
      },
    ],
    history: { type: String },
    examination: { type: String },
    diagnosis: [
      {
        name: { type: String, required: true },
        icdCode: { type: String },
        type: { type: String, enum: ['provisional', 'differential', 'confirmed'], default: 'provisional' },
      },
    ],
    medicines: [PrescriptionMedicineSchema],
    investigations: [{ type: String }],
    advice: [{ type: String }],
    followUp: {
      duration: { type: String, default: '7 days' },
      date: { type: Date },
      notes: { type: String },
    },
    notes: { type: String },
    status: { type: String, enum: ['DRAFT', 'FINALIZED', 'CANCELLED'], default: 'DRAFT', index: true },
    finalizedAt: { type: Date },
    shareToken: { type: String, required: true, unique: true, index: true },
    version: { type: Number, default: 1 },
    parentPrescriptionId: { type: Schema.Types.ObjectId, ref: 'Prescription' },
  },
  { timestamps: true }
);

// Indexes for fast history querying
PrescriptionSchema.index({ doctorId: 1, createdAt: -1 });
PrescriptionSchema.index({ patientId: 1, createdAt: -1 });
PrescriptionSchema.index({ doctorId: 1, status: 1 });
PrescriptionSchema.index({ doctorId: 1, 'patientSnapshot.name': 1 });
PrescriptionSchema.index({ doctorId: 1, 'patientSnapshot.phone': 1 });

export const Prescription = mongoose.model<IPrescription>('Prescription', PrescriptionSchema);
