import { Router } from 'express';
import { getPrescriptionByShareToken } from '../controllers/prescription.controller';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/prescriptions/share/:token', asyncHandler(getPrescriptionByShareToken));

export default router;
