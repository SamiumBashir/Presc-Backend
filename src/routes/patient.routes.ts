import { Router } from 'express';
import {
  getPatients,
  getPatientById,
  createPatient,
  updatePatient,
  getPatientMedicalHistory,
} from '../controllers/patient.controller';
import { authenticate, requireDoctor } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticate, requireDoctor);

router.get('/', asyncHandler(getPatients));
router.post('/', asyncHandler(createPatient));
router.get('/:id', asyncHandler(getPatientById));
router.put('/:id', asyncHandler(updatePatient));
router.get('/:id/history', asyncHandler(getPatientMedicalHistory));

export default router;
