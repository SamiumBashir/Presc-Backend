"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const url_1 = require("url");
const db_1 = require("../config/db");
async function runVercelServerlessTestSuite() {
    console.log('================================================================');
    console.log('🧪 VERCEL SERVERLESS INTEGRATION TEST SUITE');
    console.log('================================================================\n');
    // Test 1: Verify Vercel Serverless Entrypoint Export
    console.log('--- 1. Vercel Entrypoint Verification ---');
    const apiPath = path_1.default.resolve(__dirname, '../../api/index.ts');
    const apiModule = await Promise.resolve(`${(0, url_1.pathToFileURL)(apiPath).href}`).then(s => __importStar(require(s)));
    const app = apiModule.default || apiModule;
    (0, assert_1.default)(typeof app === 'function', 'api/index.ts exports an Express application function');
    (0, assert_1.default)(typeof app.use === 'function', 'Exported app has standard Express middleware registration');
    (0, assert_1.default)(typeof app.get === 'function', 'Exported app has route handlers');
    console.log('  ✅ PASS: Vercel serverless entrypoint exports valid Express application');
    // Test 2: Database Connection Caching & Serverless Readiness
    console.log('\n--- 2. Database Connection Caching for Serverless ---');
    await (0, db_1.connectDatabase)();
    (0, assert_1.default)((0, db_1.isDatabaseConnected)(), 'Database reports connected state');
    // Warm invocation reuse check
    const start = Date.now();
    await (0, db_1.connectDatabase)();
    const elapsed = Date.now() - start;
    (0, assert_1.default)(elapsed < 50, 'Warm connection reuse returns in < 50ms');
    console.log(`  ✅ PASS: Warm database connection reuse verified (${elapsed}ms)`);
    // Start ephemeral HTTP listener on dynamic port (simulating Vercel serverless request wrapper)
    const server = http_1.default.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    try {
        // Test 3: GET /api/health
        console.log('\n--- 3. Serverless Request / Response Handling ---');
        const healthRes = await fetch(`${baseUrl}/api/health`);
        (0, assert_1.default)(healthRes.status === 200, `Health check returned status ${healthRes.status}`);
        const healthData = await healthRes.json();
        (0, assert_1.default)(healthData.status === 'ok', 'Health status is ok');
        (0, assert_1.default)(healthData.database === 'connected', 'Database reports connected state');
        console.log('  ✅ PASS: Serverless GET /api/health returned HTTP 200 with database status');
        // Test 4: GET / (Root Endpoint)
        console.log('\n--- 4. Root Status Endpoint ---');
        const rootRes = await fetch(`${baseUrl}/`);
        (0, assert_1.default)(rootRes.status === 200, `Root endpoint returned status ${rootRes.status}`);
        const rootData = await rootRes.json();
        (0, assert_1.default)(rootData.status === 'ok', 'Root status is ok');
        (0, assert_1.default)(rootData.service === 'DocRx Prescription API', 'Root reports correct service name');
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
        (0, assert_1.default)(corsRes.status === 204 || corsRes.status === 200, `CORS preflight returned ${corsRes.status}`);
        (0, assert_1.default)(corsRes.headers.get('access-control-allow-origin') === 'https://doc-presc.vercel.app' || corsRes.headers.get('access-control-allow-origin') === '*', 'Allows cross-origin requests');
        (0, assert_1.default)(corsRes.headers.get('access-control-allow-credentials') === 'true', 'Allows credentials/cookies');
        console.log('  ✅ PASS: CORS preflight passes with credentials support');
    }
    finally {
        await new Promise((resolve) => server.close(() => resolve()));
        await (0, db_1.closeDatabase)();
    }
    console.log('\n================================================================');
    console.log('🎉 ALL VERCEL SERVERLESS TESTS PASSED (5/5)');
    console.log('================================================================\n');
}
runVercelServerlessTestSuite().catch((err) => {
    console.error('❌ Serverless test suite failed:', err);
    process.exit(1);
});
