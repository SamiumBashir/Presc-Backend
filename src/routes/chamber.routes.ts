import { Router } from 'express';
import {
  getChambers,
  createChamber,
  updateChamber,
  deleteChamber,
} from '../controllers/chamber.controller';
import { authenticate, requireDoctor } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticate, requireDoctor);

router.get('/', asyncHandler(getChambers));
router.post('/', asyncHandler(createChamber));
router.put('/:id', asyncHandler(updateChamber));
router.delete('/:id', asyncHandler(deleteChamber));

export default router;
