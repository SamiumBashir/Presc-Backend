"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Prescription = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const PrescriptionMedicineSchema = new mongoose_1.Schema({
    medicineId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Medicine' },
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
}, { _id: false });
const PrescriptionSchema = new mongoose_1.Schema({
    prescriptionId: { type: String, required: true, unique: true, index: true },
    doctorId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    chamberId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Chamber' },
    patientId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
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
    parentPrescriptionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Prescription' },
}, { timestamps: true });
// Indexes for fast history querying
PrescriptionSchema.index({ doctorId: 1, createdAt: -1 });
PrescriptionSchema.index({ patientId: 1, createdAt: -1 });
PrescriptionSchema.index({ doctorId: 1, status: 1 });
PrescriptionSchema.index({ doctorId: 1, 'patientSnapshot.name': 1 });
PrescriptionSchema.index({ doctorId: 1, 'patientSnapshot.phone': 1 });
exports.Prescription = mongoose_1.default.model('Prescription', PrescriptionSchema);
