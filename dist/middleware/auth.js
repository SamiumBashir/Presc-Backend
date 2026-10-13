"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireDoctor = exports.requireRole = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const User_1 = require("../models/User");
const Doctor_1 = require("../models/Doctor");
const authenticate = async (req, res, next) => {
    try {
        let token = req.cookies?.token;
        if (!token && req.headers.authorization?.startsWith('Bearer ')) {
            token = req.headers.authorization.split(' ')[1];
        }
        if (!token) {
            res.status(401).json({
                success: false,
                message: 'Authentication required. Please log in.',
                code: 'UNAUTHORIZED',
                errors: {},
            });
            return;
        }
        const decoded = jsonwebtoken_1.default.verify(token, env_1.ENV.JWT_SECRET);
        const user = await User_1.User.findById(decoded.id);
        if (!user || user.status !== 'active') {
            res.status(401).json({
                success: false,
                message: 'User account not found or suspended.',
                code: 'ACCOUNT_INACTIVE',
                errors: {},
            });
            return;
        }
        // Invalidate sessions issued before password was reset
        if (decoded.iat && user.passwordChangedAt) {
            const changedTimestamp = Math.floor(user.passwordChangedAt.getTime() / 1000);
            if (changedTimestamp > decoded.iat) {
                res.status(401).json({
                    success: false,
                    message: 'Password was recently changed. Please log in again with your new credentials.',
                    code: 'SESSION_REVOKED',
                    errors: {},
                });
                return;
            }
        }
        req.user = user;
        if (user.role === 'doctor') {
            let doctor = await Doctor_1.Doctor.findOne({ userId: user._id });
            if (!doctor) {
                doctor = await Doctor_1.Doctor.create({
                    userId: user._id,
                    name: user.name,
                    email: user.email,
                    bmdcNumber: 'A-PENDING',
                    qualification: 'MBBS',
                    specialization: 'General Physician',
                    status: 'approved',
                });
            }
            req.doctor = doctor;
        }
        else if (user.role === 'admin') {
            const doctor = await Doctor_1.Doctor.findOne({ userId: user._id });
            if (doctor) {
                req.doctor = doctor;
            }
        }
        next();
    }
    catch (err) {
        res.status(401).json({
            success: false,
            message: 'Invalid or expired token.',
            code: 'INVALID_TOKEN',
            errors: {},
        });
    }
};
exports.authenticate = authenticate;
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user || (!roles.includes(req.user.role) && req.user.role !== 'admin')) {
            res.status(403).json({
                success: false,
                message: 'Forbidden: You do not have permission to perform this action.',
                code: 'FORBIDDEN',
                errors: {},
            });
            return;
        }
        next();
    };
};
exports.requireRole = requireRole;
const requireDoctor = (req, res, next) => {
    if (!req.user) {
        res.status(401).json({
            success: false,
            message: 'Authentication required. Please log in.',
            code: 'UNAUTHORIZED',
            errors: {},
        });
        return;
    }
    if (req.user.role === 'admin') {
        next();
        return;
    }
    if (req.user.role !== 'doctor' || !req.doctor) {
        res.status(403).json({
            success: false,
            message: 'Access restricted to authorized doctors only.',
            code: 'FORBIDDEN',
            errors: {},
        });
        return;
    }
    next();
};
exports.requireDoctor = requireDoctor;
