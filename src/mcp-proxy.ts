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
import { getSessionKey, sanitizeName } from "./utils.js";
import { cleanupAllSessions, getSession, initSessions } from "./sessions.js";
import { ConnectedClient } from "./client.js";
import { reportToolsToPluggedinMCP } from "./report-tools.js";
import { getInactiveTools, ToolParameters } from "./fetch-tools.js"; // Keep for potential internal use if needed
import {
  getProfileCapabilities,
  ProfileCapability,
} from "./fetch-capabilities.js"; // Keep for potential internal use if needed
import { GetPluggedinToolsTool } from "./tools/get-pluggedin-tools.js"; // Will now be GetToolsTool internally
import { CallPluggedinToolTool } from "./tools/call-pluggedin-tool.js"; // Will now be ToolCallTool internally
import { readFileSync } from 'fs'; // Import fs
import { createRequire } from 'module'; // Import createRequire for JSON

const require = createRequire(import.meta.url);
const packageJson = require('../package.json'); // Read package.json relative to current file

// Remove global mappings as they are handled within the tool executions now
// const toolToClient: Record<string, ConnectedClient> = {};
const promptToClient: Record<string, ConnectedClient> = {}; // Keep if prompt proxying is still direct
const resourceToClient: Record<string, ConnectedClient> = {}; // Keep if resource proxying is still direct
// const inactiveToolsMap: Record<string, boolean> = {}; // Inactive check is now inside CallPluggedinToolTool

export const createServer = async () => {
  const server = new Server(
    {
      name: "PluggedinMCP",
      version: packageJson.version, // Use version from package.json
    },
    {
      capabilities: {
        prompts: {},
        resources: {},
        tools: {},
      },
    }
  );

  // Remove background session initialization - sessions will be initialized on demand by getSession
  // initSessions().catch();

  // --- Static Tool Registration ---
  // Instead of dynamically fetching, we now statically declare the tools this proxy offers.

  // List Tools Handler - Now returns only the static tools
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    console.log("ListToolsRequest received, returning static tools.");
    const staticTools: Tool[] = [
      {
        name: GetPluggedinToolsTool.toolName, // Uses 'get_tools' now
        description: GetPluggedinToolsTool.description,
        // Provide the JSON schema directly
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: CallPluggedinToolTool.toolName, // Uses 'tool_call' now
        description: CallPluggedinToolTool.description,
        // Provide the JSON schema directly
        inputSchema: {
          type: "object",
          properties: {
            tool_name: { // Keep internal schema name consistent for now
              type: "string",
              description:
                "The prefixed name of the proxied tool to call (e.g., 'github__create_issue', 'google_calendar__list_events'). Get this from 'get_tools'.", // Updated description
            },
            arguments: { // Keep internal schema name consistent for now
              type: "object",
              additionalProperties: true,
              description:
                "The arguments object required by the specific proxied tool being called.",
            },
          },
          required: ["tool_name"],
        },
      },
    ];
    return { tools: staticTools };
  });

  // Call Tool Handler - Now routes calls to the static tool classes
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const meta = request.params._meta; // Extract meta for passing along

    console.log(`CallToolRequest received for tool: ${name}`);

    try {
      if (name === GetPluggedinToolsTool.toolName) { // Check against 'get_tools'
        // Execute the static 'get_tools' tool
        // Note: The execute method in GetPluggedinToolsTool returns a ListToolsResult,
        // but the CallTool handler expects a CallToolResult. This needs adjustment.
        // For now, let's assume GetPluggedinToolsTool.execute is adapted or we wrap its result.
        // --- TEMPORARY ADJUSTMENT: Wrap result ---
        const listResult = await GetPluggedinToolsTool.execute(meta);
        return {
          content: [
            { type: "text", text: JSON.stringify(listResult.tools, null, 2) },
          ],
        };
        // --- END TEMPORARY ADJUSTMENT ---
        // TODO: Refactor GetPluggedinToolsTool.execute to return CallToolResult format or handle conversion here.

      } else if (name === CallPluggedinToolTool.toolName) { // Check against 'tool_call'
        // Validate arguments against the CallPluggedinToolTool schema
        const validatedArgs = CallPluggedinToolTool.inputSchema.parse(args);
        // Execute the static 'tool_call' tool
        return await CallPluggedinToolTool.execute(validatedArgs, meta);
      } else {
        // If the tool name doesn't match our static tools, it's an invalid request
        console.error(`Unknown static tool requested: ${name}`);
        throw new Error(
          `Unknown tool: ${name}. Use 'get_tools' to list available tools and 'tool_call' to execute them.` // Updated error message
        );
      }
    } catch (error: any) {
      console.error(`Error executing static tool ${name}:`, error);
      // Return error in the expected format
      return {
        isError: true,
        content: [{ type: "text", text: error.message || "An unknown error occurred" }],
      };
    }
  });

  // --- Prompt and Resource Handlers (Keep existing proxy logic if needed) ---

  // Get Prompt Handler (Assuming direct proxying is still desired)
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name } = request.params;
    const clientForPrompt = promptToClient[name];

    if (!clientForPrompt) {
      throw new Error(`Unknown prompt: ${name}`);
    }

    try {
      // Ensure promptToClient mapping is maintained if this handler is kept
      const promptName = name.split("__")[1];
      const response = await clientForPrompt.client.request(
        {
          method: "prompts/get",
          params: {
            name: promptName,
            arguments: request.params.arguments || {},
            _meta: request.params._meta,
          },
        },
        GetPromptResultSchema
      );

      return response;
    } catch (error) {
      console.error(
        `Error getting prompt through ${
          clientForPrompt.client.getServerVersion()?.name
        }:`,
        error
      );
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
        if (!session) return;

        const capabilities = session.client.getServerCapabilities();
        if (!capabilities?.prompts) return;

        const serverName = session.client.getServerVersion()?.name || "";
        try {
          const result = await session.client.request(
            {
              method: "prompts/list",
              params: {
                cursor: request.params?.cursor,
                _meta: request.params?._meta,
              },
            },
            ListPromptsResultSchema
          );

          if (result.prompts) {
            const promptsWithSource = result.prompts.map((prompt) => {
              const promptName = `${sanitizeName(serverName)}__${prompt.name}`;
              promptToClient[promptName] = session; // Ensure this mapping is updated
              return {
                ...prompt,
                name: promptName,
                description: `[${serverName}] ${prompt.description || ""}`,
              };
            });
            allPrompts.push(...promptsWithSource);
          }
        } catch (error) {
          console.error(`Error fetching prompts from: ${serverName}`, error);
        }
      })
    );

    return {
      prompts: allPrompts,
      nextCursor: request.params?.cursor,
    };
  });

  // List Resources Handler
  server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
    const serverParams = await getMcpServers(true);
    const allResources: z.infer<typeof ListResourcesResultSchema>["resources"] =
      [];

    await Promise.allSettled(
      Object.entries(serverParams).map(async ([uuid, params]) => {
        const sessionKey = getSessionKey(uuid, params);
        const session = await getSession(sessionKey, uuid, params);
        if (!session) return;

        const capabilities = session.client.getServerCapabilities();
        if (!capabilities?.resources) return;

        const serverName = session.client.getServerVersion()?.name || "";
        try {
          const result = await session.client.request(
            {
              method: "resources/list",
              params: {
                cursor: request.params?.cursor,
                _meta: request.params?._meta,
              },
            },
            ListResourcesResultSchema
          );

          if (result.resources) {
            const resourcesWithSource = result.resources.map((resource) => {
              resourceToClient[resource.uri] = session; // Ensure this mapping is updated
              return {
                ...resource,
                name: `[${serverName}] ${resource.name || ""}`,
              };
            });
            allResources.push(...resourcesWithSource);
          }
        } catch (error) {
          console.error(`Error fetching resources from: ${serverName}`, error);
        }
      })
    );

    return {
      resources: allResources,
      nextCursor: request.params?.cursor,
    };
  });

  // Read Resource Handler
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const clientForResource = resourceToClient[uri]; // Ensure this mapping is updated

    if (!clientForResource) {
      throw new Error(`Unknown resource: ${uri}`);
    }

    try {
      return await clientForResource.client.request(
        {
          method: "resources/read",
          params: {
            uri,
            _meta: request.params._meta,
          },
        },
        ReadResourceResultSchema
      );
    } catch (error) {
      console.error(
        `Error reading resource through ${
          clientForResource.client.getServerVersion()?.name
        }:`,
        error
      );
      throw error;
    }
  });

  // List Resource Templates Handler
  server.setRequestHandler(
    ListResourceTemplatesRequestSchema,
    async (request) => {
      const serverParams = await getMcpServers(true);
      const allTemplates: ResourceTemplate[] = [];

      await Promise.allSettled(
        Object.entries(serverParams).map(async ([uuid, params]) => {
          const sessionKey = getSessionKey(uuid, params);
          const session = await getSession(sessionKey, uuid, params);
          if (!session) return;

          const capabilities = session.client.getServerCapabilities();
          if (!capabilities?.resources) return;

          const serverName = session.client.getServerVersion()?.name || "";
          try {
            const result = await session.client.request(
              {
                method: "resources/templates/list",
                params: {
                  cursor: request.params?.cursor,
                  _meta: request.params?._meta,
                },
              },
              ListResourceTemplatesResultSchema
            );

            if (result.resourceTemplates) {
              const templatesWithSource = result.resourceTemplates.map(
                (template) => ({
                  ...template,
                  name: `[${serverName}] ${template.name || ""}`,
                })
              );
              allTemplates.push(...templatesWithSource);
            }
          } catch (error) {
            return;
          }
        })
      );

      return {
        resourceTemplates: allTemplates,
        nextCursor: request.params?.cursor,
      };
    }
  );

  const cleanup = async () => {
    await cleanupAllSessions();
  };

  return { server, cleanup };
};
