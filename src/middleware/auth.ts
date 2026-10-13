import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';
import { User, IUser } from '../models/User';
import { Doctor, IDoctor } from '../models/Doctor';

export interface AuthRequest extends Request {
  user?: IUser;
  doctor?: IDoctor;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
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

    const decoded = jwt.verify(token, ENV.JWT_SECRET) as { id: string; role: string; iat?: number };
    const user = await User.findById(decoded.id);

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
      let doctor = await Doctor.findOne({ userId: user._id });
      if (!doctor) {
        doctor = await Doctor.create({
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
    } else if (user.role === 'admin') {
      const doctor = await Doctor.findOne({ userId: user._id });
      if (doctor) {
        req.doctor = doctor;
      }
    }

    next();
  } catch (err: any) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token.',
      code: 'INVALID_TOKEN',
      errors: {},
    });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
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

export const requireDoctor = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
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
