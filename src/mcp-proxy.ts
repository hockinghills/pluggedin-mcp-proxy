import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  Tool,
  ListToolsResultSchema, // Keep this for validation if re-enabled
  ListPromptsResultSchema,
  ListResourcesResultSchema,
  ReadResourceResultSchema,
  ListResourceTemplatesRequestSchema,
  ListResourceTemplatesResultSchema,
  ResourceTemplate,
  CompatibilityCallToolResultSchema,
  GetPromptResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod"; // Keep for validation if re-enabled
import { getMcpServers } from "./fetch-pluggedinmcp.js";
import { getSessionKey, sanitizeName, isDebugEnabled } from "./utils.js"; // Import isDebugEnabled
import { cleanupAllSessions, getSession, initSessions } from "./sessions.js";
import { ConnectedClient } from "./client.js";
import { reportToolsToPluggedinMCP } from "./report-tools.js";
import { getInactiveTools, ToolParameters } from "./fetch-tools.js";
import {
  getProfileCapabilities,
  ProfileCapability,
} from "./fetch-capabilities.js";
import { GetPluggedinToolsTool } from "./tools/get-pluggedin-tools.js";
import { CallPluggedinToolTool } from "./tools/call-pluggedin-tool.js";
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

const promptToClient: Record<string, ConnectedClient> = {};
const resourceToClient: Record<string, ConnectedClient> = {};

// Helper function for conditional debug logging to stderr
const debugLog = (...args: any[]) => {
  // No-op: All logging removed to prevent stdio interference
  // if (isDebugEnabled()) {
  //   process.stderr.write(`[DEBUG] ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')}\n`);
  // }
};

// Helper function for error logging to stderr
const errorLog = (...args: any[]) => {
   // No-op: All logging removed to prevent stdio interference
   // process.stderr.write(`[ERROR] ${args.map(arg => arg instanceof Error ? arg.stack : String(arg)).join(' ')}\n`);
};


export const createServer = async () => {
  const server = new Server(
    {
      name: "PluggedinMCP",
      version: packageJson.version,
    },
    {
      capabilities: {
        prompts: {},
        resources: {},
        tools: {},
      },
    }
  );

  // List Tools Handler
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    const staticTools: Tool[] = [
      {
        name: GetPluggedinToolsTool.toolName,
        description: GetPluggedinToolsTool.description,
        inputSchema: { type: "object" }, // Simplified
      },
      {
        name: CallPluggedinToolTool.toolName,
        description: CallPluggedinToolTool.description,
        inputSchema: {
          type: "object",
          properties: {
            tool_name: { 
              type: "string",
              description: "The prefixed name of the proxied tool to call (e.g., 'github__create_issue', 'google_calendar__list_events'). Get this from 'get_tools'."
            },
            arguments: { 
              type: "object", 
              additionalProperties: true, 
              description: "The arguments object required by the specific proxied tool being called.",
              default: {} 
            }
          },
          required: ["tool_name"] 
        },
      },
    ];
    const responsePayload = { tools: staticTools };
    return responsePayload;
  });

  // Call Tool Handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const meta = request.params._meta;
    try {
      if (name === GetPluggedinToolsTool.toolName) {
        const toolListString = await GetPluggedinToolsTool.execute(meta); 
        return {
          content: [
            { type: "text", text: toolListString }, 
          ],
        };
      } else if (name === CallPluggedinToolTool.toolName) {
        const validatedArgs = CallPluggedinToolTool.inputSchema.parse(args); 
        return await CallPluggedinToolTool.execute(validatedArgs, meta); 
      } else {
        // errorLog(`Unknown static tool requested: ${name}`); // Removed log
        throw new Error(
          `Unknown tool: ${name}. Use 'get_tools' to list available tools and 'tool_call' to execute them.`
        );
      }
    } catch (error) { 
      const errorMessage = error instanceof Error ? error.message : String(error);
      // errorLog(`Error executing static tool ${name}:`, errorMessage, error); // Removed log

      let errorDetail = errorMessage;
      if (error instanceof z.ZodError) {
        errorDetail = `Invalid arguments for tool_call: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`;
      }
      
      return {
        isError: true,
        content: [{ type: "text", text: errorDetail || "An unknown error occurred during tool execution" }],
      };
    }
  });

  // Get Prompt Handler
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name } = request.params;
    const clientForPrompt = promptToClient[name];
    if (!clientForPrompt) throw new Error(`Unknown prompt: ${name}`);
    try {
      const promptName = name.split("__")[1];
      return await clientForPrompt.client.request(
        { method: "prompts/get", params: { name: promptName, arguments: request.params.arguments || {}, _meta: request.params._meta } },
        GetPromptResultSchema
      );
    } catch (error) {
      // errorLog(`Error getting prompt through ${clientForPrompt.client.getServerVersion()?.name}:`, error); // Removed log
      throw error; // Re-throw for SDK to handle
    }
  });

  // List Prompts Handler
  server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
    try { 
      const serverParams = await getMcpServers(true);
      const allPrompts: z.infer<typeof ListPromptsResultSchema>["prompts"] = [];
      await Promise.allSettled(
        Object.entries(serverParams).map(async ([uuid, params]) => {
          try { 
            const sessionKey = getSessionKey(uuid, params);
            const session = await getSession(sessionKey, uuid, params);
            if (!session || !session.client.getServerCapabilities()?.prompts) return;
            const serverName = session.client.getServerVersion()?.name || "";
            const result = await session.client.request({ method: "prompts/list", params: { cursor: request.params?.cursor, _meta: request.params?._meta } }, ListPromptsResultSchema);
            if (result.prompts) {
              result.prompts.forEach(prompt => {
                const promptName = `${sanitizeName(serverName)}__${prompt.name}`;
                promptToClient[promptName] = session;
                allPrompts.push({ ...prompt, name: promptName, description: `[${serverName}] ${prompt.description || ""}` });
              });
            }
          } catch (error) { 
            // debugLog(`[ListPrompts Error] Server: ${params.name || uuid} - ${error instanceof Error ? error.message : String(error)}`); // Removed log
          }
        })
      );
      return { prompts: allPrompts, nextCursor: request.params?.cursor };
    } catch (handlerError) {
       // errorLog("[ListPrompts Handler Error]", handlerError); // Removed log
       return { 
         error: "Failed to list prompts due to an internal error.", 
         details: handlerError instanceof Error ? handlerError.message : String(handlerError),
         prompts: [] 
       }; 
    }
  });

  // List Resources Handler
  server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
    // Restore original logic, ensure logs are removed
    try { 
      const serverParams = await getMcpServers(true);
      const allResources: z.infer<typeof ListResourcesResultSchema>["resources"] = [];
      // debugLog(`[ListResources] Found ${Object.keys(serverParams).length} active servers to check.`); // Removed log
      await Promise.allSettled(
        Object.entries(serverParams).map(async ([uuid, params]) => {
          const serverNameLog = params.name || uuid; 
          try { 
            const sessionKey = getSessionKey(uuid, params);
            const session = await getSession(sessionKey, uuid, params);
            if (!session) {
              // debugLog(`[ListResources] No session for ${serverNameLog}`); // Removed log
              return;
            }
            
            const capabilities = session.client.getServerCapabilities();
            if (!capabilities?.resources) {
               // debugLog(`[ListResources] Server ${serverNameLog} does not report resource capability.`); // Removed log
               return;
            }
            
            const actualServerName = session.client.getServerVersion()?.name || serverNameLog; 
            // debugLog(`[ListResources] Checking server: ${actualServerName} (${uuid})`); // Removed log
            const result = await session.client.request({ method: "resources/list", params: { cursor: request.params?.cursor, _meta: request.params?._meta } }, ListResourcesResultSchema);
            // debugLog(`[ListResources] Received ${result.resources?.length ?? 0} resources from ${actualServerName}`); // Removed log
            if (result.resources) {
              result.resources.forEach(resource => {
                resourceToClient[resource.uri] = session; 
                allResources.push({ ...resource, name: `[${actualServerName}] ${resource.name || ""}` });
              });
            }
          } catch (error) { 
              // errorLog(`[ListResources] Error processing server ${serverNameLog}:`, error); // Removed log
          }
        })
      );
      // debugLog(`[ListResources] Returning total ${allResources.length} resources.`); // Removed log
      return { resources: allResources, nextCursor: request.params?.cursor };
    } catch (handlerError) { 
       // errorLog("[ListResources Handler Error]", handlerError); // Removed log
       return { 
         error: "Failed to list resources due to an internal error.", 
         details: handlerError instanceof Error ? handlerError.message : String(handlerError),
         resources: [] 
       }; 
    }
  });

  // Read Resource Handler
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const clientForResource = resourceToClient[uri];
    if (!clientForResource) throw new Error(`Unknown resource: ${uri}`);
    try {
      return await clientForResource.client.request({ method: "resources/read", params: { uri, _meta: request.params._meta } }, ReadResourceResultSchema);
    } catch (error) {
      // errorLog(`Error reading resource through ${clientForResource.client.getServerVersion()?.name}:`, error); // Removed log
      throw error; // Re-throw for SDK
    }
  });

  // List Resource Templates Handler
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async (request) => {
     try { 
      const serverParams = await getMcpServers(true);
      const allTemplates: ResourceTemplate[] = [];
      await Promise.allSettled(
        Object.entries(serverParams).map(async ([uuid, params]) => {
           try { 
            const sessionKey = getSessionKey(uuid, params);
            const session = await getSession(sessionKey, uuid, params);
            if (!session || !session.client.getServerCapabilities()?.resources) return;
            const serverName = session.client.getServerVersion()?.name || "";
            const result = await session.client.request({ method: "resources/templates/list", params: { cursor: request.params?.cursor, _meta: request.params?._meta } }, ListResourceTemplatesResultSchema);
            if (result.resourceTemplates) {
              result.resourceTemplates.forEach(template => {
                allTemplates.push({ ...template, name: `[${serverName}] ${template.name || ""}` });
              });
            }
          } catch (error) { 
             // debugLog(`Error fetching resource templates from server ${params.name || uuid}:`, error instanceof Error ? error.message : String(error)); // Removed log
          }
        })
      );
      return { resourceTemplates: allTemplates, nextCursor: request.params?.cursor };
     } catch (handlerError) {
        // errorLog("[ListResourceTemplates Handler Error]", handlerError); // Removed log
        return { 
          error: "Failed to list resource templates due to an internal error.", 
          details: handlerError instanceof Error ? handlerError.message : String(handlerError),
          resourceTemplates: [] 
        }; 
     }
  });

  const cleanup = async () => {
    await cleanupAllSessions();
  };

  return { server, cleanup };
};
