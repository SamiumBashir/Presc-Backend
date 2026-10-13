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
exports.Template = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const TemplateSchema = new mongoose_1.Schema({
    doctorId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
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
            medicineId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Medicine' },
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
}, { timestamps: true });
exports.Template = mongoose_1.default.model('Template', TemplateSchema);
