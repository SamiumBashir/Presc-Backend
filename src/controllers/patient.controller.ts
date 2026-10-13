import { Response } from 'express';
import mongoose from 'mongoose';
import { Patient } from '../models/Patient';
import { Prescription } from '../models/Prescription';
import { AuthRequest } from '../middleware/auth';
import { logAuditEvent } from '../middleware/audit';
import { PatientSchema } from '../validators/schemas';

const generatePatientId = async (): Promise<string> => {
  const currentYear = new Date().getFullYear();
  let count = await Patient.countDocuments();
  let patientId = `PAT-${currentYear}-${(count + 1).toString().padStart(4, '0')}`;
  while (await Patient.exists({ patientId })) {
    count++;
    patientId = `PAT-${currentYear}-${(count + 1).toString().padStart(4, '0')}`;
  }
  return patientId;
};

export const getPatients = async (req: AuthRequest, res: Response): Promise<void> => {
  const doctorId = req.doctor?._id;
  if (!doctorId && req.user?.role !== 'admin') {
    res.status(403).json({ success: false, message: 'Doctor scope or admin role required.' });
    return;
  }

  const { search, page = '1', limit = '20' } = req.query;
  const pageNum = parseInt(page as string, 10) || 1;
  const limitNum = parseInt(limit as string, 10) || 20;
  const skip = (pageNum - 1) * limitNum;

  const query: any = doctorId ? { doctorId } : {};

  if (search && typeof search === 'string' && search.trim() !== '') {
    const searchRegex = new RegExp(search.trim(), 'i');
    query.$or = [
      { name: searchRegex },
      { phone: searchRegex },
      { patientId: searchRegex },
    ];
  }

  const [patients, total] = await Promise.all([
    Patient.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limitNum).lean(),
    Patient.countDocuments(query),
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

export const getPatientById = async (req: AuthRequest, res: Response): Promise<void> => {
  const doctorId = req.doctor?._id;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(404).json({ success: false, message: 'Patient not found or unauthorized.' });
    return;
  }

  const patient = await Patient.findOne({ _id: id, doctorId });
  if (!patient) {
    res.status(404).json({ success: false, message: 'Patient not found or unauthorized.' });
    return;
  }

  res.json({
    success: true,
    data: patient,
  });
};

export const createPatient = async (req: AuthRequest, res: Response): Promise<void> => {
  const doctorId = req.doctor?._id;
  if (!doctorId) {
    res.status(403).json({ success: false, message: 'Doctor scope required.' });
    return;
  }

  const validated = PatientSchema.parse(req.body);
  const patientId = await generatePatientId();

  const patient = await Patient.create({
    ...validated,
    patientId,
    doctorId,
  });

  await logAuditEvent(req, {
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

export const updatePatient = async (req: AuthRequest, res: Response): Promise<void> => {
  const doctorId = req.doctor?._id;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(404).json({ success: false, message: 'Patient not found or unauthorized.' });
    return;
  }

  const validated = PatientSchema.parse(req.body);

  const patient = await Patient.findOneAndUpdate(
    { _id: id, doctorId },
    { $set: validated },
    { new: true }
  );

  if (!patient) {
    res.status(404).json({ success: false, message: 'Patient not found or unauthorized.' });
    return;
  }

  await logAuditEvent(req, {
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

export const getPatientMedicalHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  const doctorId = req.doctor?._id;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(404).json({ success: false, message: 'Patient not found or unauthorized.' });
    return;
  }

  const patient = await Patient.findOne({ _id: id, doctorId });
  if (!patient) {
    res.status(404).json({ success: false, message: 'Patient not found or unauthorized.' });
    return;
  }

  // Fetch all prescriptions for this patient in chronological order
  const prescriptions = await Prescription.find({ patientId: patient._id, doctorId })
    .sort({ createdAt: -1 })
    .populate('chamberId', 'name address');

  // Aggregate past diagnoses and unique past prescribed medicines for quick clinical review
  const allDiagnoses: string[] = [];
  const pastMedicinesMap = new Map<string, any>();

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
        chamber: (rx.chamberId as any)?.name || 'Main Chamber',
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
