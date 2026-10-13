import { Response } from 'express';
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Doctor } from '../models/Doctor';
import { Chamber } from '../models/Chamber';
import { Patient } from '../models/Patient';
import { Prescription } from '../models/Prescription';
import { Medicine } from '../models/Medicine';
import { AuditLog } from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth';
import { logAuditEvent } from '../middleware/audit';

export const getAdminStats = async (req: AuthRequest, res: Response): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalDoctors,
    activeDoctors,
    pendingDoctors,
    totalPatients,
    totalPrescriptions,
    todayPrescriptions,
    totalMedicines,
    totalChambers,
    recentAuditLogs,
  ] = await Promise.all([
    Doctor.countDocuments(),
    User.countDocuments({ role: 'doctor', status: 'active' }),
    User.countDocuments({ role: 'doctor', status: 'pending' }),
    Patient.countDocuments(),
    Prescription.countDocuments(),
    Prescription.countDocuments({ createdAt: { $gte: today } }),
    Medicine.countDocuments(),
    Chamber.countDocuments({ status: 'active' }),
    AuditLog.find().sort({ createdAt: -1 }).limit(10).populate('userId', 'name email role'),
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

export const getAdminDoctors = async (req: AuthRequest, res: Response): Promise<void> => {
  const doctors = await Doctor.find()
    .populate('userId', 'email status createdAt')
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    data: doctors,
  });
};

export const updateDoctorStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  const { doctorId } = req.params;
  const { status } = req.body;

  if (!['active', 'pending', 'suspended'].includes(status)) {
    res.status(400).json({ success: false, message: 'Invalid status.' });
    return;
  }

  if (!mongoose.Types.ObjectId.isValid(doctorId)) {
    res.status(404).json({ success: false, message: 'Doctor not found.' });
    return;
  }

  const doctor = await Doctor.findById(doctorId);
  if (!doctor) {
    res.status(404).json({ success: false, message: 'Doctor not found.' });
    return;
  }

  await User.findByIdAndUpdate(doctor.userId, { status });

  await logAuditEvent(req, {
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

export const getAuditLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  const { page = '1', limit = '30', action, resource } = req.query;
  const pageNum = parseInt(page as string, 10) || 1;
  const limitNum = parseInt(limit as string, 10) || 30;
  const skip = (pageNum - 1) * limitNum;

  const query: any = {};
  if (action) query.action = action;
  if (resource) query.resource = resource;

  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('userId', 'name email role'),
    AuditLog.countDocuments(query),
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

export const getDoctorReports = async (req: AuthRequest, res: Response): Promise<void> => {
  const doctorId = req.doctor?._id;
  if (!doctorId && req.user?.role !== 'admin') {
    res.status(403).json({ success: false, message: 'Doctor scope or admin role required.' });
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const filter: any = doctorId ? { doctorId } : {};

  const [
    totalPatients,
    todayPatients,
    totalPrescriptions,
    todayPrescriptions,
    monthPrescriptions,
    allPrescriptions,
  ] = await Promise.all([
    Patient.countDocuments(filter),
    Patient.countDocuments({ ...filter, createdAt: { $gte: today } }),
    Prescription.countDocuments(filter),
    Prescription.countDocuments({ ...filter, createdAt: { $gte: today } }),
    Prescription.countDocuments({ ...filter, createdAt: { $gte: startOfMonth } }),
    Prescription.find(filter).select('medicines diagnosis createdAt status').limit(200),
  ]);

  // Aggregate top prescribed medicines
  const medCounts: { [key: string]: number } = {};
  const diagnosisCounts: { [key: string]: number } = {};

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
