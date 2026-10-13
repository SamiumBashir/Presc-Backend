import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IChamber extends Document {
  doctorId: Types.ObjectId;
  name: string;
  address: string;
  phone: string;
  appointmentPhone?: string;
  visitingDays: string[];
  visitingHours: string;
  roomNo?: string;
  website?: string;
  signature?: string;
  isDefault: boolean;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const ChamberSchema: Schema = new Schema(
  {
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    appointmentPhone: { type: String, trim: true },
    website: { type: String, trim: true },
    signature: { type: String, trim: true },
    visitingDays: [{ type: String }],
    visitingHours: { type: String, default: '5:00 PM - 9:00 PM' },
    roomNo: { type: String, trim: true },
    isDefault: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

// Compound index for high-speed chamber retrieval and default sort order
ChamberSchema.index({ doctorId: 1, status: 1, isDefault: -1, createdAt: 1 });

export const Chamber = mongoose.model<IChamber>('Chamber', ChamberSchema);
