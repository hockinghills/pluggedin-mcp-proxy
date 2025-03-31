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
import { getSessionKey, sanitizeName } from "./utils.js";
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
    // console.log("ListToolsRequest received, returning static tools."); // Removed log
    const staticTools: Tool[] = [
      {
        name: GetPluggedinToolsTool.toolName,
        description: GetPluggedinToolsTool.description,
        inputSchema: { type: "object" }, // Simplified
      },
      {
        name: CallPluggedinToolTool.toolName,
        description: CallPluggedinToolTool.description,
        // More accurately represent the Zod schema used for parsing
        inputSchema: {
          type: "object",
          properties: {
            tool_name: { 
              type: "string",
              description: "The prefixed name of the proxied tool to call (e.g., 'github__create_issue', 'google_calendar__list_events'). Get this from 'get_tools'."
            },
            arguments: { 
              type: "object", 
              additionalProperties: true, // from z.record(z.any())
              description: "The arguments object required by the specific proxied tool being called.",
              default: {} // from .optional().default({})
            }
          },
          required: ["tool_name"] // Only tool_name is strictly required by the Zod schema
        },
      },
    ];
    const responsePayload = { tools: staticTools };
    // Return the object directly, SDK handles serialization
    // Validation was removed as a debugging step for the client-side parsing error
    return responsePayload;
  });

  // Call Tool Handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const meta = request.params._meta;
    // console.log(`CallToolRequest received for tool: ${name}`); // Removed log
    try {
      if (name === GetPluggedinToolsTool.toolName) {
        // Execute the tool which now returns a stringified array of tool names
        const toolListString = await GetPluggedinToolsTool.execute(meta); 
        
        // Return a simple CallToolResult containing only the text
        return {
          content: [
            { type: "text", text: toolListString }, // Place the string directly here
          ],
        };
      } else if (name === CallPluggedinToolTool.toolName) {
        // Re-enable Zod parsing using the tool's actual schema
        const validatedArgs = CallPluggedinToolTool.inputSchema.parse(args); 
        // Let the SDK handle the response serialization for this case
        return await CallPluggedinToolTool.execute(validatedArgs, meta); 
      } else {
        console.error(`Unknown static tool requested: ${name}`);
        throw new Error(
          `Unknown tool: ${name}. Use 'get_tools' to list available tools and 'tool_call' to execute them.`
        );
      }
    } catch (error) { // Catch all errors more broadly
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error executing static tool ${name}:`, errorMessage, error); // Log the error message and potentially the full error object

      // Always return a standardized error format (as an object for SDK serialization)
      let errorDetail = errorMessage;
      if (error instanceof z.ZodError) {
        errorDetail = `Invalid arguments for tool_call: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`;
      }
      
      // Let SDK serialize the error object
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
      console.error(`Error getting prompt through ${clientForPrompt.client.getServerVersion()?.name}:`, error);
      throw error;
    }
  });

  // List Prompts Handler
  server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
    const serverParams = await getMcpServers(true);
    const allPrompts: z.infer<typeof ListPromptsResultSchema>["prompts"] = [];
    await Promise.allSettled(
      Object.entries(serverParams).map(async ([uuid, params]) => {
        const sessionKey = getSessionKey(uuid, params);
        const session = await getSession(sessionKey, uuid, params);
        if (!session || !session.client.getServerCapabilities()?.prompts) return;
        const serverName = session.client.getServerVersion()?.name || "";
        try {
          const result = await session.client.request({ method: "prompts/list", params: { cursor: request.params?.cursor, _meta: request.params?._meta } }, ListPromptsResultSchema);
          if (result.prompts) {
            result.prompts.forEach(prompt => {
              const promptName = `${sanitizeName(serverName)}__${prompt.name}`;
              promptToClient[promptName] = session;
              allPrompts.push({ ...prompt, name: promptName, description: `[${serverName}] ${prompt.description || ""}` });
            });
          }
        } catch (error) { console.error(`Error fetching prompts from: ${serverName}`, error); }
      })
    );
    return { prompts: allPrompts, nextCursor: request.params?.cursor };
  });

  // List Resources Handler
  server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
    const serverParams = await getMcpServers(true);
    const allResources: z.infer<typeof ListResourcesResultSchema>["resources"] = [];
    await Promise.allSettled(
      Object.entries(serverParams).map(async ([uuid, params]) => {
        const sessionKey = getSessionKey(uuid, params);
        const session = await getSession(sessionKey, uuid, params);
        if (!session || !session.client.getServerCapabilities()?.resources) return;
        const serverName = session.client.getServerVersion()?.name || "";
        try {
          const result = await session.client.request({ method: "resources/list", params: { cursor: request.params?.cursor, _meta: request.params?._meta } }, ListResourcesResultSchema);
          if (result.resources) {
            result.resources.forEach(resource => {
              resourceToClient[resource.uri] = session;
              allResources.push({ ...resource, name: `[${serverName}] ${resource.name || ""}` });
            });
          }
        } catch (error) { console.error(`Error fetching resources from: ${serverName}`, error); }
      })
    );
    return { resources: allResources, nextCursor: request.params?.cursor };
  });

  // Read Resource Handler
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const clientForResource = resourceToClient[uri];
    if (!clientForResource) throw new Error(`Unknown resource: ${uri}`);
    try {
      return await clientForResource.client.request({ method: "resources/read", params: { uri, _meta: request.params._meta } }, ReadResourceResultSchema);
    } catch (error) {
      console.error(`Error reading resource through ${clientForResource.client.getServerVersion()?.name}:`, error);
      throw error;
    }
  });

  // List Resource Templates Handler
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async (request) => {
    const serverParams = await getMcpServers(true);
    const allTemplates: ResourceTemplate[] = [];
    await Promise.allSettled(
      Object.entries(serverParams).map(async ([uuid, params]) => {
        const sessionKey = getSessionKey(uuid, params);
        const session = await getSession(sessionKey, uuid, params);
        if (!session || !session.client.getServerCapabilities()?.resources) return;
        const serverName = session.client.getServerVersion()?.name || "";
        try {
          const result = await session.client.request({ method: "resources/templates/list", params: { cursor: request.params?.cursor, _meta: request.params?._meta } }, ListResourceTemplatesResultSchema);
          if (result.resourceTemplates) {
            result.resourceTemplates.forEach(template => {
              allTemplates.push({ ...template, name: `[${serverName}] ${template.name || ""}` });
            });
          }
        } catch (error) { /* Ignore errors from individual servers */ }
      })
    );
    return { resourceTemplates: allTemplates, nextCursor: request.params?.cursor };
  });

  const cleanup = async () => {
    await cleanupAllSessions();
  };

  return { server, cleanup };
};
