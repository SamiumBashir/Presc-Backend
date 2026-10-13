"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrescriptionByShareToken = exports.publicRoutes = void 0;
var public_routes_1 = require("../../routes/public.routes");
Object.defineProperty(exports, "publicRoutes", { enumerable: true, get: function () { return __importDefault(public_routes_1).default; } });
var prescription_controller_1 = require("../../controllers/prescription.controller");
Object.defineProperty(exports, "getPrescriptionByShareToken", { enumerable: true, get: function () { return prescription_controller_1.getPrescriptionByShareToken; } });
