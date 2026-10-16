"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = void 0;
const app_1 = require("./app");
const db_1 = require("./config/db");
const env_1 = require("./config/env");
const seed_1 = require("./seeds/seed");
const email_service_1 = require("./services/email.service");
process.on('unhandledRejection', (reason) => {
    console.error('[Unhandled Rejection]', reason);
});
process.on('uncaughtException', (error) => {
    console.error('[Uncaught Exception]', error);
});
const startServer = async () => {
    try {
        const app = (0, app_1.createApp)();
        const port = Number(process.env.PORT) || Number(env_1.ENV.PORT) || 5000;
        const server = app.listen(port, '0.0.0.0', () => {
            console.log(`[DocRx Backend] Standalone server active and listening on port ${port}`);
            console.log(`[DocRx Backend] Health check: http://localhost:${port}/api/health`);
        });
        server.on('error', (err) => {
            console.error(`[DocRx Backend] Server error:`, err.message);
        });
        // Non-blocking email provider diagnostics check on startup
        (0, email_service_1.verifyEmailConfiguration)().catch((mailErr) => {
            console.warn('[DocRx Backend] Email configuration verification warning:', mailErr.message);
        });
        // Connect database and seed in background without blocking port binding
        (0, db_1.connectDatabase)()
            .then(async () => {
            try {
                await (0, seed_1.seedDatabase)(false);
            }
            catch (seedErr) {
                console.error('[DocRx Backend] Auto-seed warning:', seedErr);
            }
        })
            .catch((dbErr) => {
            console.error('[DocRx Backend] Database initial connection error:', dbErr.message);
        });
    }
    catch (error) {
        console.error('[DocRx Backend] Server startup failed:', error);
        process.exit(1);
    }
};
exports.startServer = startServer;
if (!process.env.VERCEL) {
    startServer();
}
