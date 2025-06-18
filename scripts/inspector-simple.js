#!/usr/bin/env node

import { spawn } from 'child_process';
import { exec } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Starting MCP Inspector with auto-open...');

// Load environment variables from .env.local
const envPath = join(__dirname, '..', '.env.local');
let envVars = {};
try {
  const envContent = readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value && !key.startsWith('#')) {
      envVars[key.trim()] = value.trim();
    }
  });
} catch (error) {
  console.warn('⚠️  Could not load .env.local file');
}

// Spawn the inspector process
const inspector = spawn('npx', [
  '@modelcontextprotocol/inspector',
  'dist/index.js',
  '-e', `PLUGGEDIN_API_KEY=${envVars.PLUGGEDIN_API_KEY || ''}`,
  '-e', `PLUGGEDIN_API_BASE_URL=${envVars.PLUGGEDIN_API_BASE_URL || ''}`,
  '-e', 'DANGEROUSLY_OMIT_AUTH=true'
], {
  stdio: 'inherit',
  env: { ...process.env, ...envVars }
});

// Wait a moment for the inspector to start, then open browser
setTimeout(() => {
  console.log('🌐 Opening browser...');
  const openCommand = process.platform === 'darwin' ? 'open' : 
                     process.platform === 'win32' ? 'start' : 'xdg-open';
  
  exec(`${openCommand} "http://localhost:6274"`, (error) => {
    if (error) {
      console.error(`❌ Could not open browser automatically. Please manually open: http://localhost:6274`);
    } else {
      console.log('✅ Browser opened successfully!');
    }
  });
}, 3000); // Wait 3 seconds for inspector to fully start

// Handle process exit
inspector.on('close', (code) => {
  console.log(`\n📝 Inspector process exited with code ${code}`);
  process.exit(code);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping inspector...');
  inspector.kill('SIGINT');
});

process.on('SIGTERM', () => {
  inspector.kill('SIGTERM');
}); 