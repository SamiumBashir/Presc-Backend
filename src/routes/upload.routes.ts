import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { uploadSignature } from '../controllers/upload.controller';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (PNG, JPG, JPEG, WEBP) are allowed.'));
    }
  },
});

router.post('/signature', authenticate, upload.single('signature'), asyncHandler(uploadSignature));

export default router;
