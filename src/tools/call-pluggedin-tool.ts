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
// import {
//   getProfileCapabilities,
//   ProfileCapability,
// } from "../fetch-capabilities.js"; // Removed unused import
// import { getInactiveTools, ToolParameters } from "../fetch-tools.js"; // Removed unused import
// import { container } from "../di-container.js"; // Removed DI
// import { Logger } from "../logging.js"; // Removed Logger
// import { ToolPlugin, pluginRegistry } from "../plugin-system.js"; // Removed Plugin System
import { ToolExecutionResult } from "../types.js";
// import { getSessionKeyForTool } from '../tool-registry.js'; // Removed Tool Registry

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

// Removed logger

/**
 * Implementation for the 'tool_call' static tool.
 * Proxies a tool call to the appropriate downstream MCP server based on the prefixed tool name.
 */
// Removed ToolPlugin interface implementation
export class CallPluggedinToolTool {
  readonly name = toolName;
  readonly description = toolDescription;
  readonly inputSchema = CallPluggedinToolSchema;

  // Removed findClientForTool static method as it relied on removed tool-registry

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

    // Find the client session directly
    let clientForTool: ConnectedClient | null = null;
    let originalToolName: string | null = null;
    let serverName = "unknown"; // Default server name

    try {
      const serverParamsMap = await getMcpServers(); // Fetch server configs
      for (const [uuid, params] of Object.entries(serverParamsMap)) {
        serverName = params.name || uuid; // Use name or fallback to uuid
        
        // Check for both UUID prefix and sanitized server name prefix
        const uuidPrefix = `${uuid}__`;
        const namePrefix = `${sanitizeName(serverName)}__`;
        
        // First check if the tool name starts with the UUID prefix
        if (prefixedToolName.startsWith(uuidPrefix)) {
          originalToolName = prefixedToolName.substring(uuidPrefix.length);
          const sessionKey = getSessionKey(uuid, params);
          // Attempt to get the session
          const session = await getSession(sessionKey, uuid, params);
          if (session) {
             clientForTool = session;
             break; // Found the matching server and session
           }
        }
        // Then check if it starts with the sanitized name prefix
        else if (prefixedToolName.startsWith(namePrefix)) {
          originalToolName = prefixedToolName.substring(namePrefix.length);
          const sessionKey = getSessionKey(uuid, params);
          // Attempt to get the session
          const session = await getSession(sessionKey, uuid, params);
          if (session) {
             clientForTool = session;
             break; // Found the matching server and session
           }
        }
        
        // If neither prefix matches, continue to the next server
      }
    } catch (error) {
        // logger.error("Error finding client session for tool call:", error); // Removed logging
        return {
          isError: true,
         content: [{ type: "text", text: `Error finding origin server for tool: ${prefixedToolName}` }],
       };
    }

     // Handle cases where client or original name wasn't found
     if (!clientForTool || !originalToolName) {
        // logger.warn(`Could not find active session or parse original name for tool: ${prefixedToolName}`); // Removed logging
        return {
          isError: true,
         content: [{ type: "text", text: `Error: Tool not found or origin server unavailable: ${prefixedToolName}` }],
       };
    }

     // Proceed with the tool call using the found client and original name
     try {
       // logger.debug( // Removed logging
       //   `Proxying call to tool '${originalToolName}' on server '${serverName}' with args:`,
       //   toolArgs
       // );
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
      // logger.error( // Removed logging
      //   `Error calling tool '${originalToolName}' through ${serverName}:`,
      //   error
      // );
      // Return error structure matching ToolExecutionResult
     const errorMessage = error instanceof Error ? error.message : String(error);
     return {
       isError: true,
       content: [{ type: "text", text: `Error executing proxied tool: ${errorMessage}` }],
     };
   }
 }
}

// Removed plugin registration
