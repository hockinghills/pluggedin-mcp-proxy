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

// Spawn the inspector process without DANGEROUSLY_OMIT_AUTH
const inspector = spawn('npx', [
  '@modelcontextprotocol/inspector',
  'dist/index.js',
  '-e', `PLUGGEDIN_API_KEY=${envVars.PLUGGEDIN_API_KEY || ''}`,
  '-e', `PLUGGEDIN_API_BASE_URL=${envVars.PLUGGEDIN_API_BASE_URL || ''}`
], {
  stdio: 'pipe',
  env: { ...process.env, ...envVars }
});

let browserOpened = false;

// Handle stdout
inspector.stdout.on('data', (data) => {
  const output = data.toString();
  process.stdout.write(output);
  
  // Look for the pre-filled URL with token
  const urlMatch = output.match(/http:\/\/localhost:6274\/\?MCP_PROXY_AUTH_TOKEN=([a-f0-9]+)/);
  if (urlMatch && !browserOpened) {
    const url = urlMatch[0];
    console.log('🌐 Auto-opening browser with pre-filled token...');
    
    // Open the URL in the default browser
    const openCommand = process.platform === 'darwin' ? 'open' : 
                       process.platform === 'win32' ? 'start' : 'xdg-open';
    
    exec(`${openCommand} "${url}"`, (error) => {
      if (error) {
        console.error(`❌ Could not open browser automatically. Please manually open: ${url}`);
      } else {
        console.log('✅ Browser opened successfully with token!');
      }
    });
    
    browserOpened = true;
  }
});

// Handle stderr
inspector.stderr.on('data', (data) => {
  process.stderr.write(data);
});

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