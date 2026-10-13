"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const admin_controller_1 = require("../controllers/admin.controller");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../utils/asyncHandler");
const router = (0, express_1.Router)();
// Doctor reports accessible to authenticated doctor
router.get('/reports', auth_1.authenticate, (0, asyncHandler_1.asyncHandler)(admin_controller_1.getDoctorReports));
// Admin-only endpoints
router.get('/stats', auth_1.authenticate, (0, auth_1.requireRole)(['admin']), (0, asyncHandler_1.asyncHandler)(admin_controller_1.getAdminStats));
router.get('/doctors', auth_1.authenticate, (0, auth_1.requireRole)(['admin']), (0, asyncHandler_1.asyncHandler)(admin_controller_1.getAdminDoctors));
router.put('/doctors/:doctorId/status', auth_1.authenticate, (0, auth_1.requireRole)(['admin']), (0, asyncHandler_1.asyncHandler)(admin_controller_1.updateDoctorStatus));
router.get('/audit-logs', auth_1.authenticate, (0, auth_1.requireRole)(['admin']), (0, asyncHandler_1.asyncHandler)(admin_controller_1.getAuditLogs));
exports.default = router;
