import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { ENV } from './config/env';

export const createApp = () => {
  const app = express();

  // Security Middleware
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allows flexible PDF and frontend embedding
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // CORS configuration
  app.use(
    cors({
      origin: (origin, callback) => {
        // Reflect incoming origin for full cross-origin compatibility
        callback(null, true);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    })
  );

  // Gzip/Deflate compression for fast JSON transmission
  app.use(compression());

  // Request Parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser(ENV.COOKIE_SECRET));

  // Request Logging
  if (ENV.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  // Rate Limiting on sensitive auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
      success: false,
      message: 'Too many requests, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
      errors: {},
    },
  });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);

  // Rate Limiting on password recovery endpoints
  const passwordResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: ENV.NODE_ENV === 'test' ? 1000 : 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Too many password recovery requests from this IP. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
      errors: {},
    },
  });
  app.use('/api/auth/forgot-password', passwordResetLimiter);
  app.use('/api/auth/verify-reset-otp', passwordResetLimiter);
  app.use('/api/auth/verify-otp', passwordResetLimiter);
  app.use('/api/auth/resend-reset-otp', passwordResetLimiter);
  app.use('/api/auth/resend-otp', passwordResetLimiter);
  app.use('/api/auth/reset-password', passwordResetLimiter);

  // Root & Health check endpoints
  app.get('/', (req, res) => {
    res.json({ status: 'ok', service: 'DocRx Prescription API', timestamp: new Date().toISOString() });
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // SMTP Email Health Diagnostic Endpoint
  app.get('/api/health/email-diagnostic', async (req, res) => {
    try {
      const { testSmtpDiagnostics } = await import('./services/email.service');
      const diagnostics = await testSmtpDiagnostics((req.query.to as string) || undefined);
      res.json(diagnostics);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });


  // Master API routes
  app.use('/api', routes);

  // 404 handler for undefined routes
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: `Route '${req.method} ${req.originalUrl}' not found.`,
      code: 'ROUTE_NOT_FOUND',
      errors: {},
    });
  });

  // Central Error Handler
  app.use(errorHandler);

  return app;
};
