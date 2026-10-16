import { createApp } from './app';
import { connectDatabase } from './config/db';
import { ENV } from './config/env';
import { seedDatabase } from './seeds/seed';
import { verifyEmailConfiguration } from './services/email.service';

process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Uncaught Exception]', error);
});

const startServer = async () => {
  try {
    const app = createApp();
    const port = Number(process.env.PORT) || Number(ENV.PORT) || 5000;

    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`[DocRx Backend] Standalone server active and listening on port ${port}`);
      console.log(`[DocRx Backend] Health check: http://localhost:${port}/api/health`);
    });

    server.on('error', (err: any) => {
      console.error(`[DocRx Backend] Server error:`, err.message);
    });

    // Non-blocking email provider diagnostics check on startup
    verifyEmailConfiguration().catch((mailErr) => {
      console.warn('[DocRx Backend] Email configuration verification warning:', mailErr.message);
    });

    // Connect database and seed in background without blocking port binding
    connectDatabase()
      .then(async () => {
        try {
          await seedDatabase(false);
        } catch (seedErr) {
          console.error('[DocRx Backend] Auto-seed warning:', seedErr);
        }
      })
      .catch((dbErr) => {
        console.error('[DocRx Backend] Database initial connection error:', dbErr.message);
      });
  } catch (error) {
    console.error('[DocRx Backend] Server startup failed:', error);
    process.exit(1);
  }
};

startServer();
