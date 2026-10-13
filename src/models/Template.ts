import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ITemplate extends Document {
  doctorId: Types.ObjectId;
  name: string;
  category?: string;
  description?: string;
  chiefComplaints?: Array<{ complaint: string; duration?: string }>;
  diagnosis?: Array<{ name: string; icdCode?: string }>;
  medicines: Array<{
    medicineId?: Types.ObjectId;
    brandName: string;
    genericName?: string;
    dosageForm: string;
    strength?: string;
    dose: string;
    frequency: string;
    duration: string;
    instruction: string;
  }>;
  investigations: string[];
  advice: string[];
  followUpDuration?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TemplateSchema: Schema = new Schema(
  {
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, default: 'General' },
    description: { type: String },
    chiefComplaints: [
      {
        complaint: { type: String },
        duration: { type: String },
      },
    ],
    diagnosis: [
      {
        name: { type: String },
        icdCode: { type: String },
      },
    ],
    medicines: [
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
      },
    ],
    investigations: [{ type: String }],
    advice: [{ type: String }],
    followUpDuration: { type: String, default: '7 days' },
  },
  { timestamps: true }
);

export const Template = mongoose.model<ITemplate>('Template', TemplateSchema);
