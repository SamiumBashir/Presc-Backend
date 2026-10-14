"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
        // Multi-port binding: listen on PORT (from env), 5000, and 8080 simultaneously
        // This guarantees Railway public router always connects regardless of target port setting
        const targetPorts = Array.from(new Set([port, 5000, 8080]));
        targetPorts.forEach((p) => {
            try {
                const s = app.listen(p, '0.0.0.0', () => {
                    console.log(`[DocRx Backend] Server active and listening on port ${p}`);
                    console.log(`[DocRx Backend] Health check: http://localhost:${p}/api/health`);
                });
                s.on('error', (err) => {
                    if (err.code !== 'EADDRINUSE') {
                        console.warn(`[DocRx Backend] Port ${p} notice:`, err.message);
                    }
                });
            }
            catch (err) {
                // Best-effort port binding
            }
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
            // Non-blocking email provider diagnostics check
            (0, email_service_1.verifyEmailConfiguration)().catch((mailErr) => {
                console.warn('[DocRx Backend] Email configuration verification warning:', mailErr.message);
            });
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
startServer();
