import mongoose, { Document, Schema } from 'mongoose';

export interface IMedicine extends Document {
  brandName: string;
  genericName: string;
  strength: string;
  dosageForm: string;
  manufacturer: string;
  category: string;
  medicineType: 'Allopathic' | 'Unani' | 'Ayurvedic' | 'Herbal';
  unit?: string;
  price?: number;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const MedicineSchema: Schema = new Schema(
  {
    brandName: { type: String, required: true, trim: true, index: true },
    genericName: { type: String, required: true, trim: true, index: true },
    strength: { type: String, required: true, trim: true },
    dosageForm: {
      type: String,
      required: true,
      trim: true,
      default: 'Tablet',
      index: true,
    },
    manufacturer: { type: String, required: true, trim: true, index: true },
    category: { type: String, required: true, trim: true, index: true },
    medicineType: {
      type: String,
      enum: ['Allopathic', 'Unani', 'Ayurvedic', 'Herbal'],
      default: 'Allopathic',
      index: true,
    },
    unit: { type: String, default: 'mg' },
    price: { type: Number },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

// Full text & multi-field indexes for instant autocomplete
MedicineSchema.index({ medicineType: 1, brandName: 1 });
MedicineSchema.index({ brandName: 1, genericName: 1, strength: 1 });
MedicineSchema.index({
  brandName: 'text',
  genericName: 'text',
  manufacturer: 'text',
  category: 'text',
});

export const Medicine = mongoose.model<IMedicine>('Medicine', MedicineSchema);
