import { Router } from 'express';
import multer from 'multer';
import os from 'os';
import {
  searchMedicines,
  getMedicines,
  getMedicineTypes,
  getFavoriteMedicines,
  toggleFavoriteMedicine,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  importMedicinesCsv,
} from '../controllers/medicine.controller';
import { authenticate, requireRole, requireDoctor } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const upload = multer({ dest: os.tmpdir() });
const router = Router();

// Fast public/authenticated search autocomplete & catalogs
router.get('/search', asyncHandler(searchMedicines));
router.get('/types', asyncHandler(getMedicineTypes));
router.get('/', asyncHandler(getMedicines));

// Doctor favorite medicines
router.get('/favorites', authenticate, requireDoctor, asyncHandler(getFavoriteMedicines));
router.post('/favorites/:medicineId', authenticate, requireDoctor, asyncHandler(toggleFavoriteMedicine));

// Admin & Doctor creation
router.post('/', authenticate, requireRole(['admin', 'doctor']), asyncHandler(createMedicine));
router.put('/:id', authenticate, requireRole(['admin', 'doctor']), asyncHandler(updateMedicine));
router.delete('/:id', authenticate, requireRole(['admin']), asyncHandler(deleteMedicine));
router.post('/import-csv', authenticate, requireRole(['admin']), upload.single('file'), asyncHandler(importMedicinesCsv));

export default router;
