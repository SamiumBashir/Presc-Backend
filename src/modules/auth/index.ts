export * as authController from '../../controllers/auth.controller';
export { default as authRoutes } from '../../routes/auth.routes';
export {
  RegisterDoctorSchema,
  LoginSchema,
  ForgotPasswordSchema,
  VerifyOtpSchema,
  ResendOtpSchema,
  ResetPasswordSchema,
} from '../../validators/schemas';
