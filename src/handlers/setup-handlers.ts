import { ToolExecutionResult } from "../types.js";
import { getPluggedinMCPApiKey, getPluggedinMCPApiBaseUrl, sanitizeName, isDebugEnabled } from "../utils.js";
import { logMcpActivity, createExecutionTimer } from "../notification-logger.js";
import { debugLog, debugError } from "../debug-log.js";
import { getApiKeySetupMessage } from "./static-handlers-helpers.js";
import { makeApiRequest } from "../http-client.js";
import { DiscoverToolsInputSchema, RagQueryInputSchema } from '../schemas/index.js';
import { setupStaticTool, discoverToolsStaticTool, ragQueryStaticTool } from '../tools/static-tools.js';
import { getMcpServers } from "../fetch-pluggedinmcp.js";
import { getSession, initSessions } from "../sessions.js";
import { getSessionKey } from "../utils.js";
import axios from "axios";

// Type for tool to server mapping
export type ToolToServerMap = Record<string, { originalName: string; serverUuid: string; }>;

/**
 * Handles setup, discovery, and RAG operations
 */
export class SetupHandlers {
  constructor(
    private toolToServerMap: ToolToServerMap,
    private instructionToServerMap: Record<string, string>
  ) {}

  async handleSetup(args: any): Promise<ToolExecutionResult> {
    const topic = args?.topic || 'getting_started';
    
    let content = '';
    
    switch (topic) {
      case 'getting_started':
        content = `# Welcome to Plugged.in MCP! 🚀

## What is Plugged.in?
Plugged.in is a unified interface for Model Context Protocol (MCP) servers, allowing you to:
- Connect multiple MCP servers through a single proxy
- Manage AI-generated documents
- Use RAG capabilities for semantic search
- Send notifications and track activities

## Getting Started
1. **Get your API key**: Visit https://plugged.in/settings to create an account and get your API key
2. **Configure your environment**: Set the PLUGGEDIN_API_KEY environment variable
3. **Discover tools**: Run \`pluggedin_discover_tools\` to see available MCP servers
4. **Start using tools**: Access any tool from connected servers

## Available Commands
- \`pluggedin_setup\` - This help system (no API key required)
- \`pluggedin_discover_tools\` - List available MCP servers
- Other tools require an API key - see descriptions for details

For more help, try: \`pluggedin_setup\` with topic: "api_key", "configuration", or "troubleshooting"`;
        break;
        
      case 'api_key':
        content = `# Setting up your Plugged.in API Key 🔑

## Getting an API Key
1. Visit https://plugged.in
2. Sign up or log in to your account
3. Navigate to Settings → API Keys
4. Create a new API key
5. Copy the key (starts with \`pg_in_\`)

## Configuring the API Key
Set the environment variable before running your MCP client:

### macOS/Linux:
\`\`\`bash
export PLUGGEDIN_API_KEY="pg_in_your_key_here"
export PLUGGEDIN_API_BASE_URL="https://plugged.in" # Optional, defaults to this
\`\`\`

### Windows:
\`\`\`cmd
set PLUGGEDIN_API_KEY=pg_in_your_key_here
set PLUGGEDIN_API_BASE_URL=https://plugged.in
\`\`\`

### In your application:
Add to your \`.env\` file or configuration.

## Verifying Setup
Run \`pluggedin_discover_tools\` - if configured correctly, you'll see your connected MCP servers.`;
        break;
        
      case 'configuration':
        content = `# Plugged.in Configuration Guide ⚙️

## Environment Variables
- **PLUGGEDIN_API_KEY** (required): Your API key from https://plugged.in/settings
- **PLUGGEDIN_API_BASE_URL** (optional): API endpoint (defaults to https://plugged.in)
- **PLUGGEDIN_DEBUG** (optional): Set to "true" for verbose logging

## MCP Server Configuration
1. Log in to https://plugged.in
2. Navigate to MCP Servers
3. Add your MCP servers with their connection details
4. Servers are automatically available through the proxy

## Docker Configuration
If using Docker, pass environment variables:
\`\`\`bash
docker run -e PLUGGEDIN_API_KEY="your_key" pluggedin-mcp
\`\`\`

## Testing Configuration
- \`pluggedin_discover_tools\` - Lists connected servers
- \`pluggedin_rag_query\` - Tests RAG functionality
- \`pluggedin_list_documents\` - Tests document access`;
        break;
        
      case 'troubleshooting':
        content = `# Troubleshooting Guide 🔧

## Common Issues

### "API Key not configured"
- Check if PLUGGEDIN_API_KEY environment variable is set
- Verify the key starts with \`pg_in_\`
- Ensure no extra spaces or quotes in the key

### No servers found with discover_tools
- Verify your API key is valid
- Check if you have MCP servers configured at https://plugged.in
- Try with \`force_refresh: true\` parameter

### Connection timeouts
- Check your internet connection
- Verify PLUGGEDIN_API_BASE_URL if using custom endpoint
- Check if behind a firewall or proxy

### Tools not working
- Most tools require an API key (check tool descriptions)
- Ensure your account has appropriate permissions
- Check server logs for detailed error messages

## Debug Mode
Enable debug logging:
\`\`\`bash
export PLUGGEDIN_DEBUG=true
\`\`\`

## Getting Help
- Documentation: https://plugged.in/docs
- Support: support@plugged.in
- GitHub: https://github.com/pluggedin/mcp-proxy

## Platform-Specific Notes

### Claude Desktop
Add to your Claude Desktop config:
\`\`\`json
{
  "mcpServers": {
    "pluggedin": {
      "command": "npx",
      "args": ["@pluggedin/mcp-proxy"],
      "env": {
        "PLUGGEDIN_API_KEY": "pg_in_your_key_here"
      }
    }
  }
}
\`\`\`

### VS Code / Cursor
Set environment variables in your terminal before launching the editor.

### Common Error Codes
- 401: Invalid API key
- 403: Permission denied (check account status)
- 429: Rate limit exceeded
- 500: Server error (try again later)`;
        break;
    }
    
    return {
      content: [{ type: "text", text: content }],
      isError: false,
    };
  }

  async handleDiscoverTools(args: any): Promise<ToolExecutionResult> {
    debugError(`[CallTool Handler] Executing static tool: ${discoverToolsStaticTool.name}`);
    const validatedArgs = DiscoverToolsInputSchema.parse(args ?? {});

    const timer = createExecutionTimer();
    try {
      const apiKey = getPluggedinMCPApiKey();
      const baseUrl = getPluggedinMCPApiBaseUrl();
      
      if (!apiKey || !baseUrl) {
        // No API key - show only static tools
        let dataContent = '# Available MCP Tools (No API Key)\n\n';
        dataContent += 'To see your configured MCP servers, please set up your API key.\n';
        dataContent += 'Run `pluggedin_setup` for help getting started.\n\n';
        dataContent += '## Available Static Tools:\n';
        dataContent += '- **pluggedin_setup** - Get help and setup instructions\n';
        dataContent += '- **pluggedin_discover_tools** - Discover available tools (limited without API key)\n';
        
        return {
          content: [{ type: "text", text: dataContent }],
          isError: false,
        };
      }

      // Reinitialize sessions if force refresh requested
      if (validatedArgs.force_refresh) {
        debugLog('[CallTool Handler] Force refresh requested, reinitializing sessions...');
        await initSessions();
      }

      // Log discovery attempt
      logMcpActivity({
        action: 'tool_call',
        serverName: 'Pluggedin Discovery',
        serverUuid: 'pluggedin_discovery',
        itemName: discoverToolsStaticTool.name,
        success: true,
        executionTime: 0, // Will update after
      }).catch(() => {}); // Ignore notification errors
      
      // Wipe stored servers and instructions maps
      Object.keys(this.toolToServerMap).forEach(key => delete this.toolToServerMap[key]);
      Object.keys(this.instructionToServerMap).forEach(key => delete this.instructionToServerMap[key]);

      // First, fetch servers to get basic info
      let servers: any[] = [];
      let serverMap: Record<string, any> = {};
      try {
        const response = await makeApiRequest<any[]>({
          method: 'GET',
          url: '/api/mcp-servers',
          requiresAuth: true
        });
        
        if (Array.isArray(response)) {
          servers = response;
          // Create a map for easy lookup
          servers.forEach(server => {
            serverMap[server.uuid] = server;
          });
        } else {
          throw new Error('Invalid response format from API');
        }
      } catch (fetchError: any) {
        const errorMsg = `Could not fetch MCP servers: ${fetchError.message}. Please ensure your Pluggedin API key and URL are correctly configured.`;
        throw new Error(errorMsg);
      }

      let dataContent = '# Available MCP Servers\n\n';

      // Then fetch tools from the tools endpoint
      let tools: any[] = [];
      try {
        const response = await makeApiRequest<any>(
          {
            method: 'GET',
            url: '/api/tools',
            requiresAuth: true
          }
        );
        
        // The API returns { tools: Tool[] }
        if (response && response.tools && Array.isArray(response.tools)) {
          tools = response.tools;
          debugLog(`[Discover Tools] Found ${tools.length} tools`);
          if (tools.length > 0) {
            debugLog('[Discover Tools] First tool example:', tools[0]);
          }
        } else {
          debugLog('[Discover Tools] Unexpected response structure:', response);
        }
      } catch (toolsError: any) {
        debugError('Failed to fetch tools:', toolsError);
        debugLog('[Discover Tools] Error details:', toolsError.message);
      }

      // Group tools by server
      const toolsByServer: Record<string, any[]> = {};
      tools.forEach(tool => {
        // Try multiple possible field names for server UUID
        const serverUuid = tool.mcp_server_uuid || tool.server_uuid || tool.serverUuid || tool.mcpServerUuid || tool._serverUuid;
        const toolName = tool.name || tool.tool_name || tool.toolName;
        
        if (serverUuid) {
          if (!toolsByServer[serverUuid]) {
            toolsByServer[serverUuid] = [];
          }
          toolsByServer[serverUuid].push(tool);
        }
      });
      debugLog('[Discover Tools] Tools grouped by server:', Object.keys(toolsByServer));
      debugLog('[Discover Tools] Server UUIDs from servers:', servers.map(s => s.uuid));
      
      // Process each server and its tools
      servers.forEach((server: any) => {
        const serverTools = toolsByServer[server.uuid] || [];
        
        if (serverTools.length > 0) {
          dataContent += `## ${server.name}\n`;
          dataContent += `### Tools (${serverTools.length}):\n`;
          
          serverTools.forEach((tool: any) => {
            const toolName = tool.name || tool.tool_name || tool.toolName;
            const prefixedName = sanitizeName(`${server.name}_${toolName}`);
            this.toolToServerMap[prefixedName] = { originalName: toolName, serverUuid: server.uuid };
            dataContent += `- **${prefixedName}** - ${tool.description || 'No description available'}\n`;
          });
          dataContent += '\n';
        } else {
          // Only show server name if it has no tools
          dataContent += `## ${server.name}\n`;
          dataContent += `*No tools available*\n\n`;
        }

        // Process custom instructions if any
        if (server.customInstructions?.length > 0) {
          dataContent += `### Instructions (${server.customInstructions.length}):\n`;
          server.customInstructions.forEach((instruction: any) => {
            const name = instruction.name || `instruction_${Math.random().toString(36).substring(7)}`;
            this.instructionToServerMap[name] = server.uuid;
            dataContent += `- **${name}** - ${instruction.instruction}\n`;
          });
          dataContent += '\n';
        }
      });

      // Always show static tools for better discoverability
      dataContent += '\n## Plugged.in Built-in Tools\n';
      dataContent += '### Static Tools:\n';
      dataContent += '- **pluggedin_setup** - Get started with Plugged.in MCP (no API key required)\n';
      dataContent += '- **pluggedin_discover_tools** - Triggers discovery of tools for configured MCP servers\n';
      dataContent += '- **pluggedin_rag_query** - Performs a RAG query against documents\n';
      dataContent += '- **pluggedin_send_notification** - Send custom notifications\n';
      dataContent += '- **pluggedin_list_notifications** - List notifications with filters\n';
      dataContent += '- **pluggedin_mark_notification_read** - Mark a notification as read\n';
      dataContent += '- **pluggedin_delete_notification** - Delete a notification\n';
      dataContent += '- **pluggedin_create_document** - Create and save AI-generated documents to the user\'s library\n';
      dataContent += '- **pluggedin_list_documents** - List documents with filtering options\n';
      dataContent += '- **pluggedin_search_documents** - Search documents semantically\n';
      dataContent += '- **pluggedin_get_document** - Retrieve a specific document by ID\n';
      dataContent += '- **pluggedin_update_document** - Update or append to an existing document\n';

      // Update activity log with success
      logMcpActivity({
        action: 'tool_call',
        serverName: 'Pluggedin Discovery',
        serverUuid: 'pluggedin_discovery',
        itemName: discoverToolsStaticTool.name,
        success: true,
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors

      return {
        content: [{ type: "text", text: dataContent }],
        isError: false,
      };
    } catch (toolError: any) {
      // Log discovery failure
      logMcpActivity({
        action: 'tool_call',
        serverName: 'Pluggedin Discovery',
        serverUuid: 'pluggedin_discovery',
        itemName: discoverToolsStaticTool.name,
        success: false,
        errorMessage: toolError instanceof Error ? toolError.message : String(toolError),
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors
      
      throw toolError;
    }
  }

  async handleRagQuery(args: any): Promise<ToolExecutionResult> {
    debugError(`[CallTool Handler] Executing static tool: ${ragQueryStaticTool.name}`);
    const validatedArgs = RagQueryInputSchema.parse(args ?? {});

    const apiKey = getPluggedinMCPApiKey();
    if (!apiKey) {
      return {
        content: [{
          type: "text",
          text: getApiKeySetupMessage("pluggedin_rag_query")
        }],
        isError: false
      };
    }

    const timer = createExecutionTimer();
    try {
      const response = await makeApiRequest<{ results: any[] }>({
        method: 'POST',
        url: '/api/rag/query',
        data: validatedArgs
      });

      // Log successful RAG query
      logMcpActivity({
        action: 'tool_call',
        serverName: 'Pluggedin RAG',
        serverUuid: 'pluggedin_rag',
        itemName: ragQueryStaticTool.name,
        success: true,
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors

      const results = response.results || [];
      
      let responseText = `RAG Query Results for: "${validatedArgs.query}"\n\n`;
      if (results.length === 0) {
        responseText += 'No relevant documents found.\n';
      } else {
        results.forEach((result: any, index: number) => {
          responseText += `${index + 1}. **${result.title}** (Score: ${(result.score * 100).toFixed(1)}%)\n`;
          responseText += `   ${result.snippet}\n`;
          responseText += `   [Document ID: ${result.documentId}]\n\n`;
        });
      }

      return {
        content: [{ type: "text", text: responseText }],
        isError: false,
      };

    } catch (error: any) {
      // Log failed RAG query
      logMcpActivity({
        action: 'tool_call',
        serverName: 'Pluggedin RAG',
        serverUuid: 'pluggedin_rag',
        itemName: ragQueryStaticTool.name,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors
      
      throw error;
    }
  }
}