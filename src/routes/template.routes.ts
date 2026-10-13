import { Router } from 'express';
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../controllers/template.controller';
import { authenticate, requireDoctor } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticate, requireDoctor);

router.get('/', asyncHandler(getTemplates));
router.post('/', asyncHandler(createTemplate));
router.put('/:id', asyncHandler(updateTemplate));
router.delete('/:id', asyncHandler(deleteTemplate));

export default router;
