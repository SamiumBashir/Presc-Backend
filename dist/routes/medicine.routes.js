"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const os_1 = __importDefault(require("os"));
const medicine_controller_1 = require("../controllers/medicine.controller");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../utils/asyncHandler");
const upload = (0, multer_1.default)({ dest: os_1.default.tmpdir() });
const router = (0, express_1.Router)();
// Fast public/authenticated search autocomplete & catalogs
router.get('/search', (0, asyncHandler_1.asyncHandler)(medicine_controller_1.searchMedicines));
router.get('/types', (0, asyncHandler_1.asyncHandler)(medicine_controller_1.getMedicineTypes));
router.get('/', (0, asyncHandler_1.asyncHandler)(medicine_controller_1.getMedicines));
// Doctor favorite medicines
router.get('/favorites', auth_1.authenticate, auth_1.requireDoctor, (0, asyncHandler_1.asyncHandler)(medicine_controller_1.getFavoriteMedicines));
router.post('/favorites/:medicineId', auth_1.authenticate, auth_1.requireDoctor, (0, asyncHandler_1.asyncHandler)(medicine_controller_1.toggleFavoriteMedicine));
// Admin & Doctor creation
router.post('/', auth_1.authenticate, (0, auth_1.requireRole)(['admin', 'doctor']), (0, asyncHandler_1.asyncHandler)(medicine_controller_1.createMedicine));
router.put('/:id', auth_1.authenticate, (0, auth_1.requireRole)(['admin', 'doctor']), (0, asyncHandler_1.asyncHandler)(medicine_controller_1.updateMedicine));
router.delete('/:id', auth_1.authenticate, (0, auth_1.requireRole)(['admin']), (0, asyncHandler_1.asyncHandler)(medicine_controller_1.deleteMedicine));
router.post('/import-csv', auth_1.authenticate, (0, auth_1.requireRole)(['admin']), upload.single('file'), (0, asyncHandler_1.asyncHandler)(medicine_controller_1.importMedicinesCsv));
exports.default = router;
