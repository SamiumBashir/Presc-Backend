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
exports.Doctor = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const DoctorSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, required: true, trim: true },
    qualification: { type: String, required: true, default: 'MBBS' },
    specialization: { type: String, required: true, default: 'General Physician' },
    bmdcNumber: { type: String, trim: true },
    healthcareAuthority: { type: String, trim: true, default: 'BMDC' },
    registrationNumber: { type: String, trim: true },
    institutionRegNumbers: { type: mongoose_1.Schema.Types.Mixed, default: {} },
    designation: { type: String, trim: true },
    workplace: { type: String, trim: true },
    healthcareInstitutions: [{ type: String, trim: true }],
    phone: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    profileImage: { type: String },
    signature: { type: String },
    logo: { type: String },
    favoriteMedicines: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'Medicine' }],
    defaultChamberId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Chamber' },
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
}, { timestamps: true });
exports.Doctor = mongoose_1.default.model('Doctor', DoctorSchema);
