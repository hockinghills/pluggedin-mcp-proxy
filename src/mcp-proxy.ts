import { Server } from "@modelcontextprotocol/sdk/server/index.js"; // Removed non-exported ServerResult
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
import { getSessionKey, sanitizeName, isDebugEnabled, getPluggedinMCPApiKey, getPluggedinMCPApiBaseUrl } from "./utils.js"; // Import isDebugEnabled and API utils
import { cleanupAllSessions, getSession, initSessions } from "./sessions.js";
import { ConnectedClient } from "./client.js";
import axios from "axios"; // Added import
import { reportToolsToPluggedinMCP } from "./report-tools.js";
import { getInactiveTools, ToolParameters } from "./fetch-tools.js";
import { getToolsAsResources } from "./resources-bridge.js"; // Added import
import {
  getProfileCapabilities,
  ProfileCapability,
} from "./fetch-capabilities.js";
// Import tool plugins (ensure they are loaded to register themselves)
import "./tools/get-pluggedin-tools.js";
import "./tools/call-pluggedin-tool.js";
import "./tools/refresh-tools.js";
// import { GetPluggedinToolsTool } from "./tools/get-pluggedin-tools.js"; // No longer needed directly
// import { CallPluggedinToolTool } from "./tools/call-pluggedin-tool.js"; // No longer needed directly
import { reportAllCapabilities } from "./report-tools.js"; // Renamed import
// import { logger } from "./logging.js"; // No longer needed, get from container
import { container } from "./di-container.js"; // Import the DI container
import { Logger } from "./logging.js"; // Import Logger type for casting
import { pluginRegistry } from "./plugin-system.js"; // Import the plugin registry
import { zodToJsonSchema } from 'zod-to-json-schema'; // Added import
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { ToolExecutionResult } from "./types.js"; // Import ToolExecutionResult

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

const promptToClient: Record<string, ConnectedClient> = {};
const resourceToClient: Record<string, ConnectedClient> = {};

// Get logger instance from the DI container
const logger = container.get<Logger>('logger');

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

  // List Tools Handler - Dynamically lists registered static tool plugins
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    const staticTools: Tool[] = pluginRegistry.getAll().map(plugin => ({
      name: plugin.name,
      description: plugin.description,
      inputSchema: zodToJsonSchema(plugin.inputSchema) as any, // Use library for conversion and cast to any
    }));
    const responsePayload = { tools: staticTools };
    return responsePayload;
  });

  // Call Tool Handler - Uses the plugin registry to find and execute the tool
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<any> => { // Use Promise<any>
    const { name, arguments: args } = request.params;
    const meta = request.params._meta;

    // Find the plugin by name
    const plugin = pluginRegistry.get(name);

    if (!plugin) {
      logger.error(`Unknown static tool requested: ${name}`);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: Unknown tool name: ${name}` }],
      } as any; // Cast error response to any
    }

    try {
      // Validate arguments using the plugin's Zod schema
      const validatedArgs = plugin.inputSchema.parse(args);

      // Execute the plugin and cast the result to any
      return await plugin.execute(validatedArgs, meta) as any; // Cast result to any

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error executing static tool ${name}:`, errorMessage, error);

      let errorDetail = errorMessage;
      if (error instanceof z.ZodError) {
        // Format Zod errors nicely
        errorDetail = `Invalid arguments for tool ${name}: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`;
      }

      return {
        isError: true,
        content: [{ type: "text", text: errorDetail || "An unknown error occurred during tool execution" }],
      } as any; // Cast error response to any
    }
  });

  /* // Old Call Tool Handler - Correctly commented out
  /*
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
      } else if (name === "refresh_tools") {
        // Invalidate the cache immediately
        GetPluggedinToolsTool.invalidateCache();
        // Execute the live discovery and reporting process in the background
        // This is intentionally async and doesn't wait for completion
        // to avoid blocking the MCP client for a potentially long operation.
        reportAllCapabilities().catch((err: any) => { // Use renamed function and type err
          // Log errors from the background refresh process
          logger.error("Error during background capability refresh:", err);
        });
        // Return immediately with a success message
        return {
          content: [
            { type: "text", text: "Capability refresh process initiated in the background." }, // Updated message
          ],
        };
      } else {
        logger.error(`Unknown static tool requested: ${name}`);
        throw new Error(
          `Unknown tool: ${name}. Use 'get_tools' to list available tools, 'tool_call' to execute them, or 'refresh_tools' to update the list.`
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error executing static tool ${name}:`, errorMessage, error);

      let errorDetail = errorMessage;
      if (error instanceof z.ZodError) {
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
      // Add definition for refresh_tools
      {
        name: "refresh_tools",
        description: "Triggers a live discovery of tools from all configured downstream MCP servers and updates the cache. This operation might take some time.",
        inputSchema: { type: "object" }, // No input arguments needed
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
      } else if (name === "refresh_tools") {
        // Invalidate the cache immediately
        GetPluggedinToolsTool.invalidateCache();
        // Execute the live discovery and reporting process in the background
        // This is intentionally async and doesn't wait for completion
        // to avoid blocking the MCP client for a potentially long operation.
        reportAllCapabilities().catch((err: any) => { // Use renamed function and type err
          // Log errors from the background refresh process
          logger.error("Error during background capability refresh:", err);
        });
        // Return immediately with a success message
        return {
          content: [
            { type: "text", text: "Capability refresh process initiated in the background." }, // Updated message
          ],
        };
      } else {
        logger.error(`Unknown static tool requested: ${name}`);
        throw new Error(
          `Unknown tool: ${name}. Use 'get_tools' to list available tools, 'tool_call' to execute them, or 'refresh_tools' to update the list.`
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error executing static tool ${name}:`, errorMessage, error);

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
  */ // End of old handler comment

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
      logger.error(`Error getting prompt through ${clientForPrompt.client.getServerVersion()?.name}:`, error);
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
            logger.debug(`[ListPrompts Error] Server: ${params.name || uuid} - ${error instanceof Error ? error.message : String(error)}`);
          }
        })
      );
      return { prompts: allPrompts, nextCursor: request.params?.cursor };
    } catch (handlerError) {
       logger.error("[ListPrompts Handler Error]", handlerError);
       return {
         error: "Failed to list prompts due to an internal error.",
         details: handlerError instanceof Error ? handlerError.message : String(handlerError),
         prompts: []
       };
    }
  });

  // List Resources Handler
  server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
    try {
      logger.debug("ListResourcesRequestSchema handler called - Fetching cached resources");

      const apiKey = getPluggedinMCPApiKey();
      const apiBaseUrl = getPluggedinMCPApiBaseUrl();
      let allResources: z.infer<typeof ListResourcesResultSchema>["resources"] = [];

      if (!apiKey || !apiBaseUrl) {
        logger.warn("API key or base URL not set, cannot fetch non-tool resources.");
        // Still return tool resources if possible
        allResources = await getToolsAsResources();
        return { resources: allResources, nextCursor: request.params?.cursor };
      }

      // Get tool-based resources (already cached or fetched from /api/tools)
      const toolResources = await getToolsAsResources();
      logger.debug(`Found ${toolResources.length} tool resources`);
      allResources = [...toolResources];

      // Fetch cached non-tool resources from the new API endpoint
      try {
        const response = await axios.get(
          `${apiBaseUrl}/api/resources`, // Fetch from the new endpoint
          {
            headers: { Authorization: `Bearer ${apiKey}` },
          }
        );

        if (response.data && Array.isArray(response.data.results)) {
          const cachedResourcesFromApi: Array<{
            uri: string;
            name?: string;
            description?: string;
            mime_type?: string;
            serverName?: string; // Expect serverName from API
          }> = response.data.results;

          logger.debug(`Found ${cachedResourcesFromApi.length} cached non-tool resources from API`);

          // Map API response to MCP Resource format, add prefix, and handle nulls
          const mappedCachedResources = cachedResourcesFromApi.map(res => ({
            uri: res.uri,
            name: `[${res.serverName || 'Unknown Server'}] ${res.name || res.uri}`, // Add prefix
            description: res.description ?? undefined, // Convert null/undefined to undefined
            mediaType: res.mime_type ?? undefined, // Convert null/undefined to undefined
          }));

          // Combine tool resources and cached non-tool resources
          allResources = [...toolResources, ...mappedCachedResources];

        } else {
          logger.warn("Invalid response structure received from /api/resources:", response.data);
          // Proceed with only tool resources if API call fails
        }
      } catch (apiError) {
        logger.error("Error fetching cached resources from /api/resources:", apiError);
        // Proceed with only tool resources if API call fails
      }

      // Clear the old resourceToClient mapping as it's no longer populated by live discovery
      // This map was used by ReadResource handler for non-tool resources.
      // We need to adjust ReadResource handler for non-tool resources if needed,
      // or assume ReadResource only works for tool resources now.
      // For now, let's clear it. ReadResource will fail for non-tool URIs.
      Object.keys(resourceToClient).forEach(key => {
         // Only delete keys not starting with mcp://tools/
         if (!key.startsWith('mcp://tools/')) {
            delete resourceToClient[key];
         }
      });


      logger.debug(`Returning ${allResources.length} total resources (tools + cached)`);
      return { resources: allResources, nextCursor: request.params?.cursor }; // Assuming no pagination from cache for now

    } catch (handlerError) {
       logger.error("[ListResources Handler Error]", handlerError);
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

    // Check if this is a tool resource (using corrected 'mcp://tools/' prefix from Step 6)
    if (uri.startsWith('mcp://tools/')) {
      try {
        // Parse the URI to get server UUID and tool name
        const parts = uri.substring('mcp://tools/'.length).split('/'); // Adjusted prefix length
        if (parts.length !== 2) {
          throw new Error(`Invalid tool resource URI format: ${uri}`);
        }
        const [serverUuid, toolName] = parts; // Correct parsing

        // Fetch the tool details from the database via pluggedin-app API
        const apiKey = getPluggedinMCPApiKey();
        const apiBaseUrl = getPluggedinMCPApiBaseUrl();

        if (!apiKey || !apiBaseUrl) {
          throw new Error("API key or base URL not set, cannot fetch tool details");
        }

        // Fetch the specific tool
        const response = await axios.get(
          `${apiBaseUrl}/api/tools/${serverUuid}/${toolName}`, // Assumes this endpoint exists (Step 4)
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          }
        );

        if (!response.data || !response.data.tool) {
          throw new Error(`Tool not found for URI: ${uri}`);
        }

        // Return the tool details as resource content
        // Note: ReadResourceResultSchema expects an object with 'contents' array
        // We need to adapt the response format or adjust the expectation.
        // For now, returning a simplified structure. SDK might need adjustment or a different result schema.
        // Let's return the raw JSON string as text content for simplicity, matching the expected structure.
        return {
          contents: [{
            uri: uri,
            mimeType: "application/json",
            text: JSON.stringify(response.data.tool, null, 2),
          }],
        };

      } catch (error) {
        logger.error(`Error reading tool resource: ${uri}`, error);
        // Re-throw a more specific error if possible, or the original error
        throw new Error(`Failed to read tool resource ${uri}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Handle regular resources with existing code
    const clientForResource = resourceToClient[uri];
    if (!clientForResource) throw new Error(`Unknown resource: ${uri}`);
    try {
      // Ensure the proxied request uses the original URI
      return await clientForResource.client.request(
        { method: "resources/read", params: { uri, _meta: request.params._meta } },
        ReadResourceResultSchema
      );
    } catch (error) {
      logger.error(`Error reading resource through ${clientForResource.client.getServerVersion()?.name}:`, error);
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
             logger.debug(`Error fetching resource templates from server ${params.name || uuid}:`, error instanceof Error ? error.message : String(error));
          }
        })
      );
      return { resourceTemplates: allTemplates, nextCursor: request.params?.cursor };
     } catch (handlerError) {
        logger.error("[ListResourceTemplates Handler Error]", handlerError);
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
