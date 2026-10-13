"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.importMedicinesCsv = exports.deleteMedicine = exports.updateMedicine = exports.createMedicine = exports.toggleFavoriteMedicine = exports.getFavoriteMedicines = exports.getMedicineTypes = exports.getMedicines = exports.searchMedicines = exports.clearMedicineFacetCache = void 0;
const fs_1 = __importDefault(require("fs"));
const mongoose_1 = __importDefault(require("mongoose"));
const csv_parser_1 = __importDefault(require("csv-parser"));
const Medicine_1 = require("../models/Medicine");
const Doctor_1 = require("../models/Doctor");
const audit_1 = require("../middleware/audit");
const schemas_1 = require("../validators/schemas");
const facetCache = new Map();
const FACET_TTL_MS = 10 * 60 * 1000; // 10 minutes
const clearMedicineFacetCache = () => {
    facetCache.clear();
};
exports.clearMedicineFacetCache = clearMedicineFacetCache;
const getCachedFacets = async (medicineType) => {
    const cacheKey = medicineType && medicineType !== 'all' ? medicineType : 'all';
    const cached = facetCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.timestamp < FACET_TTL_MS) {
        return cached.data;
    }
    const filter = medicineType && medicineType !== 'all' ? { medicineType } : {};
    const [categories, dosageForms, manufacturers, medicineTypes] = await Promise.all([
        Medicine_1.Medicine.distinct('category', filter),
        Medicine_1.Medicine.distinct('dosageForm', filter),
        Medicine_1.Medicine.distinct('manufacturer', filter),
        Medicine_1.Medicine.distinct('medicineType'),
    ]);
    const facetData = {
        categories,
        dosageForms,
        manufacturers,
        medicineTypes: medicineTypes.length > 0 ? medicineTypes : ['Allopathic', 'Unani', 'Ayurvedic', 'Herbal'],
    };
    facetCache.set(cacheKey, { timestamp: now, data: facetData });
    return facetData;
};
const searchMedicines = async (req, res) => {
    const { q = '', limit = '15', medicineType } = req.query;
    const queryStr = q.trim();
    const limitNum = Math.min(parseInt(limit, 10) || 15, 50);
    const baseFilter = { status: 'active' };
    if (medicineType && medicineType !== 'all') {
        baseFilter.medicineType = medicineType;
    }
    const selectFields = 'brandName genericName strength dosageForm manufacturer category medicineType unit price status';
    if (!queryStr) {
        // Return top popular medicines for system
        const medicines = await Medicine_1.Medicine.find(baseFilter)
            .limit(limitNum)
            .sort({ brandName: 1 })
            .select(selectFields)
            .lean();
        res.json({ success: true, data: medicines });
        return;
    }
    // Regex prefix matching on brandName and genericName for instant responsive autocomplete
    const regex = new RegExp(`^${queryStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    const containsRegex = new RegExp(queryStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const [exactPrefixMatches, generalMatches] = await Promise.all([
        Medicine_1.Medicine.find({
            ...baseFilter,
            $or: [{ brandName: regex }, { genericName: regex }],
        })
            .limit(limitNum)
            .select(selectFields)
            .lean(),
        Medicine_1.Medicine.find({
            ...baseFilter,
            $or: [
                { brandName: containsRegex },
                { genericName: containsRegex },
                { manufacturer: containsRegex },
                { category: containsRegex },
            ],
        })
            .limit(limitNum)
            .select(selectFields)
            .lean(),
    ]);
    // Combine and deduplicate
    const seen = new Set();
    const combined = [...exactPrefixMatches, ...generalMatches].filter((item) => {
        const id = item._id.toString();
        if (seen.has(id))
            return false;
        seen.add(id);
        return true;
    }).slice(0, limitNum);
    res.json({
        success: true,
        data: combined,
    });
};
exports.searchMedicines = searchMedicines;
const getMedicines = async (req, res) => {
    const { search, category, dosageForm, manufacturer, medicineType, page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;
    const query = {};
    if (search && typeof search === 'string' && search.trim() !== '') {
        const sRegex = new RegExp(search.trim(), 'i');
        query.$or = [
            { brandName: sRegex },
            { genericName: sRegex },
            { manufacturer: sRegex },
            { category: sRegex },
        ];
    }
    if (medicineType && medicineType !== 'all') {
        query.medicineType = medicineType;
    }
    if (category && category !== 'all') {
        query.category = category;
    }
    if (dosageForm && dosageForm !== 'all') {
        query.dosageForm = dosageForm;
    }
    if (manufacturer && manufacturer !== 'all') {
        query.manufacturer = manufacturer;
    }
    const [queryResult, facetData] = await Promise.all([
        Promise.all([
            Medicine_1.Medicine.find(query).sort({ brandName: 1 }).skip(skip).limit(limitNum).lean(),
            Medicine_1.Medicine.countDocuments(query),
        ]),
        getCachedFacets(medicineType),
    ]);
    const [medicines, total] = queryResult;
    const { categories, dosageForms, manufacturers, medicineTypes } = facetData;
    res.json({
        success: true,
        data: {
            medicines,
            categories,
            dosageForms,
            manufacturers,
            medicineTypes,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        },
    });
};
exports.getMedicines = getMedicines;
const getMedicineTypes = async (_req, res) => {
    const counts = await Medicine_1.Medicine.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: '$medicineType', count: { $sum: 1 } } },
    ]);
    const systems = [
        { type: 'Allopathic', nameEn: 'Allopathic', nameBn: 'অ্যালোপ্যাথিক', description: 'Conventional Modern Pharmaceuticals' },
        { type: 'Unani', nameEn: 'Unani Medicine', nameBn: 'ইউনানি চিকিৎসা', description: 'Tibb-e-Unani Herbal & Traditional Formulations' },
        { type: 'Ayurvedic', nameEn: 'Ayurvedic Medicine', nameBn: 'আয়ুর্বেদিক চিকিৎসা', description: 'Classical Ayurvedic & Botanical Remedies' },
        { type: 'Herbal', nameEn: 'Herbal & Natural', nameBn: 'হারবাল ও ভেষজ', description: 'Standardized Botanical Formulations' },
    ].map((sys) => {
        const found = counts.find((c) => c._id === sys.type);
        return { ...sys, count: found ? found.count : 0 };
    });
    res.json({
        success: true,
        data: systems,
    });
};
exports.getMedicineTypes = getMedicineTypes;
const getFavoriteMedicines = async (req, res) => {
    if (!req.doctor) {
        res.status(403).json({ success: false, message: 'Doctor scope required.' });
        return;
    }
    const doctor = await Doctor_1.Doctor.findById(req.doctor._id).populate('favoriteMedicines');
    res.json({
        success: true,
        data: doctor?.favoriteMedicines || [],
    });
};
exports.getFavoriteMedicines = getFavoriteMedicines;
const toggleFavoriteMedicine = async (req, res) => {
    if (!req.doctor) {
        res.status(403).json({ success: false, message: 'Doctor scope required.' });
        return;
    }
    const { medicineId } = req.params;
    const doctor = req.doctor;
    if (!mongoose_1.default.Types.ObjectId.isValid(medicineId)) {
        res.status(404).json({ success: false, message: 'Medicine not found.' });
        return;
    }
    const index = doctor.favoriteMedicines.findIndex((id) => id.toString() === medicineId);
    let isFavorite = false;
    if (index > -1) {
        doctor.favoriteMedicines.splice(index, 1);
        isFavorite = false;
    }
    else {
        doctor.favoriteMedicines.push(medicineId);
        isFavorite = true;
    }
    await doctor.save();
    res.json({
        success: true,
        message: isFavorite ? 'Medicine marked as favorite.' : 'Medicine removed from favorites.',
        data: { isFavorite, favoriteMedicines: doctor.favoriteMedicines },
    });
};
exports.toggleFavoriteMedicine = toggleFavoriteMedicine;
const createMedicine = async (req, res) => {
    const normalized = {
        brandName: req.body.brandName?.trim(),
        genericName: req.body.genericName?.trim(),
        strength: req.body.strength?.trim(),
        dosageForm: (req.body.dosageForm || req.body.form || 'Tablet').trim(),
        manufacturer: (req.body.manufacturer || req.body.manufacture || 'General').trim(),
        category: (req.body.category || 'General').trim(),
        medicineType: req.body.medicineType || req.body.type || 'Allopathic',
        unit: req.body.unit?.trim() || 'mg',
        price: req.body.price ? Number(req.body.price) : undefined,
        status: req.body.status || 'active',
    };
    const validated = schemas_1.MedicineSchema.parse(normalized);
    const medicine = await Medicine_1.Medicine.create({
        brandName: validated.brandName,
        genericName: validated.genericName,
        strength: validated.strength,
        dosageForm: validated.dosageForm || validated.form || 'Tablet',
        manufacturer: validated.manufacturer || validated.manufacture || 'General',
        category: validated.category || 'General',
        medicineType: validated.medicineType || validated.type || 'Allopathic',
        unit: validated.unit || 'mg',
        price: validated.price,
        status: validated.status || 'active',
    });
    await (0, audit_1.logAuditEvent)(req, {
        action: 'MEDICINE_CREATE',
        resource: 'Medicine',
        resourceId: medicine._id.toString(),
        details: { brandName: medicine.brandName, genericName: medicine.genericName, medicineType: medicine.medicineType },
    });
    (0, exports.clearMedicineFacetCache)();
    res.status(201).json({
        success: true,
        message: 'Medicine added to database successfully.',
        data: medicine,
    });
};
exports.createMedicine = createMedicine;
const updateMedicine = async (req, res) => {
    const { id } = req.params;
    if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
        res.status(404).json({ success: false, message: 'Medicine not found.' });
        return;
    }
    const normalized = {
        brandName: req.body.brandName?.trim(),
        genericName: req.body.genericName?.trim(),
        strength: req.body.strength?.trim(),
        dosageForm: (req.body.dosageForm || req.body.form || 'Tablet').trim(),
        manufacturer: (req.body.manufacturer || req.body.manufacture || 'General').trim(),
        category: (req.body.category || 'General').trim(),
        medicineType: req.body.medicineType || req.body.type || 'Allopathic',
        unit: req.body.unit?.trim() || 'mg',
        price: req.body.price ? Number(req.body.price) : undefined,
        status: req.body.status || 'active',
    };
    const validated = schemas_1.MedicineSchema.parse(normalized);
    const medicine = await Medicine_1.Medicine.findByIdAndUpdate(id, {
        $set: {
            brandName: validated.brandName,
            genericName: validated.genericName,
            strength: validated.strength,
            dosageForm: validated.dosageForm || validated.form || 'Tablet',
            manufacturer: validated.manufacturer || validated.manufacture || 'General',
            category: validated.category || 'General',
            medicineType: validated.medicineType || validated.type || 'Allopathic',
            unit: validated.unit || 'mg',
            price: validated.price,
            status: validated.status || 'active',
        },
    }, { new: true });
    if (!medicine) {
        res.status(404).json({ success: false, message: 'Medicine not found.' });
        return;
    }
    await (0, audit_1.logAuditEvent)(req, {
        action: 'MEDICINE_UPDATE',
        resource: 'Medicine',
        resourceId: medicine._id.toString(),
    });
    res.json({
        success: true,
        message: 'Medicine updated successfully.',
        data: medicine,
    });
};
exports.updateMedicine = updateMedicine;
const deleteMedicine = async (req, res) => {
    const { id } = req.params;
    if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
        res.status(404).json({ success: false, message: 'Medicine not found.' });
        return;
    }
    const medicine = await Medicine_1.Medicine.findByIdAndDelete(id);
    if (!medicine) {
        res.status(404).json({ success: false, message: 'Medicine not found.' });
        return;
    }
    // Remove deleted medicine from any doctor favorite lists
    await Doctor_1.Doctor.updateMany({ favoriteMedicines: id }, { $pull: { favoriteMedicines: id } });
    await (0, audit_1.logAuditEvent)(req, {
        action: 'MEDICINE_DELETE',
        resource: 'Medicine',
        resourceId: id,
        details: { brandName: medicine.brandName },
    });
    res.json({
        success: true,
        message: 'Medicine deleted successfully.',
    });
};
exports.deleteMedicine = deleteMedicine;
const importMedicinesCsv = async (req, res) => {
    if (!req.file) {
        res.status(400).json({ success: false, message: 'Please upload a CSV file.' });
        return;
    }
    const results = [];
    const filePath = req.file.path;
    fs_1.default.createReadStream(filePath)
        .pipe((0, csv_parser_1.default)())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
        try {
            let importedCount = 0;
            const operations = [];
            for (const row of results) {
                const brandName = (row.brandName || row['Brand Name'] || row.brand || '').trim();
                const genericName = (row.genericName || row['Generic Name'] || row.generic || '').trim();
                const strength = (row.strength || row['Strength'] || '').trim();
                const dosageForm = (row.dosageForm || row['Dosage Form'] || row.form || 'Tablet').trim();
                const manufacturer = (row.manufacturer || row['Manufacturer'] || row.company || 'Generic').trim();
                const category = (row.category || row['Category'] || 'General').trim();
                const medicineType = (row.medicineType || row['Medicine Type'] || row.system || 'Allopathic').trim();
                const validMedicineType = ['Allopathic', 'Unani', 'Ayurvedic', 'Herbal'].includes(medicineType)
                    ? medicineType
                    : 'Allopathic';
                const finalStrength = strength || 'N/A';
                if (brandName && genericName) {
                    operations.push({
                        updateOne: {
                            filter: { brandName, genericName, strength: finalStrength },
                            update: {
                                $set: {
                                    brandName,
                                    genericName,
                                    strength: finalStrength,
                                    dosageForm: dosageForm || 'Tablet',
                                    manufacturer,
                                    category,
                                    medicineType: validMedicineType,
                                    status: 'active',
                                },
                            },
                            upsert: true,
                        },
                    });
                    importedCount++;
                }
            }
            if (operations.length > 0) {
                await Medicine_1.Medicine.bulkWrite(operations);
            }
            // Clean up temp upload file
            fs_1.default.unlink(filePath, () => { });
            await (0, audit_1.logAuditEvent)(req, {
                action: 'MEDICINE_CSV_IMPORT',
                resource: 'Medicine',
                details: { importedCount, totalRows: results.length },
            });
            (0, exports.clearMedicineFacetCache)();
            res.json({
                success: true,
                message: `Successfully processed ${importedCount} medicines from CSV.`,
                data: { importedCount },
            });
        }
        catch (err) {
            fs_1.default.unlink(filePath, () => { });
            res.status(500).json({ success: false, message: `CSV import failed: ${err.message}` });
        }
    })
        .on('error', (err) => {
        fs_1.default.unlink(filePath, () => { });
        res.status(500).json({ success: false, message: `CSV read error: ${err.message}` });
    });
};
exports.importMedicinesCsv = importMedicinesCsv;
