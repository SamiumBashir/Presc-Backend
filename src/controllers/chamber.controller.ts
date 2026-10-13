import { Response } from 'express';
import mongoose from 'mongoose';
import { Chamber } from '../models/Chamber';
import { Doctor } from '../models/Doctor';
import { AuthRequest } from '../middleware/auth';
import { logAuditEvent } from '../middleware/audit';
import { ChamberSchema } from '../validators/schemas';

export const getChambers = async (req: AuthRequest, res: Response): Promise<void> => {
  const doctorId = req.doctor?._id;
  if (!doctorId) {
    res.status(403).json({ success: false, message: 'Doctor scope required.' });
    return;
  }

  const chambers = await Chamber.find({ doctorId, status: 'active' })
    .sort({ isDefault: -1, createdAt: 1 })
    .lean();
  res.json({ success: true, data: chambers });
};

export const createChamber = async (req: AuthRequest, res: Response): Promise<void> => {
  const doctorId = req.doctor?._id;
  if (!doctorId) {
    res.status(403).json({ success: false, message: 'Doctor scope required.' });
    return;
  }

  const validated = ChamberSchema.parse(req.body);

  const activeChambersCount = await Chamber.countDocuments({ doctorId, status: 'active' });
  const isFirstChamber = activeChambersCount === 0;
  const shouldBeDefault = validated.isDefault || isFirstChamber;

  if (shouldBeDefault) {
    await Chamber.updateMany({ doctorId }, { $set: { isDefault: false } });
  }

  const chamber = await Chamber.create({
    ...validated,
    isDefault: shouldBeDefault,
    doctorId,
  });

  if (shouldBeDefault) {
    await Doctor.findByIdAndUpdate(doctorId, { defaultChamberId: chamber._id });
  }

  await logAuditEvent(req, {
    action: 'CHAMBER_CREATE',
    resource: 'Chamber',
    resourceId: chamber._id.toString(),
    details: { name: chamber.name, isDefault: chamber.isDefault },
  });

  res.status(201).json({
    success: true,
    message: 'Chamber added successfully.',
    data: chamber,
  });
};

export const updateChamber = async (req: AuthRequest, res: Response): Promise<void> => {
  const doctorId = req.doctor?._id;
  const { id } = req.params;

  if (!doctorId) {
    res.status(403).json({ success: false, message: 'Doctor scope required.' });
    return;
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(404).json({ success: false, message: 'Chamber not found.' });
    return;
  }

  const validated = ChamberSchema.parse(req.body);

  if (validated.isDefault) {
    await Chamber.updateMany({ doctorId }, { $set: { isDefault: false } });
    await Doctor.findByIdAndUpdate(doctorId, { defaultChamberId: id });
  } else {
    // If attempting to unset default, ensure there is another active default chamber
    const otherDefault = await Chamber.findOne({
      doctorId,
      _id: { $ne: id },
      status: 'active',
      isDefault: true,
    });
    if (!otherDefault) {
      validated.isDefault = true;
    }
  }

  const chamber = await Chamber.findOneAndUpdate(
    { _id: id, doctorId },
    { $set: validated },
    { new: true }
  );

  if (!chamber) {
    res.status(404).json({ success: false, message: 'Chamber not found.' });
    return;
  }

  await logAuditEvent(req, {
    action: 'CHAMBER_UPDATE',
    resource: 'Chamber',
    resourceId: id,
    details: { name: chamber.name, isDefault: chamber.isDefault },
  });

  res.json({
    success: true,
    message: 'Chamber details updated.',
    data: chamber,
  });
};

export const deleteChamber = async (req: AuthRequest, res: Response): Promise<void> => {
  const doctorId = req.doctor?._id;
  const { id } = req.params;

  if (!doctorId) {
    res.status(403).json({ success: false, message: 'Doctor scope required.' });
    return;
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(404).json({ success: false, message: 'Chamber not found.' });
    return;
  }

  const chamber = await Chamber.findOneAndUpdate(
    { _id: id, doctorId },
    { $set: { status: 'inactive', isDefault: false } },
    { new: true }
  );

  if (!chamber) {
    res.status(404).json({ success: false, message: 'Chamber not found.' });
    return;
  }

  // If the deleted chamber was the default, promote another active chamber to default
  const doctor = await Doctor.findById(doctorId);
  const wasDefault =
    chamber.isDefault ||
    (doctor?.defaultChamberId && doctor.defaultChamberId.toString() === id);

  if (wasDefault) {
    const nextChamber = await Chamber.findOne({ doctorId, status: 'active' }).sort({ createdAt: 1 });
    if (nextChamber) {
      nextChamber.isDefault = true;
      await nextChamber.save();
      await Doctor.findByIdAndUpdate(doctorId, { defaultChamberId: nextChamber._id });
    } else {
      await Doctor.findByIdAndUpdate(doctorId, { $unset: { defaultChamberId: 1 } });
    }
  }

  await logAuditEvent(req, {
    action: 'CHAMBER_DEACTIVATE',
    resource: 'Chamber',
    resourceId: id,
    details: { name: chamber.name },
  });

  res.json({
    success: true,
    message: 'Chamber deactivated successfully.',
  });
};
