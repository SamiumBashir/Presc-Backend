"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPatientMedicalHistory = exports.updatePatient = exports.createPatient = exports.getPatientById = exports.getPatients = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Patient_1 = require("../models/Patient");
const Prescription_1 = require("../models/Prescription");
const audit_1 = require("../middleware/audit");
const schemas_1 = require("../validators/schemas");
const generatePatientId = async () => {
    const currentYear = new Date().getFullYear();
    let count = await Patient_1.Patient.countDocuments();
    let patientId = `PAT-${currentYear}-${(count + 1).toString().padStart(4, '0')}`;
    while (await Patient_1.Patient.exists({ patientId })) {
        count++;
        patientId = `PAT-${currentYear}-${(count + 1).toString().padStart(4, '0')}`;
    }
    return patientId;
};
const getPatients = async (req, res) => {
    const doctorId = req.doctor?._id;
    if (!doctorId && req.user?.role !== 'admin') {
        res.status(403).json({ success: false, message: 'Doctor scope or admin role required.' });
        return;
    }
    const { search, page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;
    const query = doctorId ? { doctorId } : {};
    if (search && typeof search === 'string' && search.trim() !== '') {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [
            { name: searchRegex },
            { phone: searchRegex },
            { patientId: searchRegex },
        ];
    }
    const [patients, total] = await Promise.all([
        Patient_1.Patient.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limitNum).lean(),
        Patient_1.Patient.countDocuments(query),
    ]);
    res.json({
        success: true,
        data: {
            patients,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        },
    });
};
exports.getPatients = getPatients;
const getPatientById = async (req, res) => {
    const doctorId = req.doctor?._id;
    const { id } = req.params;
    if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
        res.status(404).json({ success: false, message: 'Patient not found or unauthorized.' });
        return;
    }
    const patient = await Patient_1.Patient.findOne({ _id: id, doctorId });
    if (!patient) {
        res.status(404).json({ success: false, message: 'Patient not found or unauthorized.' });
        return;
    }
    res.json({
        success: true,
        data: patient,
    });
};
exports.getPatientById = getPatientById;
const createPatient = async (req, res) => {
    const doctorId = req.doctor?._id;
    if (!doctorId) {
        res.status(403).json({ success: false, message: 'Doctor scope required.' });
        return;
    }
    const validated = schemas_1.PatientSchema.parse(req.body);
    const patientId = await generatePatientId();
    const patient = await Patient_1.Patient.create({
        ...validated,
        patientId,
        doctorId,
    });
    await (0, audit_1.logAuditEvent)(req, {
        action: 'PATIENT_CREATE',
        resource: 'Patient',
        resourceId: patient._id.toString(),
        details: { patientId: patient.patientId, name: patient.name, phone: patient.phone },
    });
    res.status(201).json({
        success: true,
        message: 'Patient registered successfully.',
        data: patient,
    });
};
exports.createPatient = createPatient;
const updatePatient = async (req, res) => {
    const doctorId = req.doctor?._id;
    const { id } = req.params;
    if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
        res.status(404).json({ success: false, message: 'Patient not found or unauthorized.' });
        return;
    }
    const validated = schemas_1.PatientSchema.parse(req.body);
    const patient = await Patient_1.Patient.findOneAndUpdate({ _id: id, doctorId }, { $set: validated }, { new: true });
    if (!patient) {
        res.status(404).json({ success: false, message: 'Patient not found or unauthorized.' });
        return;
    }
    await (0, audit_1.logAuditEvent)(req, {
        action: 'PATIENT_UPDATE',
        resource: 'Patient',
        resourceId: patient._id.toString(),
    });
    res.json({
        success: true,
        message: 'Patient updated successfully.',
        data: patient,
    });
};
exports.updatePatient = updatePatient;
const getPatientMedicalHistory = async (req, res) => {
    const doctorId = req.doctor?._id;
    const { id } = req.params;
    if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
        res.status(404).json({ success: false, message: 'Patient not found or unauthorized.' });
        return;
    }
    const patient = await Patient_1.Patient.findOne({ _id: id, doctorId });
    if (!patient) {
        res.status(404).json({ success: false, message: 'Patient not found or unauthorized.' });
        return;
    }
    // Fetch all prescriptions for this patient in chronological order
    const prescriptions = await Prescription_1.Prescription.find({ patientId: patient._id, doctorId })
        .sort({ createdAt: -1 })
        .populate('chamberId', 'name address');
    // Aggregate past diagnoses and unique past prescribed medicines for quick clinical review
    const allDiagnoses = [];
    const pastMedicinesMap = new Map();
    prescriptions.forEach((rx) => {
        rx.diagnosis.forEach((d) => {
            if (d.name && !allDiagnoses.includes(d.name)) {
                allDiagnoses.push(d.name);
            }
        });
        rx.medicines.forEach((med) => {
            if (med.brandName && !pastMedicinesMap.has(med.brandName)) {
                pastMedicinesMap.set(med.brandName, {
                    brandName: med.brandName,
                    genericName: med.genericName,
                    strength: med.strength,
                    dosageForm: med.dosageForm,
                    lastDose: med.dose,
                    lastFrequency: med.frequency,
                    lastPrescribedDate: rx.createdAt,
                });
            }
        });
    });
    res.json({
        success: true,
        data: {
            patient,
            prescriptions,
            timeline: prescriptions.map((rx) => ({
                id: rx._id,
                prescriptionId: rx.prescriptionId,
                date: rx.createdAt,
                status: rx.status,
                chamber: rx.chamberId?.name || 'Main Chamber',
                chiefComplaints: rx.chiefComplaints,
                diagnoses: rx.diagnosis,
                vitals: rx.vitals,
                medicinesCount: rx.medicines.length,
                investigationsCount: rx.investigations.length,
            })),
            pastDiagnoses: allDiagnoses,
            pastMedicines: Array.from(pastMedicinesMap.values()),
        },
    });
};
exports.getPatientMedicalHistory = getPatientMedicalHistory;
