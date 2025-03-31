import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CompatibilityCallToolResultSchema,
  ListToolsResultSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { getMcpServers } from "../fetch-pluggedinmcp.js";
import { getSessionKey, sanitizeName, getPluggedinMCPApiKey } from "../utils.js"; // Import getPluggedinMCPApiKey
import { getSession } from "../sessions.js";
import { ConnectedClient } from "../client.js"; // Assuming ConnectedClient holds the session/client
import {
  getProfileCapabilities,
  ProfileCapability,
} from "../fetch-capabilities.js";
import { getInactiveTools, ToolParameters } from "../fetch-tools.js";
// import { logger } from "../logging.js"; // No longer needed, get from container
import { container } from "../di-container.js"; // Import the DI container
import { Logger } from "../logging.js"; // Import Logger type for casting
import { ToolPlugin, pluginRegistry } from "../plugin-system.js"; // Import plugin system
import { ToolExecutionResult } from "../types.js"; // Import execution result type

const toolName = "tool_call"; // Renamed to match veyrax-mcp convention
const toolDescription = `
Executes a specific proxied MCP tool managed by PluggedinMCP.
Use 'get_tools' first to find the correct 'tool_name' (e.g., 'github__create_issue').
Requires a valid PluggedinMCP API key configured in the environment. The API key is used implicitly by the server based on its environment configuration.
`;

// Define the input schema for this tool
const CallPluggedinToolSchema = z.object({
  tool_name: z
    .string()
    .describe(
      "The prefixed name of the proxied tool to call (e.g., 'github__create_issue', 'google_calendar__list_events'). Get this from 'get_tools'."
    ),
  arguments: z // Renamed input parameter to match veyrax-mcp
    .record(z.any())
    .optional()
    .default({})
    .describe(
      "The arguments object required by the specific proxied tool being called."
    ),
});

// Get logger instance from the DI container
const logger = container.get<Logger>('logger');

/**
 * ToolPlugin implementation for the 'tool_call' static tool.
 * Proxies a tool call to the appropriate downstream MCP server based on the prefixed tool name.
 */
export class CallPluggedinToolTool implements ToolPlugin {
  readonly name = toolName;
  readonly description = toolDescription;
  readonly inputSchema = CallPluggedinToolSchema;

  /**
   * Finds the active downstream client session responsible for handling the specified prefixed tool name.
   * Fetches server configurations and downstream tool lists to map the prefixed name back to its origin.
   * @param prefixedToolName - The tool name including the server prefix (e.g., 'github__create_issue').
   * @param requestMeta - Metadata from the original MCP request.
   * @returns A promise resolving to the ConnectedClient instance or null if not found or inactive.
   * @private
   */
  private static async findClientForTool(
    prefixedToolName: string,
    requestMeta: any
  ): Promise<ConnectedClient | null> {
    // Check for API key before trying to fetch servers
    const apiKey = getPluggedinMCPApiKey();
    if (!apiKey) {
      logger.error("PLUGGEDIN_API_KEY is missing. Cannot find client for tool.");
      // Return null, the execute method will handle the error response
      return null;
    }

    const serverParams = await getMcpServers(true); // Force refresh now that we know key exists
    const profileCapabilities = await getProfileCapabilities(true);
    let inactiveTools: Record<string, ToolParameters> = {};
    if (profileCapabilities.includes(ProfileCapability.TOOLS_MANAGEMENT)) {
      inactiveTools = await getInactiveTools(true);
    }

    for (const [uuid, params] of Object.entries(serverParams)) {
      const sessionKey = getSessionKey(uuid, params);
      const session = await getSession(sessionKey, uuid, params);
      if (!session) continue;

      const capabilities = session.client.getServerCapabilities();
      if (!capabilities?.tools) continue;

      const serverName = session.client.getServerVersion()?.name || "";
      try {
        const result = await session.client.request(
          { method: "tools/list", params: { _meta: requestMeta } },
          ListToolsResultSchema
        );

        const foundTool = result.tools?.find((tool) => {
          const currentPrefixedName = `${sanitizeName(serverName)}__${
            tool.name
          }`;
          // Check if it matches the requested name AND is not inactive
          const isInactive =
            profileCapabilities.includes(ProfileCapability.TOOLS_MANAGEMENT) &&
            inactiveTools[`${uuid}:${tool.name}`];
          return currentPrefixedName === prefixedToolName && !isInactive;
        });

        if (foundTool) {
          return session; // Return the session (ConnectedClient) if the tool is found and active
        }
      } catch (error) {
        // Ignore errors fetching from individual servers during mapping
        logger.warn(
          `Error fetching tools from ${serverName} while mapping for call:`,
          error
        );
      }
    }
    return null; // Tool not found, inactive, or associated client session couldn't be established
  }

  /**
   * Executes the 'tool_call' logic.
   * Finds the correct downstream server based on the prefixed tool name,
   * extracts the original tool name, and proxies the 'tools/call' request.
   * @param args - Validated input arguments containing 'tool_name' and 'arguments'.
   * @param meta - Optional request metadata containing progress tokens etc.
   * @returns A promise resolving to the ToolExecutionResult from the downstream server.
   */
  async execute(
    args: z.infer<typeof CallPluggedinToolSchema>,
    meta?: any
  ): Promise<ToolExecutionResult> {
    const { tool_name: prefixedToolName, arguments: toolArgs } = args;

    // Pass meta to findClientForTool if needed, currently it uses requestMeta directly
    const clientForTool = await CallPluggedinToolTool.findClientForTool(
      prefixedToolName,
      meta // Pass meta here
    );

    if (!clientForTool) {
      // Check if the reason was a missing API key (findClientForTool returns null in that case)
      const apiKey = getPluggedinMCPApiKey();
      if (!apiKey) {
       // Return error structure matching ToolExecutionResult
       return {
         isError: true,
         content: [{ type: "text", text: "Configuration Error: PluggedinMCP API Key is missing. Please configure the server." }],
       };
     }

      // Otherwise, the tool was genuinely not found or inactive
      const profileCapabilities = await getProfileCapabilities();
      if (profileCapabilities.includes(ProfileCapability.TOOLS_MANAGEMENT)) {
        // Re-fetch inactive tools to give a specific error if possible
        const inactiveTools = await getInactiveTools();
        const serverParams = await getMcpServers();
        for (const [uuid, params] of Object.entries(serverParams)) {
           const serverName = params.name || uuid; // Use params.name if available
           const originalToolName = prefixedToolName.startsWith(`${sanitizeName(serverName)}__`)
             ? prefixedToolName.substring(sanitizeName(serverName).length + 2)
             : null;
           if (originalToolName && inactiveTools[`${uuid}:${originalToolName}`]) {
             throw new Error(`Tool is inactive: ${prefixedToolName}`);
           }
         }
       }
       // Return error structure matching ToolExecutionResult
       return {
         isError: true,
         content: [{ type: "text", text: `Error: Unknown or inactive tool: ${prefixedToolName}` }],
       };
    }

    // Extract the original tool name
    const serverName = clientForTool.client.getServerVersion()?.name || "";
    const originalToolName = prefixedToolName.substring(
      sanitizeName(serverName).length + 2
    );

    if (!originalToolName) {
       // Return error structure matching ToolExecutionResult
       return {
         isError: true,
         content: [{ type: "text", text: `Error: Could not extract original tool name from prefixed name: ${prefixedToolName}` }],
       };
    }

    try {
      logger.debug(
        `Proxying call to tool '${originalToolName}' on server '${serverName}' with args:`,
        toolArgs
      );
      // Call the actual tool on the downstream client
      return await clientForTool.client.request(
        {
          method: "tools/call",
         params: {
           name: originalToolName,
           arguments: toolArgs || {},
           _meta: {
             progressToken: meta?.progressToken, // Use meta here
           },
         },
       },
       CompatibilityCallToolResultSchema // Use the schema that expects content/isError
     ) as ToolExecutionResult; // Explicitly cast the result
     // The result from client.request should match ToolExecutionResult structure after type update
     // return result; // Removed extraneous return
   } catch (error) {
     logger.error(
       `Error calling tool '${originalToolName}' through ${serverName}:`,
       error
     );
     // Return error structure matching ToolExecutionResult
     const errorMessage = error instanceof Error ? error.message : String(error);
     return {
       isError: true,
       content: [{ type: "text", text: `Error executing proxied tool: ${errorMessage}` }],
     };
   }
 }
}

// Register the plugin instance with the registry
pluginRegistry.register(new CallPluggedinToolTool());
