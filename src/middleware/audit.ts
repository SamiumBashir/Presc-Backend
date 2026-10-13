import { Request } from 'express';
import { AuditLog } from '../models/AuditLog';
import { AuthRequest } from './auth';

export interface AuditParams {
  action: string;
  resource: string;
  resourceId?: string;
  details?: any;
}

export const logAuditEvent = async (
  req: Request | AuthRequest,
  params: AuditParams
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    await AuditLog.create({
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
  } catch (error) {
    console.error('[AuditLog] Failed to log audit event:', error);
  }
};
