"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTemplate = exports.updateTemplate = exports.createTemplate = exports.getTemplates = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Template_1 = require("../models/Template");
const audit_1 = require("../middleware/audit");
const schemas_1 = require("../validators/schemas");
const getTemplates = async (req, res) => {
    const doctorId = req.doctor?._id;
    if (!doctorId) {
        res.status(403).json({ success: false, message: 'Doctor scope required.' });
        return;
    }
    const templates = await Template_1.Template.find({ doctorId }).sort({ createdAt: -1 });
    res.json({ success: true, data: templates });
};
exports.getTemplates = getTemplates;
const createTemplate = async (req, res) => {
    const doctorId = req.doctor?._id;
    if (!doctorId) {
        res.status(403).json({ success: false, message: 'Doctor scope required.' });
        return;
    }
    const validated = schemas_1.TemplateSchema.parse(req.body);
    const template = await Template_1.Template.create({
        ...validated,
        doctorId,
    });
    await (0, audit_1.logAuditEvent)(req, {
        action: 'TEMPLATE_CREATE',
        resource: 'Template',
        resourceId: template._id.toString(),
        details: { name: template.name },
    });
    res.status(201).json({
        success: true,
        message: 'Prescription template saved successfully.',
        data: template,
    });
};
exports.createTemplate = createTemplate;
const updateTemplate = async (req, res) => {
    const doctorId = req.doctor?._id;
    const { id } = req.params;
    if (!doctorId) {
        res.status(403).json({ success: false, message: 'Doctor scope required.' });
        return;
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
        res.status(404).json({ success: false, message: 'Template not found.' });
        return;
    }
    const validated = schemas_1.TemplateSchema.parse(req.body);
    const template = await Template_1.Template.findOneAndUpdate({ _id: id, doctorId }, { $set: validated }, { new: true });
    if (!template) {
        res.status(404).json({ success: false, message: 'Template not found.' });
        return;
    }
    await (0, audit_1.logAuditEvent)(req, {
        action: 'TEMPLATE_UPDATE',
        resource: 'Template',
        resourceId: id,
        details: { name: template.name },
    });
    res.json({
        success: true,
        message: 'Template updated successfully.',
        data: template,
    });
};
exports.updateTemplate = updateTemplate;
const deleteTemplate = async (req, res) => {
    const doctorId = req.doctor?._id;
    const { id } = req.params;
    if (!doctorId) {
        res.status(403).json({ success: false, message: 'Doctor scope required.' });
        return;
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
        res.status(404).json({ success: false, message: 'Template not found.' });
        return;
    }
    const template = await Template_1.Template.findOneAndDelete({ _id: id, doctorId });
    if (!template) {
        res.status(404).json({ success: false, message: 'Template not found.' });
        return;
    }
    await (0, audit_1.logAuditEvent)(req, {
        action: 'TEMPLATE_DELETE',
        resource: 'Template',
        resourceId: id,
        details: { name: template.name },
    });
    res.json({
        success: true,
        message: 'Template deleted successfully.',
    });
};
exports.deleteTemplate = deleteTemplate;
