"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prescription_controller_1 = require("../controllers/prescription.controller");
const asyncHandler_1 = require("../utils/asyncHandler");
const router = (0, express_1.Router)();
router.get('/prescriptions/share/:token', (0, asyncHandler_1.asyncHandler)(prescription_controller_1.getPrescriptionByShareToken));
exports.default = router;
