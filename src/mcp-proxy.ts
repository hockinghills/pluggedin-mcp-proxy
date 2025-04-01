import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  Tool,
  ListToolsResultSchema,
  ListPromptsResultSchema,
  ListResourcesResultSchema,
  ReadResourceResultSchema,
  ListResourceTemplatesRequestSchema,
  ListResourceTemplatesResultSchema,
  ResourceTemplate,
  CompatibilityCallToolResultSchema,
  GetPromptResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { getMcpServers } from "./fetch-pluggedinmcp.js";
import { getSessionKey, sanitizeName, isDebugEnabled, getPluggedinMCPApiKey, getPluggedinMCPApiBaseUrl } from "./utils.js";
import { cleanupAllSessions, getSession, initSessions } from "./sessions.js";
import { ConnectedClient } from "./client.js";
import axios from "axios";
// Removed unused imports
import { GetPluggedinToolsTool } from "./tools/get-pluggedin-tools.js";
import { CallPluggedinToolTool } from "./tools/call-pluggedin-tool.js";
import { zodToJsonSchema } from 'zod-to-json-schema';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { ToolExecutionResult } from "./types.js";

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

// Restore resource mapping
const resourceToClient: Record<string, ConnectedClient> = {};

// Removed logger

// Instantiate tool classes directly
const getToolsInstance = new GetPluggedinToolsTool();
const callToolInstance = new CallPluggedinToolTool();
// Removed refresh tool instance

export const createServer = async () => {
  const server = new Server(
    {
      name: "PluggedinMCP",
      version: packageJson.version,
    },
    {
      // Restore resource capabilities
      capabilities: {
        prompts: undefined, // No prompt support
        resources: {}, // Resource support enabled
        tools: {}, // Tool support enabled
      },
    }
  );

  // List Tools Handler - Manually define static tools
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    const staticTools: Tool[] = [
      {
        name: getToolsInstance.name,
        description: getToolsInstance.description,
        inputSchema: zodToJsonSchema(getToolsInstance.inputSchema) as any,
      },
      {
        name: callToolInstance.name,
        description: callToolInstance.description,
        inputSchema: zodToJsonSchema(callToolInstance.inputSchema) as any,
      },
      // Removed refresh_tools definition
    ];
    const responsePayload = { tools: staticTools };
    return responsePayload;
  });

  // Call Tool Handler - Use if/else if to call tool logic directly
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<any> => { // Use Promise<any>
    const { name, arguments: args } = request.params;
    const meta = request.params._meta;

    try {
      let executionResult; // Variable to hold the result

      if (name === getToolsInstance.name) {
        const validatedArgs = getToolsInstance.inputSchema.parse(args); // Parse args with GetPluggedinToolsSchema
        executionResult = await getToolsInstance.execute(validatedArgs, meta);
      } else if (name === callToolInstance.name) {
        const validatedArgs = callToolInstance.inputSchema.parse(args); // Parse args with CallPluggedinToolSchema
        executionResult = await callToolInstance.execute(validatedArgs, meta);
      // Removed refresh_tools case
      } else {
        // logger.error(`Unknown static tool requested: ${name}`); // Removed logging
        // Return MCP MethodNotFound error
        throw new Error(`Method not found: ${name}`); // Throwing error for SDK to handle
      }

      // Return the execution result, casting to any
      return executionResult as any;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // logger.error(`Error executing static tool ${name}:`, errorMessage, error); // Removed logging

      let errorDetail = errorMessage;
      if (error instanceof z.ZodError) {
        // Format Zod errors nicely
        errorDetail = `Invalid arguments for tool ${name}: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`;
      }

      // Let SDK handle error formatting by re-throwing
      if (error instanceof Error) {
         throw error;
      } else {
         throw new Error(errorDetail || "An unknown error occurred during tool execution");
      }
    }
  });

  // Removed Get Prompt Handler
  // Removed List Prompts Handler

  // List Resources Handler - Simplified to only proxy, with timeouts
  server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
    const RESOURCE_REQUEST_TIMEOUT_MS = 5000; // 5 second timeout for each downstream server

    // Helper function for timeout
    const timeout = (ms: number, promise: Promise<any>) => {
      let timer: NodeJS.Timeout;
      return Promise.race([
        promise,
        new Promise((_, reject) => timer = setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms))
      ]).finally(() => clearTimeout(timer));
    };

    try {
      const serverParams = await getMcpServers(true);
      const allResources: z.infer<typeof ListResourcesResultSchema>["resources"] = [];
      // Clear mapping before populating
      Object.keys(resourceToClient).forEach(key => delete resourceToClient[key]);

      const promises = Object.entries(serverParams).map(async ([uuid, params]) => {
          try {
            const sessionKey = getSessionKey(uuid, params);
            const session = await getSession(sessionKey, uuid, params);
            // Check if session exists and supports resources
            if (!session || !session.client.getServerCapabilities()?.resources) {
               return; // Skip servers without resource capability
            }
            const serverName = session.client.getServerVersion()?.name || "";

            // Wrap the request in a timeout
            const result = await timeout(
               RESOURCE_REQUEST_TIMEOUT_MS,
               session.client.request({ method: "resources/list", params: { cursor: request.params?.cursor, _meta: request.params?._meta } }, ListResourcesResultSchema)
            ) as z.infer<typeof ListResourcesResultSchema>; // Correctly infer type from Zod schema

            if (result.resources && result.resources.length > 0) {
              // Use a temporary array to avoid race conditions on allResources
              const serverResources: z.infer<typeof ListResourcesResultSchema>["resources"] = [];
              // Add explicit type for resource parameter
              result.resources.forEach((resource: z.infer<typeof ListResourcesResultSchema>["resources"][number]) => {
                // Store mapping for ReadResource
                resourceToClient[resource.uri] = session;
                // Add prefix to name for clarity
                serverResources.push({ ...resource, name: `[${serverName}] ${resource.name || resource.uri}` });
              });
              return serverResources; // Return resources found for this server
            }
          } catch (error) {
             // Log specific errors, including timeouts
             console.error(`[ListResources Error] Server ${params.name || uuid}:`, error instanceof Error ? error.message : String(error));
          }
          return []; // Return empty array on error or no resources
        });

      // Wait for all promises to settle
      const results = await Promise.allSettled(promises);

      // Aggregate results from successful promises
      results.forEach(result => {
         if (result.status === 'fulfilled' && Array.isArray(result.value)) {
            allResources.push(...result.value);
         }
      });

      return { resources: allResources, nextCursor: request.params?.cursor }; // Assuming no pagination across servers for now
    } catch (handlerError) {
       // console.error("[ListResources Handler Error]", handlerError); // Keep outer error logging minimal or remove
       // Let SDK handle error
       throw handlerError;
    }
  });

  // Read Resource Handler - Simplified to only proxy (No changes needed here for timeout)
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    // Handle regular resources by finding the client mapped during ListResources
    const clientForResource = resourceToClient[uri];
    if (!clientForResource) {
       throw new Error(`Unknown resource: ${uri}`); // Throw error for SDK
    }
    try {
      // Ensure the proxied request uses the original URI
      // Consider adding a timeout here as well if reading can be slow
      return await clientForResource.client.request(
        { method: "resources/read", params: { uri, _meta: request.params._meta } },
        ReadResourceResultSchema
      );
    } catch (error) {
      throw error; // Re-throw for SDK
    }
  });

  // Removed List Resource Templates Handler

  const cleanup = async () => {
    await cleanupAllSessions();
  };

  return { server, cleanup };
};
