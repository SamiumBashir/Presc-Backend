"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDoctorReports = exports.getAuditLogs = exports.updateDoctorStatus = exports.getAdminDoctors = exports.getAdminStats = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = require("../models/User");
const Doctor_1 = require("../models/Doctor");
const Chamber_1 = require("../models/Chamber");
const Patient_1 = require("../models/Patient");
const Prescription_1 = require("../models/Prescription");
const Medicine_1 = require("../models/Medicine");
const AuditLog_1 = require("../models/AuditLog");
const audit_1 = require("../middleware/audit");
const getAdminStats = async (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [totalDoctors, activeDoctors, pendingDoctors, totalPatients, totalPrescriptions, todayPrescriptions, totalMedicines, totalChambers, recentAuditLogs,] = await Promise.all([
        Doctor_1.Doctor.countDocuments(),
        User_1.User.countDocuments({ role: 'doctor', status: 'active' }),
        User_1.User.countDocuments({ role: 'doctor', status: 'pending' }),
        Patient_1.Patient.countDocuments(),
        Prescription_1.Prescription.countDocuments(),
        Prescription_1.Prescription.countDocuments({ createdAt: { $gte: today } }),
        Medicine_1.Medicine.countDocuments(),
        Chamber_1.Chamber.countDocuments({ status: 'active' }),
        AuditLog_1.AuditLog.find().sort({ createdAt: -1 }).limit(10).populate('userId', 'name email role'),
    ]);
    res.json({
        success: true,
        data: {
            stats: {
                totalDoctors,
                activeDoctors,
                pendingDoctors,
                totalPatients,
                totalPrescriptions,
                todayPrescriptions,
                totalMedicines,
                totalChambers,
            },
            recentLogs: recentAuditLogs,
        },
    });
};
exports.getAdminStats = getAdminStats;
const getAdminDoctors = async (req, res) => {
    const doctors = await Doctor_1.Doctor.find()
        .populate('userId', 'email status createdAt')
        .sort({ createdAt: -1 });
    res.json({
        success: true,
        data: doctors,
    });
};
exports.getAdminDoctors = getAdminDoctors;
const updateDoctorStatus = async (req, res) => {
    const { doctorId } = req.params;
    const { status } = req.body;
    if (!['active', 'pending', 'suspended'].includes(status)) {
        res.status(400).json({ success: false, message: 'Invalid status.' });
        return;
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(doctorId)) {
        res.status(404).json({ success: false, message: 'Doctor not found.' });
        return;
    }
    const doctor = await Doctor_1.Doctor.findById(doctorId);
    if (!doctor) {
        res.status(404).json({ success: false, message: 'Doctor not found.' });
        return;
    }
    await User_1.User.findByIdAndUpdate(doctor.userId, { status });
    await (0, audit_1.logAuditEvent)(req, {
        action: 'ADMIN_UPDATE_DOCTOR_STATUS',
        resource: 'Doctor',
        resourceId: doctorId,
        details: { doctorName: doctor.name, newStatus: status },
    });
    res.json({
        success: true,
        message: `Doctor status updated to ${status}.`,
    });
};
exports.updateDoctorStatus = updateDoctorStatus;
const getAuditLogs = async (req, res) => {
    const { page = '1', limit = '30', action, resource } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 30;
    const skip = (pageNum - 1) * limitNum;
    const query = {};
    if (action)
        query.action = action;
    if (resource)
        query.resource = resource;
    const [logs, total] = await Promise.all([
        AuditLog_1.AuditLog.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .populate('userId', 'name email role'),
        AuditLog_1.AuditLog.countDocuments(query),
    ]);
    res.json({
        success: true,
        data: {
            logs,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        },
    });
};
exports.getAuditLogs = getAuditLogs;
const getDoctorReports = async (req, res) => {
    const doctorId = req.doctor?._id;
    if (!doctorId && req.user?.role !== 'admin') {
        res.status(403).json({ success: false, message: 'Doctor scope or admin role required.' });
        return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const filter = doctorId ? { doctorId } : {};
    const [totalPatients, todayPatients, totalPrescriptions, todayPrescriptions, monthPrescriptions, allPrescriptions,] = await Promise.all([
        Patient_1.Patient.countDocuments(filter),
        Patient_1.Patient.countDocuments({ ...filter, createdAt: { $gte: today } }),
        Prescription_1.Prescription.countDocuments(filter),
        Prescription_1.Prescription.countDocuments({ ...filter, createdAt: { $gte: today } }),
        Prescription_1.Prescription.countDocuments({ ...filter, createdAt: { $gte: startOfMonth } }),
        Prescription_1.Prescription.find(filter).select('medicines diagnosis createdAt status').limit(200),
    ]);
    // Aggregate top prescribed medicines
    const medCounts = {};
    const diagnosisCounts = {};
    allPrescriptions.forEach((rx) => {
        rx.medicines.forEach((m) => {
            const key = m.brandName;
            medCounts[key] = (medCounts[key] || 0) + 1;
        });
        rx.diagnosis.forEach((d) => {
            if (d.name) {
                diagnosisCounts[d.name] = (diagnosisCounts[d.name] || 0) + 1;
            }
        });
    });
    const topMedicines = Object.entries(medCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));
    const topDiagnoses = Object.entries(diagnosisCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));
    res.json({
        success: true,
        data: {
            stats: {
                totalPatients,
                todayPatients,
                totalPrescriptions,
                todayPrescriptions,
                monthPrescriptions,
            },
            topMedicines,
            topDiagnoses,
        },
    });
};
exports.getDoctorReports = getDoctorReports;
