"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = exports.createApp = void 0;
const express_1 = __importDefault(require("express"));
const compression_1 = __importDefault(require("compression"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const routes_1 = __importDefault(require("./routes"));
const errorHandler_1 = require("./middleware/errorHandler");
const env_1 = require("./config/env");
const db_1 = require("./config/db");
const email_service_1 = require("./services/email.service");
const createApp = () => {
    const app = (0, express_1.default)();
    // Trust first proxy hop (Vercel, Cloudflare, etc.) to accurately extract client IP in serverless
    app.set('trust proxy', 1);
    // Security Middleware
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: false, // Allows flexible PDF and frontend embedding
        crossOriginResourcePolicy: { policy: 'cross-origin' },
    }));
    // CORS configuration
    app.use((0, cors_1.default)({
        origin: (origin, callback) => {
            // Reflect incoming origin for full cross-origin compatibility
            callback(null, true);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    }));
    // Gzip/Deflate compression for fast JSON transmission
    app.use((0, compression_1.default)());
    // Request Parsers
    app.use(express_1.default.json({ limit: '10mb' }));
    app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
    app.use((0, cookie_parser_1.default)(env_1.ENV.COOKIE_SECRET));
    // Request Logging
    if (env_1.ENV.NODE_ENV !== 'test') {
        app.use((0, morgan_1.default)('dev'));
    }
    // Rate Limiting on sensitive auth endpoints
    const authLimiter = (0, express_rate_limit_1.default)({
        windowMs: 15 * 60 * 1000,
        max: 100,
        validate: { xForwardedForHeader: false },
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
    const passwordResetLimiter = (0, express_rate_limit_1.default)({
        windowMs: 15 * 60 * 1000,
        max: env_1.ENV.NODE_ENV === 'test' ? 1000 : 30,
        standardHeaders: true,
        legacyHeaders: false,
        validate: { xForwardedForHeader: false },
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
    // Database connection assurance for serverless and traditional invocations
    app.use(async (req, res, next) => {
        // Health check and root route can respond immediately without blocking
        if (req.path === '/' || req.path === '/api/health') {
            return next();
        }
        try {
            await (0, db_1.connectDatabase)();
            next();
        }
        catch (err) {
            console.error('[Database Middleware] Connection error:', err.message);
            res.status(503).json({
                success: false,
                message: 'Database service is temporarily unavailable. Please try again in a few moments.',
                code: 'DATABASE_UNAVAILABLE',
                errors: {},
            });
        }
    });
    // Root & Health check endpoints
    app.get('/', (req, res) => {
        res.json({
            status: 'ok',
            service: 'DocRx Prescription API',
            serverless: Boolean(process.env.VERCEL),
            timestamp: new Date().toISOString(),
        });
    });
    app.get('/api/health', (req, res) => {
        const isDbConnected = (0, db_1.isDatabaseConnected)();
        res.json({
            status: 'ok',
            database: isDbConnected ? 'connected' : 'disconnected',
            serverless: Boolean(process.env.VERCEL),
            timestamp: new Date().toISOString(),
        });
    });
    // SMTP Email Health Diagnostic Endpoint
    app.get('/api/health/email-diagnostic', async (req, res) => {
        try {
            const diagnostics = await (0, email_service_1.testSmtpDiagnostics)(req.query.to || undefined);
            res.json(diagnostics);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // Master API routes mounted at canonical /api
    app.use('/api', routes_1.default);
    // Fallback mount for environments where /api is stripped by an edge rewrite
    app.use('/', routes_1.default);
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
    app.use(errorHandler_1.errorHandler);
    return app;
};
exports.createApp = createApp;
const defaultApp = (0, exports.createApp)();
const handler = (req, res) => defaultApp(req, res);
exports.handler = handler;
exports.default = defaultApp;
// Support both CommonJS require() and ESM import for Vercel Serverless Function compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Object.assign(defaultApp, {
        createApp: exports.createApp,
        handler: exports.handler,
        default: defaultApp,
    });
}
