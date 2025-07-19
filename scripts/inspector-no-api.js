#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Starting MCP Inspector WITHOUT API KEY...');
console.log('📌 This will test the no-API-key experience\n');

// Spawn the inspector process WITHOUT API key
const inspector = spawn('npx', [
  '@modelcontextprotocol/inspector',
  'dist/index.js'
  // Explicitly NOT passing API key environment variables
], {
  stdio: 'inherit',
  env: { 
    ...process.env,
    // Clear any existing API key
    PLUGGEDIN_API_KEY: '',
    PLUGGEDIN_API_BASE_URL: ''
  }
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