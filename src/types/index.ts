import { Request } from 'express';

export interface JwtPayload {
  userId: string;
  email: string;
  role: 'doctor' | 'admin' | 'staff';
}

export interface AuthenticatedUser {
  _id: any;
  email: string;
  role: 'doctor' | 'admin' | 'staff';
  status?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  code?: string;
  errors?: Record<string, string> | any[];
}
