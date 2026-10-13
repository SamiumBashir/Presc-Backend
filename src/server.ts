import { createApp } from './app';
import { connectDatabase } from './config/db';
import { ENV } from './config/env';
import { seedDatabase } from './seeds/seed';

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

    // Multi-port binding: listen on PORT (from env), 5000, and 8080 simultaneously
    // This guarantees Railway public router always connects regardless of target port setting
    const targetPorts = Array.from(new Set([port, 5000, 8080]));
    targetPorts.forEach((p) => {
      try {
        const s = app.listen(p, '0.0.0.0', () => {
          console.log(`[DocRx Backend] Server active and listening on port ${p}`);
          console.log(`[DocRx Backend] Health check: http://localhost:${p}/api/health`);
        });
        s.on('error', (err: any) => {
          if (err.code !== 'EADDRINUSE') {
            console.warn(`[DocRx Backend] Port ${p} notice:`, err.message);
          }
        });
      } catch (err: any) {
        // Best-effort port binding
      }
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
