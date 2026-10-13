"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteChamber = exports.updateChamber = exports.createChamber = exports.getChambers = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Chamber_1 = require("../models/Chamber");
const Doctor_1 = require("../models/Doctor");
const audit_1 = require("../middleware/audit");
const schemas_1 = require("../validators/schemas");
const getChambers = async (req, res) => {
    const doctorId = req.doctor?._id;
    if (!doctorId) {
        res.status(403).json({ success: false, message: 'Doctor scope required.' });
        return;
    }
    const chambers = await Chamber_1.Chamber.find({ doctorId, status: 'active' })
        .sort({ isDefault: -1, createdAt: 1 })
        .lean();
    res.json({ success: true, data: chambers });
};
exports.getChambers = getChambers;
const createChamber = async (req, res) => {
    const doctorId = req.doctor?._id;
    if (!doctorId) {
        res.status(403).json({ success: false, message: 'Doctor scope required.' });
        return;
    }
    const validated = schemas_1.ChamberSchema.parse(req.body);
    const activeChambersCount = await Chamber_1.Chamber.countDocuments({ doctorId, status: 'active' });
    const isFirstChamber = activeChambersCount === 0;
    const shouldBeDefault = validated.isDefault || isFirstChamber;
    if (shouldBeDefault) {
        await Chamber_1.Chamber.updateMany({ doctorId }, { $set: { isDefault: false } });
    }
    const chamber = await Chamber_1.Chamber.create({
        ...validated,
        isDefault: shouldBeDefault,
        doctorId,
    });
    if (shouldBeDefault) {
        await Doctor_1.Doctor.findByIdAndUpdate(doctorId, { defaultChamberId: chamber._id });
    }
    await (0, audit_1.logAuditEvent)(req, {
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
exports.createChamber = createChamber;
const updateChamber = async (req, res) => {
    const doctorId = req.doctor?._id;
    const { id } = req.params;
    if (!doctorId) {
        res.status(403).json({ success: false, message: 'Doctor scope required.' });
        return;
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
        res.status(404).json({ success: false, message: 'Chamber not found.' });
        return;
    }
    const validated = schemas_1.ChamberSchema.parse(req.body);
    if (validated.isDefault) {
        await Chamber_1.Chamber.updateMany({ doctorId }, { $set: { isDefault: false } });
        await Doctor_1.Doctor.findByIdAndUpdate(doctorId, { defaultChamberId: id });
    }
    else {
        // If attempting to unset default, ensure there is another active default chamber
        const otherDefault = await Chamber_1.Chamber.findOne({
            doctorId,
            _id: { $ne: id },
            status: 'active',
            isDefault: true,
        });
        if (!otherDefault) {
            validated.isDefault = true;
        }
    }
    const chamber = await Chamber_1.Chamber.findOneAndUpdate({ _id: id, doctorId }, { $set: validated }, { new: true });
    if (!chamber) {
        res.status(404).json({ success: false, message: 'Chamber not found.' });
        return;
    }
    await (0, audit_1.logAuditEvent)(req, {
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
exports.updateChamber = updateChamber;
const deleteChamber = async (req, res) => {
    const doctorId = req.doctor?._id;
    const { id } = req.params;
    if (!doctorId) {
        res.status(403).json({ success: false, message: 'Doctor scope required.' });
        return;
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
        res.status(404).json({ success: false, message: 'Chamber not found.' });
        return;
    }
    const chamber = await Chamber_1.Chamber.findOneAndUpdate({ _id: id, doctorId }, { $set: { status: 'inactive', isDefault: false } }, { new: true });
    if (!chamber) {
        res.status(404).json({ success: false, message: 'Chamber not found.' });
        return;
    }
    // If the deleted chamber was the default, promote another active chamber to default
    const doctor = await Doctor_1.Doctor.findById(doctorId);
    const wasDefault = chamber.isDefault ||
        (doctor?.defaultChamberId && doctor.defaultChamberId.toString() === id);
    if (wasDefault) {
        const nextChamber = await Chamber_1.Chamber.findOne({ doctorId, status: 'active' }).sort({ createdAt: 1 });
        if (nextChamber) {
            nextChamber.isDefault = true;
            await nextChamber.save();
            await Doctor_1.Doctor.findByIdAndUpdate(doctorId, { defaultChamberId: nextChamber._id });
        }
        else {
            await Doctor_1.Doctor.findByIdAndUpdate(doctorId, { $unset: { defaultChamberId: 1 } });
        }
    }
    await (0, audit_1.logAuditEvent)(req, {
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
exports.deleteChamber = deleteChamber;
