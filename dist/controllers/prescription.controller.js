"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrescriptionByShareToken = exports.duplicatePrescription = exports.updatePrescription = exports.createPrescription = exports.getPrescriptionById = exports.getPrescriptions = void 0;
const crypto_1 = __importDefault(require("crypto"));
const mongoose_1 = __importDefault(require("mongoose"));
const Prescription_1 = require("../models/Prescription");
const Patient_1 = require("../models/Patient");
const Chamber_1 = require("../models/Chamber");
const audit_1 = require("../middleware/audit");
const schemas_1 = require("../validators/schemas");
const generatePrescriptionId = async () => {
    const currentYear = new Date().getFullYear();
    let count = await Prescription_1.Prescription.countDocuments();
    let prescriptionId = `RX-${currentYear}-${(count + 1).toString().padStart(6, '0')}`;
    while (await Prescription_1.Prescription.exists({ prescriptionId })) {
        count++;
        prescriptionId = `RX-${currentYear}-${(count + 1).toString().padStart(6, '0')}`;
    }
    return prescriptionId;
};
const sanitizeFollowUp = (followUp) => {
    if (!followUp)
        return undefined;
    let dateVal = undefined;
    if (followUp.date && typeof followUp.date === 'string' && followUp.date.trim() !== '') {
        const parsed = new Date(followUp.date);
        if (!isNaN(parsed.getTime())) {
            dateVal = parsed;
        }
    }
    return {
        duration: followUp.duration || '7 days',
        notes: followUp.notes || undefined,
        date: dateVal,
    };
};
const generateShareToken = () => {
    return crypto_1.default.randomBytes(24).toString('hex');
};
const getPrescriptions = async (req, res) => {
    const doctorId = req.doctor?._id;
    if (!doctorId && req.user?.role !== 'admin') {
        res.status(403).json({ success: false, message: 'Doctor scope or admin role required.' });
        return;
    }
    const { patientId, status, startDate, endDate, search, page = '1', limit = '20', } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;
    const query = doctorId ? { doctorId } : {};
    if (patientId) {
        query.patientId = patientId;
    }
    if (status && status !== 'all') {
        query.status = status;
    }
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate)
            query.createdAt.$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query.createdAt.$lte = end;
        }
    }
    if (search && typeof search === 'string' && search.trim() !== '') {
        const sRegex = new RegExp(search.trim(), 'i');
        query.$or = [
            { prescriptionId: sRegex },
            { 'patientSnapshot.name': sRegex },
            { 'patientSnapshot.phone': sRegex },
            { 'patientSnapshot.patientId': sRegex },
        ];
    }
    const [prescriptions, total] = await Promise.all([
        Prescription_1.Prescription.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .select('prescriptionId patientId patientSnapshot chamberId status createdAt diagnosis medicines.medicineName medicines.strength medicines.dosageForm shareToken')
            .populate('chamberId', 'name address phone')
            .lean(),
        Prescription_1.Prescription.countDocuments(query),
    ]);
    res.json({
        success: true,
        data: {
            prescriptions,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        },
    });
};
exports.getPrescriptions = getPrescriptions;
const getPrescriptionById = async (req, res) => {
    const doctorId = req.doctor?._id;
    const { id } = req.params;
    if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
        res.status(404).json({ success: false, message: 'Prescription not found or unauthorized.' });
        return;
    }
    const prescription = await Prescription_1.Prescription.findOne({
        _id: id,
        ...(req.user?.role === 'admin' ? {} : { doctorId }),
    }).populate('chamberId');
    if (!prescription) {
        res.status(404).json({ success: false, message: 'Prescription not found or unauthorized.' });
        return;
    }
    res.json({
        success: true,
        data: prescription,
    });
};
exports.getPrescriptionById = getPrescriptionById;
const createPrescription = async (req, res) => {
    const doctor = req.doctor;
    if (!doctor) {
        res.status(403).json({ success: false, message: 'Doctor scope required.' });
        return;
    }
    const validated = schemas_1.PrescriptionSchema.parse(req.body);
    let patient = null;
    if (mongoose_1.default.Types.ObjectId.isValid(validated.patientId)) {
        patient = await Patient_1.Patient.findById(validated.patientId);
    }
    if (!patient) {
        patient = await Patient_1.Patient.findOne({ patientId: validated.patientId, doctorId: doctor._id });
    }
    if (!patient) {
        res.status(404).json({ success: false, message: 'Patient record not found.' });
        return;
    }
    let chamber = null;
    if (validated.chamberId && mongoose_1.default.Types.ObjectId.isValid(validated.chamberId)) {
        chamber = await Chamber_1.Chamber.findOne({ _id: validated.chamberId, doctorId: doctor._id });
    }
    else if (doctor.defaultChamberId) {
        chamber = await Chamber_1.Chamber.findById(doctor.defaultChamberId);
    }
    const prescriptionId = await generatePrescriptionId();
    const shareToken = generateShareToken();
    const prescription = await Prescription_1.Prescription.create({
        prescriptionId,
        doctorId: doctor._id,
        chamberId: chamber?._id,
        patientId: patient._id,
        patientSnapshot: {
            patientId: patient.patientId,
            name: patient.name,
            age: patient.age,
            gender: patient.gender,
            phone: patient.phone,
            bloodGroup: patient.bloodGroup,
            allergies: patient.allergies,
        },
        doctorSnapshot: {
            name: doctor.name,
            qualification: doctor.qualification,
            specialization: doctor.specialization,
            designation: doctor.designation,
            workplace: doctor.workplace,
            bmdcNumber: doctor.bmdcNumber,
            phone: doctor.phone,
            email: doctor.email,
            chamberName: chamber?.name || 'Main Chamber',
            chamberAddress: chamber?.address || 'Chamber Address',
            chamberWebsite: chamber?.website,
            signature: doctor.signature || chamber?.signature,
            logo: doctor.logo,
        },
        vitals: validated.vitals,
        chiefComplaints: validated.chiefComplaints,
        history: validated.history,
        examination: validated.examination,
        diagnosis: validated.diagnosis,
        medicines: validated.medicines.map((m, idx) => ({ ...m, order: idx })),
        investigations: validated.investigations,
        advice: validated.advice,
        followUp: sanitizeFollowUp(validated.followUp),
        notes: validated.notes,
        status: validated.status || 'DRAFT',
        finalizedAt: validated.status === 'FINALIZED' ? new Date() : undefined,
        shareToken,
        version: 1,
    });
    // Update patient last visit & last diagnosis
    patient.lastVisit = new Date();
    if (validated.diagnosis.length > 0) {
        patient.lastDiagnosis = validated.diagnosis.map((d) => d.name).join(', ');
    }
    await patient.save();
    await (0, audit_1.logAuditEvent)(req, {
        action: validated.status === 'FINALIZED' ? 'PRESCRIPTION_FINALIZE' : 'PRESCRIPTION_CREATE_DRAFT',
        resource: 'Prescription',
        resourceId: prescription._id.toString(),
        details: {
            prescriptionId: prescription.prescriptionId,
            patientName: patient.name,
            status: prescription.status,
        },
    });
    res.status(201).json({
        success: true,
        message: prescription.status === 'FINALIZED'
            ? 'Prescription finalized successfully.'
            : 'Prescription saved as draft.',
        data: prescription,
    });
};
exports.createPrescription = createPrescription;
const updatePrescription = async (req, res) => {
    const doctor = req.doctor;
    const { id } = req.params;
    if (!doctor) {
        res.status(403).json({ success: false, message: 'Doctor scope required.' });
        return;
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
        res.status(404).json({ success: false, message: 'Prescription not found.' });
        return;
    }
    const existing = await Prescription_1.Prescription.findOne({ _id: id, doctorId: doctor._id });
    if (!existing) {
        res.status(404).json({ success: false, message: 'Prescription not found.' });
        return;
    }
    if (existing.status === 'FINALIZED') {
        res.status(400).json({
            success: false,
            message: 'Finalized prescriptions cannot be modified directly. Please create an amendment or clone as a new prescription.',
        });
        return;
    }
    const validated = schemas_1.PrescriptionSchema.parse(req.body);
    let chamber = null;
    if (validated.chamberId && mongoose_1.default.Types.ObjectId.isValid(validated.chamberId)) {
        chamber = await Chamber_1.Chamber.findOne({ _id: validated.chamberId, doctorId: doctor._id });
    }
    existing.vitals = validated.vitals;
    existing.chiefComplaints = validated.chiefComplaints;
    existing.history = validated.history;
    existing.examination = validated.examination;
    existing.diagnosis = validated.diagnosis;
    existing.medicines = validated.medicines.map((m, idx) => ({ ...m, order: idx }));
    existing.investigations = validated.investigations;
    existing.advice = validated.advice;
    existing.followUp = sanitizeFollowUp(validated.followUp);
    existing.notes = validated.notes;
    if (chamber) {
        existing.chamberId = chamber._id;
        if (existing.doctorSnapshot) {
            existing.doctorSnapshot.chamberName = chamber.name;
            existing.doctorSnapshot.chamberAddress = chamber.address;
        }
    }
    if (validated.status === 'FINALIZED') {
        existing.status = 'FINALIZED';
        existing.finalizedAt = new Date();
    }
    await existing.save();
    await (0, audit_1.logAuditEvent)(req, {
        action: existing.status === 'FINALIZED' ? 'PRESCRIPTION_FINALIZE' : 'PRESCRIPTION_UPDATE_DRAFT',
        resource: 'Prescription',
        resourceId: existing._id.toString(),
        details: { prescriptionId: existing.prescriptionId, status: existing.status },
    });
    res.json({
        success: true,
        message: existing.status === 'FINALIZED'
            ? 'Prescription finalized successfully.'
            : 'Prescription draft updated.',
        data: existing,
    });
};
exports.updatePrescription = updatePrescription;
const duplicatePrescription = async (req, res) => {
    const doctor = req.doctor;
    const { id } = req.params;
    if (!doctor) {
        res.status(403).json({ success: false, message: 'Doctor scope required.' });
        return;
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
        res.status(404).json({ success: false, message: 'Source prescription not found.' });
        return;
    }
    const source = await Prescription_1.Prescription.findOne({ _id: id, doctorId: doctor._id });
    if (!source) {
        res.status(404).json({ success: false, message: 'Source prescription not found.' });
        return;
    }
    const prescriptionId = await generatePrescriptionId();
    const shareToken = generateShareToken();
    const cloned = await Prescription_1.Prescription.create({
        prescriptionId,
        doctorId: doctor._id,
        chamberId: source.chamberId,
        patientId: source.patientId,
        patientSnapshot: source.patientSnapshot,
        doctorSnapshot: {
            name: doctor.name,
            qualification: doctor.qualification,
            specialization: doctor.specialization,
            designation: doctor.designation,
            workplace: doctor.workplace,
            bmdcNumber: doctor.bmdcNumber,
            phone: doctor.phone,
            email: doctor.email,
            chamberName: source.doctorSnapshot?.chamberName || 'Main Chamber',
            chamberAddress: source.doctorSnapshot?.chamberAddress || 'Chamber Address',
            chamberWebsite: source.doctorSnapshot?.chamberWebsite,
            signature: doctor.signature,
            logo: doctor.logo,
        },
        vitals: source.vitals,
        chiefComplaints: source.chiefComplaints,
        history: source.history,
        examination: source.examination,
        diagnosis: source.diagnosis,
        medicines: source.medicines,
        investigations: source.investigations,
        advice: source.advice,
        followUp: source.followUp,
        status: 'DRAFT',
        shareToken,
        version: 1,
        parentPrescriptionId: source._id,
    });
    await (0, audit_1.logAuditEvent)(req, {
        action: 'PRESCRIPTION_DUPLICATE',
        resource: 'Prescription',
        resourceId: cloned._id.toString(),
        details: { sourceId: source.prescriptionId, newId: cloned.prescriptionId },
    });
    res.status(201).json({
        success: true,
        message: 'Prescription cloned as a new draft ready for editing.',
        data: cloned,
    });
};
exports.duplicatePrescription = duplicatePrescription;
const getPrescriptionByShareToken = async (req, res) => {
    const { token } = req.params;
    const prescription = await Prescription_1.Prescription.findOne({ shareToken: token }).populate('chamberId');
    if (!prescription) {
        res.status(404).json({ success: false, message: 'Prescription not found or link expired.' });
        return;
    }
    res.json({
        success: true,
        data: prescription,
    });
};
exports.getPrescriptionByShareToken = getPrescriptionByShareToken;
