import { Router } from 'express';
import {
  registerDoctor,
  login,
  getMe,
  logout,
  updateDoctorProfile,
  updateDoctorSettings,
  forgotPassword,
  verifyOtp,
  resendOtp,
  resetPassword,
  deleteAccount,
} from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post('/register', asyncHandler(registerDoctor));
router.post('/login', asyncHandler(login));
router.post('/forgot-password', asyncHandler(forgotPassword));
router.post('/verify-reset-otp', asyncHandler(verifyOtp));
router.post('/verify-otp', asyncHandler(verifyOtp));
router.post('/resend-reset-otp', asyncHandler(resendOtp));
router.post('/resend-otp', asyncHandler(resendOtp));
router.post('/reset-password', asyncHandler(resetPassword));
router.post('/reset-password/:token', asyncHandler(resetPassword));
router.get('/me', authenticate, asyncHandler(getMe));
router.get('/profile', authenticate, asyncHandler(getMe));
router.post('/logout', authenticate, asyncHandler(logout));
router.delete('/account', authenticate, asyncHandler(deleteAccount));
router.put('/profile', authenticate, asyncHandler(updateDoctorProfile));
router.put('/settings', authenticate, asyncHandler(updateDoctorSettings));

export default router;
