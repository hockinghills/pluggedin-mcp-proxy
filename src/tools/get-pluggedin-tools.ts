import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  Tool,
  // ListToolsResultSchema, // No longer needed for live discovery
  // CompatibilityCallToolResultSchema, // Keep for reference, but execute returns string now
} from "@modelcontextprotocol/sdk/types.js";
// import { getMcpServers, ServerParameters } from "../fetch-pluggedinmcp.js"; // No longer needed
import { getPluggedinMCPApiKey, getPluggedinMCPApiBaseUrl } from "../utils.js"; // Import API utils
// import { getSessionKey, sanitizeName } from "../utils.js"; // No longer needed
// import { getSession } from "../sessions.js"; // No longer needed
// import { reportToolsToPluggedinMCP } from "../report-tools.js"; // No longer needed
// import { getInactiveTools, ToolParameters } from "../fetch-tools.js"; // No longer needed
// import {
//   getProfileCapabilities,
//   ProfileCapability,
// } from "../fetch-capabilities.js"; // No longer needed
import axios from "axios"; // Import axios
// import { logger } from "../logging.js"; // No longer needed, get from container
import { Cache } from "../cache.js"; // Keep Cache type import
import { container } from "../di-container.js"; // Import the DI container
import { Logger } from "../logging.js"; // Import Logger type for casting
import { ToolPlugin, pluginRegistry } from "../plugin-system.js"; // Import plugin system
import { ToolExecutionResult } from "../types.js"; // Import execution result type

const toolName = "get_tools"; 
const toolDescription = `
Retrieves the list of currently active and available proxied MCP tools managed by PluggedinMCP.
Use this tool first to discover which tools (like 'github__create_issue', 'google_calendar__list_events', etc.) are available before attempting to call them with 'tool_call'.
Requires a valid PluggedinMCP API key configured in the environment.
`;

const GetPluggedinToolsSchema = z.object({});

// Get logger and cache instances from the DI container
const logger = container.get<Logger>('logger');
// const logger = container.get<Logger>('logger'); // Removed duplicate
const toolsCache = container.get<Cache<string>>('toolsCache');

export class GetPluggedinToolsTool implements ToolPlugin {
  readonly name = toolName; // Use readonly instance property
  readonly description = toolDescription; // Use readonly instance property
  readonly inputSchema = GetPluggedinToolsSchema; // Use readonly instance property

  // Method to invalidate the cache (will be called by refresh_tools)
  static invalidateCache(): void {
    const apiKey = getPluggedinMCPApiKey();
    if (apiKey) {
      const cacheKey = `tools:${apiKey}`;
      logger.info(`Invalidating tools cache for key: ${cacheKey}`);
      toolsCache.invalidate(cacheKey);
    } else {
       logger.warn("Cannot invalidate tools cache: API key is missing.");
    }
  }

  // This method fetches the cached tool list from the pluggedin-app API
  // Updated to match ToolPlugin interface
  async execute(
    args: z.infer<typeof GetPluggedinToolsSchema>, // Use validated args (empty object)
    meta?: any // Optional meta
  ): Promise<ToolExecutionResult> { // Return type matches ToolPlugin interface

    const apiKey = getPluggedinMCPApiKey();
    const apiBaseUrl = getPluggedinMCPApiBaseUrl();

    if (!apiKey || !apiBaseUrl) {
      logger.error("PLUGGEDIN_API_KEY or PLUGGEDIN_API_BASE_URL is missing for get_tools.");
      // Return error structure matching ToolExecutionResult
      return {
        isError: true,
        content: [{ type: "text", text: "Configuration Error: Missing API Key or Base URL." }],
      };
    }

    const cacheKey = `tools:${apiKey}`;

    // 1. Check cache first
    // 1. Check cache first
    const cachedToolNames = toolsCache.get(cacheKey);
    if (cachedToolNames) {
      logger.debug("Returning cached tool names.");
      // Return success structure matching ToolExecutionResult
      return {
        content: [{ type: "text", text: cachedToolNames }],
      };
    }

    logger.debug("Tools not found in cache, fetching from API...");

    try {
      // 2. Fetch tools from API if not cached
      const response = await axios.get(
        `${apiBaseUrl}/api/tools`, // Endpoint that returns all tools for the profile
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      // Check if the response structure is as expected
      if (!response.data || !Array.isArray(response.data.results)) {
        logger.error("Invalid response structure received from /api/tools:", response.data);
        // Return error structure matching ToolExecutionResult
        return {
          isError: true,
          content: [{ type: "text", text: "Error: Invalid response from API." }],
        };
      }

      // The API returns tool objects, we need to extract the names
      // Assuming the API returns objects with a 'name' and 'mcp_server_uuid'
      // We also need the server name for prefixing, which might require another API call or adjustment to /api/tools response
      
      // --- TEMPORARY WORKAROUND: Fetch server names separately ---
      // This adds an extra API call, ideally /api/tools should include server names
      let serverNames: Record<string, string> = {};
      try {
        const serversResponse = await axios.get(
          `${apiBaseUrl}/api/mcp-servers`, // Assuming this endpoint exists and returns { uuid: { name: ... } }
           { headers: { Authorization: `Bearer ${apiKey}` } }
        );
        if (serversResponse.data && typeof serversResponse.data === 'object') {
           // Assuming the response format is { [uuid]: { name: 'serverName', ... } }
           Object.entries(serversResponse.data).forEach(([uuid, serverData]: [string, any]) => {
             if (serverData && serverData.name) {
               serverNames[uuid] = serverData.name;
              }
            });
         } else {
            logger.warn("Invalid response structure from /api/mcp-servers");
         }
       } catch (serverFetchError) {
          logger.error("Error fetching server names for prefixing:", serverFetchError);
          // Proceed without prefixing if server names cannot be fetched
       }
      // --- END TEMPORARY WORKAROUND ---


      const toolsFromApi: Array<{ name: string; mcp_server_uuid: string; description?: string }> = response.data.results;

      // Map to prefixed names
      const toolNames = toolsFromApi.map(tool => {
         const serverName = serverNames[tool.mcp_server_uuid] || tool.mcp_server_uuid; // Fallback to UUID
         // Apply the same prefixing logic used during discovery/reporting
         // Assuming sanitizeName is available or reimplemented if needed
         const sanitize = (name: string) => name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
         return `${sanitize(serverName)}__${tool.name}`;
      });

      // Return the stringified list of prefixed tool names
      const resultString = JSON.stringify(toolNames, null, 2);

      // 3. Store the fetched result in the cache
      logger.debug(`Caching ${toolNames.length} tool names.`);
      toolsCache.set(cacheKey, resultString);

      // Return success structure matching ToolExecutionResult
      return {
        content: [{ type: "text", text: resultString }],
      };

    } catch (error) {
      logger.error("Error fetching tools via /api/tools:", error);
      // Return error structure matching ToolExecutionResult
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: `API Error: ${errorMessage}` }],
      };
    }
  }
}

// Register the plugin instance with the registry
pluginRegistry.register(new GetPluggedinToolsTool());
