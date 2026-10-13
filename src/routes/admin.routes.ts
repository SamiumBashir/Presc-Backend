import { Router } from 'express';
import {
  getAdminStats,
  getAdminDoctors,
  updateDoctorStatus,
  getAuditLogs,
  getDoctorReports,
} from '../controllers/admin.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Doctor reports accessible to authenticated doctor
router.get('/reports', authenticate, asyncHandler(getDoctorReports));

// Admin-only endpoints
router.get('/stats', authenticate, requireRole(['admin']), asyncHandler(getAdminStats));
router.get('/doctors', authenticate, requireRole(['admin']), asyncHandler(getAdminDoctors));
router.put('/doctors/:doctorId/status', authenticate, requireRole(['admin']), asyncHandler(updateDoctorStatus));
router.get('/audit-logs', authenticate, requireRole(['admin']), asyncHandler(getAuditLogs));

export default router;
