#!/usr/bin/env node
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');

console.log(`
  ╔═══════════════════════════════════════════╗
  ║         ⭐ PUMPSTAR WILDE ⭐              ║
  ║     Autonomous Blockchain Agent           ║
  ║                                           ║
  ║  $S402 (native) · $wS402 (wrapped)           ║
  ║  12 AI Agents · SHA-256 Mining · DEX      ║
  ║                                           ║
  ║  sling402.io · @Sling402       ║
  ╚═══════════════════════════════════════════╝
`);

// Check if node_modules exist
if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
  console.log('📦 Installing dependencies...');
  execSync('npm install', { cwd: ROOT, stdio: 'inherit' });
}

// Start the server
const server = spawn('node', ['server.js'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, PORT: process.env.PORT || '3000' }
});

server.on('close', (code) => process.exit(code));
process.on('SIGINT', () => { server.kill('SIGINT'); process.exit(0); });
process.on('SIGTERM', () => { server.kill('SIGTERM'); process.exit(0); });
