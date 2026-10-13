"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAuditEvent = void 0;
const AuditLog_1 = require("../models/AuditLog");
const logAuditEvent = async (req, params) => {
    try {
        const authReq = req;
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'];
        await AuditLog_1.AuditLog.create({
            userId: authReq.user?._id,
            userName: authReq.user?.name || 'Anonymous',
            userRole: authReq.user?.role || 'guest',
            action: params.action,
            resource: params.resource,
            resourceId: params.resourceId,
            details: params.details,
            ipAddress: Array.isArray(ip) ? ip[0] : ip,
            userAgent,
        });
    }
    catch (error) {
        console.error('[AuditLog] Failed to log audit event:', error);
    }
};
exports.logAuditEvent = logAuditEvent;
