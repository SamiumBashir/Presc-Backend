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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrescriptionSchema = exports.prescriptionRepository = exports.Prescription = exports.prescriptionRoutes = exports.prescriptionController = void 0;
exports.prescriptionController = __importStar(require("../../controllers/prescription.controller"));
var prescription_routes_1 = require("../../routes/prescription.routes");
Object.defineProperty(exports, "prescriptionRoutes", { enumerable: true, get: function () { return __importDefault(prescription_routes_1).default; } });
var Prescription_1 = require("../../models/Prescription");
Object.defineProperty(exports, "Prescription", { enumerable: true, get: function () { return Prescription_1.Prescription; } });
var prescription_repository_1 = require("../../repositories/prescription.repository");
Object.defineProperty(exports, "prescriptionRepository", { enumerable: true, get: function () { return prescription_repository_1.prescriptionRepository; } });
var schemas_1 = require("../../validators/schemas");
Object.defineProperty(exports, "PrescriptionSchema", { enumerable: true, get: function () { return schemas_1.PrescriptionSchema; } });
