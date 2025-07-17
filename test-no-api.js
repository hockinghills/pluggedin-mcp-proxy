#!/usr/bin/env node

import { createServer } from './dist/mcp-proxy.js';

console.log('🧪 Testing Plugged.in MCP without API key...\n');

// Clear any API key from environment
process.env.PLUGGEDIN_API_KEY = '';
process.env.PLUGGEDIN_API_BASE_URL = '';

async function test() {
  console.log('1️⃣ Creating server...');
  const { server } = await createServer();
  
  console.log('2️⃣ Testing list tools...');
  const toolsHandler = server._requestHandlers.get('tools/list');
  const toolsResult = await toolsHandler({ method: 'tools/list', params: {} });
  
  console.log(`✅ Found ${toolsResult.tools.length} tools:`);
  toolsResult.tools.forEach(tool => {
    console.log(`   - ${tool.name}: ${tool.description.substring(0, 60)}...`);
  });
  
  console.log('\n3️⃣ Testing prompts list...');
  const promptsHandler = server._requestHandlers.get('prompts/list');
  const promptsResult = await promptsHandler({ method: 'prompts/list', params: {} });
  
  console.log(`✅ Found ${promptsResult.prompts.length} prompts:`);
  promptsResult.prompts.forEach(prompt => {
    console.log(`   - ${prompt.name}: ${prompt.description.substring(0, 60)}...`);
  });
  
  console.log('\n4️⃣ Testing setup tool (should work)...');
  const callToolHandler = server._requestHandlers.get('tools/call');
  try {
    const setupResult = await callToolHandler({ 
      method: 'tools/call', 
      params: { 
        name: 'pluggedin_setup',
        arguments: { topic: 'getting_started' }
      } 
    });
    console.log('✅ Setup tool worked! Response preview:');
    console.log(setupResult.content[0].text.substring(0, 200) + '...\n');
  } catch (error) {
    console.log('❌ Setup tool failed:', error.message);
  }
  
  console.log('5️⃣ Testing other tool (should show help message)...');
  try {
    const ragResult = await callToolHandler({ 
      method: 'tools/call', 
      params: { 
        name: 'pluggedin_rag_query',
        arguments: { query: 'test' }
      } 
    });
    console.log('✅ RAG tool returned help message:');
    console.log(ragResult.content[0].text.substring(0, 200) + '...\n');
  } catch (error) {
    console.log('❌ RAG tool failed:', error.message);
  }
  
  console.log('✨ Test complete!');
  process.exit(0);
}

test().catch(console.error);