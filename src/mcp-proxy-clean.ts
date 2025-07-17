import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  Tool,
  ListResourceTemplatesRequestSchema,
  ResourceTemplate,
  PingRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { sanitizeName, isDebugEnabled } from "./utils.js";
import { cleanupAllSessions, initSessions } from "./sessions.js";
import { ToolExecutionResult } from "./types.js";
import { 
  RateLimiter, 
  sanitizeErrorMessage, 
  validateToolName, 
  validateRequestSize,
} from "./security-utils.js";
import { debugLog, debugError } from "./debug-log.js";
import { createRequire } from 'module';

// Import refactored modules
import { staticTools } from './tools/static-tools.js';
import { StaticToolHandlers } from './handlers/static-handlers.js';
import { DynamicToolHandlers } from './handlers/dynamic-handlers.js';
import { staticPrompts, getStaticPrompt } from './utils/prompts.js';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

// Map to store prefixed tool name -> { originalName, serverUuid }
const toolToServerMap: Record<string, { originalName: string; serverUuid: string; }> = {};
// Map to store custom instruction name -> serverUuid
const instructionToServerMap: Record<string, string> = {};

// Initialize handlers
const staticToolHandlers = new StaticToolHandlers(toolToServerMap, instructionToServerMap);
const dynamicToolHandlers = new DynamicToolHandlers(toolToServerMap, instructionToServerMap);

// Initialize rate limiter (60 requests per minute)
const rateLimiter = new RateLimiter(60000, 60);

export class McpProxy {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "pluggedin-mcp",
        version: packageJson.version,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      debugError("[MCP Proxy] Server error:", error);
      console.error("[MCP Proxy] Server error:", error);
    };

    process.on('SIGINT', async () => {
      debugLog('[MCP Proxy] Received SIGINT, cleaning up...');
      await cleanupAllSessions();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      debugLog('[MCP Proxy] Received SIGTERM, cleaning up...');
      await cleanupAllSessions();
      process.exit(0);
    });
  }

  private setupHandlers(): void {
    // Handle ping requests
    this.server.setRequestHandler(PingRequestSchema, async () => {
      debugLog("[Ping Handler] Ping request received");
      return {}; // Return empty object as per the protocol
    });

    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      debugError("[ListTools Handler] Listing available tools...");
      
      try {
        const connectedTools: Tool[] = [];
        
        // Get dynamic tools from connected sessions
        const sessions = global.sessions || {};
        for (const [sessionKey, session] of Object.entries(sessions)) {
          const sessionData = session as any;
          if (sessionData?.serverCapabilities?.tools) {
            sessionData.serverCapabilities.tools.forEach((tool: any) => {
              const serverName = sessionData.serverName || 'unknown';
              const prefixedName = sanitizeName(`${serverName}_${tool.name}`);
              const prefixedDescription = `[${serverName}] ${tool.description}`;
              
              connectedTools.push({
                name: prefixedName,
                description: prefixedDescription,
                inputSchema: tool.inputSchema,
              });
            });
          }
        }

        // Combine static and dynamic tools
        const allTools = [...staticTools, ...connectedTools];
        
        debugError(`[ListTools Handler] Returning ${allTools.length} tools (${staticTools.length} static, ${connectedTools.length} dynamic)`);
        
        return {
          tools: allTools,
        };
      } catch (error) {
        debugError("[ListTools Handler] Error listing tools:", error);
        return { tools: staticTools };
      }
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const requestedToolName: string = request.params.name;
      const args = request.params.arguments;

      debugError(`[CallTool Handler] Tool call received: ${requestedToolName}`);
      debugLog(`[CallTool Handler] Arguments:`, args);

      // Validate tool name
      if (!validateToolName(requestedToolName)) {
        throw new Error(`Invalid tool name: ${requestedToolName}`);
      }

      // Validate request size
      if (!validateRequestSize(args)) {
        throw new Error("Request payload too large");
      }

      // Apply rate limiting
      if (!rateLimiter.checkLimit()) {
        throw new Error(`Rate limit exceeded for tool: ${requestedToolName}. Please try again later.`);
      }

      try {
        // Try static tools first
        const staticResult = await staticToolHandlers.handleStaticTool(requestedToolName, args);
        if (staticResult) {
          return {
            content: staticResult.content,
            isError: staticResult.isError,
          };
        }

        // Try dynamic tools
        const dynamicResult = await dynamicToolHandlers.handleDynamicTool(requestedToolName, args);
        if (dynamicResult) {
          return {
            content: dynamicResult.content,
            isError: dynamicResult.isError,
          };
        }

        // Try custom instructions
        const instructionResult = await dynamicToolHandlers.handleCustomInstruction(requestedToolName, args);
        if (instructionResult) {
          return {
            content: instructionResult.content,
            isError: instructionResult.isError,
          };
        }

        // Tool not found
        throw new Error(`Unknown tool: ${requestedToolName}. Run 'pluggedin_discover_tools' to see available tools.`);

      } catch (error: any) {
        debugError(`[CallTool Handler] Error executing tool ${requestedToolName}:`, error);
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${sanitizeErrorMessage(error)}`,
            },
          ],
          isError: true,
        };
      }
    });

    // List available prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      debugError("[ListPrompts Handler] Listing available prompts...");
      
      try {
        const allPrompts = [];
        
        // Add static prompts
        for (const [name, prompt] of Object.entries(staticPrompts)) {
          allPrompts.push({
            name: prompt.name,
            description: prompt.description,
            arguments: prompt.arguments
          });
        }
        
        // Get dynamic prompts from connected sessions
        const sessions = global.sessions || {};
        for (const [sessionKey, session] of Object.entries(sessions)) {
          const sessionData = session as any;
          if (sessionData?.serverCapabilities?.prompts) {
            sessionData.serverCapabilities.prompts.forEach((prompt: any) => {
              const serverName = sessionData.serverName || 'unknown';
              const prefixedName = sanitizeName(`${serverName}_${prompt.name}`);
              const prefixedDescription = `[${serverName}] ${prompt.description}`;
              
              allPrompts.push({
                name: prefixedName,
                description: prefixedDescription,
                arguments: prompt.arguments || []
              });
            });
          }
        }
        
        debugError(`[ListPrompts Handler] Returning ${allPrompts.length} prompts`);
        
        return {
          prompts: allPrompts,
        };
      } catch (error) {
        debugError("[ListPrompts Handler] Error listing prompts:", error);
        return { 
          prompts: Object.values(staticPrompts).map(p => ({
            name: p.name,
            description: p.description,
            arguments: p.arguments
          }))
        };
      }
    });

    // Get specific prompt
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const promptName = request.params.name;
      const promptArgs = request.params.arguments || {};
      
      debugError(`[GetPrompt Handler] Getting prompt: ${promptName}`);

      try {
        // Check static prompts first
        const staticPrompt = getStaticPrompt(promptName);
        if (staticPrompt) {
          return staticPrompt;
        }

        // Check dynamic prompts from connected servers
        const sessions = global.sessions || {};
        for (const [sessionKey, session] of Object.entries(sessions)) {
          const sessionData = session as any;
          if (sessionData?.serverCapabilities?.prompts) {
            const serverName = sessionData.serverName || 'unknown';
            
            // Check if this is the server that has the prompt
            const originalPromptName = promptName.replace(new RegExp(`^${sanitizeName(serverName)}_`), '');
            const prompt = sessionData.serverCapabilities.prompts.find((p: any) => 
              p.name === originalPromptName || sanitizeName(`${serverName}_${p.name}`) === promptName
            );
            
            if (prompt && sessionData.client) {
              try {
                const response = await sessionData.client.request({
                  method: "prompts/get",
                  params: { 
                    name: originalPromptName,
                    arguments: promptArgs 
                  }
                });
                
                return response;
              } catch (error) {
                debugError(`[GetPrompt Handler] Error getting prompt from server:`, error);
                throw error;
              }
            }
          }
        }

        throw new Error(`Prompt not found: ${promptName}`);
      } catch (error) {
        debugError(`[GetPrompt Handler] Error:`, error);
        throw error;
      }
    });

    // List resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      debugError("[ListResources Handler] Listing available resources...");
      
      try {
        const allResources: any[] = [];
        
        // Get resources from connected sessions
        const sessions = global.sessions || {};
        for (const [sessionKey, session] of Object.entries(sessions)) {
          const sessionData = session as any;
          if (sessionData?.serverCapabilities?.resources) {
            sessionData.serverCapabilities.resources.forEach((resource: any) => {
              const serverName = sessionData.serverName || 'unknown';
              const prefixedUri = `${serverName}://${resource.uri}`;
              const prefixedName = resource.name ? `[${serverName}] ${resource.name}` : prefixedUri;
              const prefixedDescription = resource.description ? 
                `[${serverName}] ${resource.description}` : 
                `Resource from ${serverName}`;
              
              allResources.push({
                uri: prefixedUri,
                name: prefixedName,
                description: prefixedDescription,
                mimeType: resource.mimeType
              });
            });
          }
        }
        
        debugError(`[ListResources Handler] Returning ${allResources.length} resources`);
        
        return {
          resources: allResources,
        };
      } catch (error) {
        debugError("[ListResources Handler] Error listing resources:", error);
        return { resources: [] };
      }
    });

    // Read resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const resourceUri = request.params.uri;
      
      debugError(`[ReadResource Handler] Reading resource: ${resourceUri}`);

      try {
        // Parse the prefixed URI to extract server name and original URI
        const match = resourceUri.match(/^([^:]+):\/\/(.+)$/);
        if (!match) {
          throw new Error(`Invalid resource URI format: ${resourceUri}`);
        }

        const serverName = match[1];
        const originalUri = match[2];

        // Find the session for this server
        const sessions = global.sessions || {};
        let targetSession = null;
        
        for (const [sessionKey, session] of Object.entries(sessions)) {
          const sessionData = session as any;
          if (sessionData.serverName === serverName) {
            targetSession = sessionData;
            break;
          }
        }

        if (!targetSession || !targetSession.client) {
          throw new Error(`No active session found for server: ${serverName}`);
        }

        // Forward the read request to the actual server
        const response = await targetSession.client.request({
          method: "resources/read",
          params: { uri: originalUri }
        });

        return response;
      } catch (error) {
        debugError(`[ReadResource Handler] Error:`, error);
        throw error;
      }
    });

    // List resource templates
    this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
      debugError("[ListResourceTemplates Handler] Listing resource templates...");
      
      try {
        const allTemplates: ResourceTemplate[] = [];
        
        // Get resource templates from connected sessions
        const sessions = global.sessions || {};
        for (const [sessionKey, session] of Object.entries(sessions)) {
          const sessionData = session as any;
          if (sessionData?.serverCapabilities?.resourceTemplates) {
            sessionData.serverCapabilities.resourceTemplates.forEach((template: any) => {
              const serverName = sessionData.serverName || 'unknown';
              const prefixedUriTemplate = `${serverName}://${template.uriTemplate}`;
              const prefixedName = template.name ? `[${serverName}] ${template.name}` : prefixedUriTemplate;
              const prefixedDescription = template.description ? 
                `[${serverName}] ${template.description}` : 
                `Resource template from ${serverName}`;
              
              allTemplates.push({
                uriTemplate: prefixedUriTemplate,
                name: prefixedName,
                description: prefixedDescription,
                mimeType: template.mimeType
              });
            });
          }
        }
        
        debugError(`[ListResourceTemplates Handler] Returning ${allTemplates.length} templates`);
        
        return {
          resourceTemplates: allTemplates,
        };
      } catch (error) {
        debugError("[ListResourceTemplates Handler] Error listing resource templates:", error);
        return { resourceTemplates: [] };
      }
    });
  }

  async run(): Promise<void> {
    debugLog("[MCP Proxy] Starting server...");
    
    const transport = this.server.transport;
    
    debugLog("[MCP Proxy] Server started successfully, running on stdio");
    if (transport) {
      await transport.start();
    }
  }
}

// Create global sessions object if it doesn't exist
declare global {
  var sessions: any;
}

if (!global.sessions) {
  global.sessions = {};
}

// Auto-connect to servers on startup
(async () => {
  try {
    await initSessions();
  } catch (error) {
    debugError("[MCP Proxy] Failed to initialize sessions:", error);
  }
})();

// Only run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  const proxy = new McpProxy();
  proxy.run().catch((error) => {
    console.error("Failed to run MCP Proxy:", error);
    process.exit(1);
  });
}