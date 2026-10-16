import assert from 'assert';
import http from 'http';
import path from 'path';
import { pathToFileURL } from 'url';
import { connectDatabase, closeDatabase, isDatabaseConnected } from '../config/db';

async function runVercelServerlessTestSuite() {
  console.log('================================================================');
  console.log('🧪 VERCEL SERVERLESS INTEGRATION TEST SUITE');
  console.log('================================================================\n');

  // Test 1: Verify Vercel Serverless Entrypoint Export
  console.log('--- 1. Vercel Entrypoint Verification ---');
  const apiPath = path.resolve(__dirname, '../../api/index.ts');
  const apiModule = await import(pathToFileURL(apiPath).href);
  const app = apiModule.default || apiModule;
  assert(typeof app === 'function', 'api/index.ts exports an Express application function');
  assert(typeof (app as any).use === 'function', 'Exported app has standard Express middleware registration');
  assert(typeof (app as any).get === 'function', 'Exported app has route handlers');
  console.log('  ✅ PASS: Vercel serverless entrypoint exports valid Express application');

  // Test 2: Database Connection Caching & Serverless Readiness
  console.log('\n--- 2. Database Connection Caching for Serverless ---');
  await connectDatabase();
  assert(isDatabaseConnected(), 'Database reports connected state');

  // Warm invocation reuse check
  const start = Date.now();
  await connectDatabase();
  const elapsed = Date.now() - start;
  assert(elapsed < 50, 'Warm connection reuse returns in < 50ms');
  console.log(`  ✅ PASS: Warm database connection reuse verified (${elapsed}ms)`);

  // Start ephemeral HTTP listener on dynamic port (simulating Vercel serverless request wrapper)
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Test 3: GET /api/health
    console.log('\n--- 3. Serverless Request / Response Handling ---');
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert(healthRes.status === 200, `Health check returned status ${healthRes.status}`);
    const healthData = await healthRes.json();
    assert(healthData.status === 'ok', 'Health status is ok');
    assert(healthData.database === 'connected', 'Database reports connected state');
    console.log('  ✅ PASS: Serverless GET /api/health returned HTTP 200 with database status');

    // Test 4: GET / (Root Endpoint)
    console.log('\n--- 4. Root Status Endpoint ---');
    const rootRes = await fetch(`${baseUrl}/`);
    assert(rootRes.status === 200, `Root endpoint returned status ${rootRes.status}`);
    const rootData = await rootRes.json();
    assert(rootData.status === 'ok', 'Root status is ok');
    assert(rootData.service === 'DocRx Prescription API', 'Root reports correct service name');
    console.log('  ✅ PASS: Serverless GET / returned HTTP 200 with service info');

    // Test 5: CORS Preflight (OPTIONS /api/auth/login)
    console.log('\n--- 5. CORS Preflight & Security Headers ---');
    const corsRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://doc-presc.vercel.app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type,Authorization',
      },
    });
    assert(corsRes.status === 204 || corsRes.status === 200, `CORS preflight returned ${corsRes.status}`);
    assert(corsRes.headers.get('access-control-allow-origin') === 'https://doc-presc.vercel.app' || corsRes.headers.get('access-control-allow-origin') === '*', 'Allows cross-origin requests');
    assert(corsRes.headers.get('access-control-allow-credentials') === 'true', 'Allows credentials/cookies');
    console.log('  ✅ PASS: CORS preflight passes with credentials support');

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeDatabase();
  }

  console.log('\n================================================================');
  console.log('🎉 ALL VERCEL SERVERLESS TESTS PASSED (5/5)');
  console.log('================================================================\n');
}

runVercelServerlessTestSuite().catch((err) => {
  console.error('❌ Serverless test suite failed:', err);
  process.exit(1);
});
