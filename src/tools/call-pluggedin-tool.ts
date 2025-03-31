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
import { getInactiveTools, ToolParameters } from "../fetch-tools.js"; // Keep for inactive check
import { container } from "../di-container.js";
import { Logger } from "../logging.js";
import { ToolPlugin, pluginRegistry } from "../plugin-system.js";
import { ToolExecutionResult } from "../types.js";
import { getSessionKeyForTool } from '../tool-registry.js'; // Import the registry query function

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
   * Uses the toolOriginMap populated by the capability reporting process.
   * @param prefixedToolName - The tool name including the server prefix (e.g., 'github__create_issue').
   * @returns A promise resolving to the ConnectedClient instance or null if not found.
   * @private
   */
  private static async findClientForTool(
    prefixedToolName: string
  ): Promise<ConnectedClient | null> {
    logger.debug(`Finding client for tool: ${prefixedToolName}`);
    const sessionKey = getSessionKeyForTool(prefixedToolName);

    if (!sessionKey) {
      logger.warn(`No origin session key found in registry for tool: ${prefixedToolName}. Cache might be stale. Trigger refresh_tools.`);
      return null;
    }

    // Attempt to get the session using the key from the map
    // We don't need uuid/params here as getSession should retrieve by key if it exists
    // Note: This assumes the session corresponding to sessionKey is still active in the _sessions map in sessions.ts
    // If sessions can expire independently, this might need adjustment.
    const session = await getSession(sessionKey, '', {} as any); // Pass dummy uuid/params as they are not used for lookup by key

    if (!session) {
       logger.warn(`Session not found for key "${sessionKey}" associated with tool "${prefixedToolName}". Cache might be stale.`);
       return null;
    }

    // Optional: Add back the inactive check if needed, though ideally the registry
    // should only contain active tools if populated correctly.
    // const profileCapabilities = await getProfileCapabilities();
    // if (profileCapabilities.includes(ProfileCapability.TOOLS_MANAGEMENT)) {
    //    const inactiveTools = await getInactiveTools();
    //    // Need to extract original tool name and uuid from sessionKey or map to check inactivity
    //    // This adds complexity back, suggesting the registry should ideally handle active state.
    // }

    logger.debug(`Found session key "${sessionKey}" for tool "${prefixedToolName}"`);
    return session;
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

    // Use the optimized findClientForTool which no longer needs meta for lookup
    const clientForTool = await CallPluggedinToolTool.findClientForTool(
      prefixedToolName
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
       // Updated error message to reflect potential cache staleness
       return {
         isError: true,
         content: [{ type: "text", text: `Error: Tool not found or origin unknown: ${prefixedToolName}. Try running 'refresh_tools'.` }],
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
