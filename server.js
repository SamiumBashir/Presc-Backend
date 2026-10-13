// Entrypoint launcher for cloud deployment (Render, Railway, etc.)
const path = require('path');
const fs = require('fs');

const distServer = path.join(__dirname, 'dist', 'server.js');

if (!fs.existsSync(distServer)) {
  console.log('[DocRx Backend] dist/server.js not found. Compiling TypeScript on the fly...');
  try {
    const { execSync } = require('child_process');
    execSync('npm run build', { cwd: __dirname, stdio: 'inherit' });
  } catch (err) {
    console.error('[DocRx Backend] Automatic build failed:', err);
    process.exit(1);
  }
}

require(distServer);
