import { Request, Response } from 'express';
import fs from 'fs';
import mongoose from 'mongoose';
import csvParser from 'csv-parser';
import { Medicine } from '../models/Medicine';
import { Doctor } from '../models/Doctor';
import { AuthRequest } from '../middleware/auth';
import { logAuditEvent } from '../middleware/audit';
import { MedicineSchema } from '../validators/schemas';

interface FacetCache {
  timestamp: number;
  data: {
    categories: string[];
    dosageForms: string[];
    manufacturers: string[];
    medicineTypes: string[];
  };
}

const facetCache = new Map<string, FacetCache>();
const FACET_TTL_MS = 10 * 60 * 1000; // 10 minutes

export const clearMedicineFacetCache = () => {
  facetCache.clear();
};

const getCachedFacets = async (medicineType?: string) => {
  const cacheKey = medicineType && medicineType !== 'all' ? medicineType : 'all';
  const cached = facetCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < FACET_TTL_MS) {
    return cached.data;
  }

  const filter = medicineType && medicineType !== 'all' ? { medicineType } : {};
  const [categories, dosageForms, manufacturers, medicineTypes] = await Promise.all([
    Medicine.distinct('category', filter),
    Medicine.distinct('dosageForm', filter),
    Medicine.distinct('manufacturer', filter),
    Medicine.distinct('medicineType'),
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

export const searchMedicines = async (req: Request, res: Response): Promise<void> => {
  const { q = '', limit = '15', medicineType } = req.query;
  const queryStr = (q as string).trim();
  const limitNum = Math.min(parseInt(limit as string, 10) || 15, 50);

  const baseFilter: any = { status: 'active' };
  if (medicineType && medicineType !== 'all') {
    baseFilter.medicineType = medicineType;
  }

  const selectFields = 'brandName genericName strength dosageForm manufacturer category medicineType unit price status';

  if (!queryStr) {
    // Return top popular medicines for system
    const medicines = await Medicine.find(baseFilter)
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
    Medicine.find({
      ...baseFilter,
      $or: [{ brandName: regex }, { genericName: regex }],
    })
      .limit(limitNum)
      .select(selectFields)
      .lean(),
    Medicine.find({
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
  const seen = new Set<string>();
  const combined = [...exactPrefixMatches, ...generalMatches].filter((item) => {
    const id = item._id.toString();
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, limitNum);

  res.json({
    success: true,
    data: combined,
  });
};

export const getMedicines = async (req: Request, res: Response): Promise<void> => {
  const { search, category, dosageForm, manufacturer, medicineType, page = '1', limit = '20' } = req.query;
  const pageNum = parseInt(page as string, 10) || 1;
  const limitNum = parseInt(limit as string, 10) || 20;
  const skip = (pageNum - 1) * limitNum;

  const query: any = {};

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
      Medicine.find(query).sort({ brandName: 1 }).skip(skip).limit(limitNum).lean(),
      Medicine.countDocuments(query),
    ]),
    getCachedFacets(medicineType as string),
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

export const getMedicineTypes = async (_req: Request, res: Response): Promise<void> => {
  const counts = await Medicine.aggregate([
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

export const getFavoriteMedicines = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.doctor) {
    res.status(403).json({ success: false, message: 'Doctor scope required.' });
    return;
  }

  const doctor = await Doctor.findById(req.doctor._id).populate('favoriteMedicines');
  res.json({
    success: true,
    data: doctor?.favoriteMedicines || [],
  });
};

export const toggleFavoriteMedicine = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.doctor) {
    res.status(403).json({ success: false, message: 'Doctor scope required.' });
    return;
  }

  const { medicineId } = req.params;
  const doctor = req.doctor;

  if (!mongoose.Types.ObjectId.isValid(medicineId)) {
    res.status(404).json({ success: false, message: 'Medicine not found.' });
    return;
  }

  const index = doctor.favoriteMedicines.findIndex((id) => id.toString() === medicineId);
  let isFavorite = false;

  if (index > -1) {
    doctor.favoriteMedicines.splice(index, 1);
    isFavorite = false;
  } else {
    doctor.favoriteMedicines.push(medicineId as any);
    isFavorite = true;
  }

  await doctor.save();

  res.json({
    success: true,
    message: isFavorite ? 'Medicine marked as favorite.' : 'Medicine removed from favorites.',
    data: { isFavorite, favoriteMedicines: doctor.favoriteMedicines },
  });
};

export const createMedicine = async (req: AuthRequest, res: Response): Promise<void> => {
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

  const validated = MedicineSchema.parse(normalized);

  const medicine = await Medicine.create({
    brandName: validated.brandName,
    genericName: validated.genericName,
    strength: validated.strength,
    dosageForm: validated.dosageForm || (validated as any).form || 'Tablet',
    manufacturer: validated.manufacturer || (validated as any).manufacture || 'General',
    category: validated.category || 'General',
    medicineType: validated.medicineType || (validated as any).type || 'Allopathic',
    unit: validated.unit || 'mg',
    price: validated.price,
    status: validated.status || 'active',
  });

  await logAuditEvent(req, {
    action: 'MEDICINE_CREATE',
    resource: 'Medicine',
    resourceId: medicine._id.toString(),
    details: { brandName: medicine.brandName, genericName: medicine.genericName, medicineType: medicine.medicineType },
  });

  clearMedicineFacetCache();

  res.status(201).json({
    success: true,
    message: 'Medicine added to database successfully.',
    data: medicine,
  });
};

export const updateMedicine = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
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

  const validated = MedicineSchema.parse(normalized);

  const medicine = await Medicine.findByIdAndUpdate(
    id,
    {
      $set: {
        brandName: validated.brandName,
        genericName: validated.genericName,
        strength: validated.strength,
        dosageForm: validated.dosageForm || (validated as any).form || 'Tablet',
        manufacturer: validated.manufacturer || (validated as any).manufacture || 'General',
        category: validated.category || 'General',
        medicineType: validated.medicineType || (validated as any).type || 'Allopathic',
        unit: validated.unit || 'mg',
        price: validated.price,
        status: validated.status || 'active',
      },
    },
    { new: true }
  );

  if (!medicine) {
    res.status(404).json({ success: false, message: 'Medicine not found.' });
    return;
  }

  await logAuditEvent(req, {
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

export const deleteMedicine = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(404).json({ success: false, message: 'Medicine not found.' });
    return;
  }

  const medicine = await Medicine.findByIdAndDelete(id);
  if (!medicine) {
    res.status(404).json({ success: false, message: 'Medicine not found.' });
    return;
  }

  // Remove deleted medicine from any doctor favorite lists
  await Doctor.updateMany({ favoriteMedicines: id }, { $pull: { favoriteMedicines: id } });

  await logAuditEvent(req, {
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

export const importMedicinesCsv = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'Please upload a CSV file.' });
    return;
  }

  const results: any[] = [];
  const filePath = req.file.path;

  fs.createReadStream(filePath)
    .pipe(csvParser())
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
            ? (medicineType as 'Allopathic' | 'Unani' | 'Ayurvedic' | 'Herbal')
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
                    status: 'active' as const,
                  },
                },
                upsert: true,
              },
            });
            importedCount++;
          }
        }

        if (operations.length > 0) {
          await Medicine.bulkWrite(operations);
        }

        // Clean up temp upload file
        fs.unlink(filePath, () => {});

        await logAuditEvent(req, {
          action: 'MEDICINE_CSV_IMPORT',
          resource: 'Medicine',
          details: { importedCount, totalRows: results.length },
        });

        clearMedicineFacetCache();

        res.json({
          success: true,
          message: `Successfully processed ${importedCount} medicines from CSV.`,
          data: { importedCount },
        });
      } catch (err: any) {
        fs.unlink(filePath, () => {});
        res.status(500).json({ success: false, message: `CSV import failed: ${err.message}` });
      }
    })
    .on('error', (err) => {
      fs.unlink(filePath, () => {});
      res.status(500).json({ success: false, message: `CSV read error: ${err.message}` });
    });
};
