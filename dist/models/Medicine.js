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
exports.Medicine = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const MedicineSchema = new mongoose_1.Schema({
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
}, { timestamps: true });
// Full text & multi-field indexes for instant autocomplete
MedicineSchema.index({ medicineType: 1, brandName: 1 });
MedicineSchema.index({ brandName: 1, genericName: 1, strength: 1 });
MedicineSchema.index({
    brandName: 'text',
    genericName: 'text',
    manufacturer: 'text',
    category: 'text',
});
exports.Medicine = mongoose_1.default.model('Medicine', MedicineSchema);
