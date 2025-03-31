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
import { Cache } from "../cache.js";
import { container } from "../di-container.js"; // Import the DI container
import { Logger } from "../logging.js"; // Import Logger type for casting
import { ToolPlugin, pluginRegistry } from "../plugin-system.js"; // Import plugin system
import { ToolExecutionResult } from "../types.js"; // Import execution result type
// Define the structure for cache entries
interface ToolsCacheEntry {
  value: string; // JSON stringified list of tool names
  expiresAt: number;
}

// Define TTL constant (1 hour)
const TOOLS_CACHE_TTL_MS = 3600000;

const toolName = "get_tools";
const toolDescription = `
Retrieves the list of currently active and available proxied MCP tools managed by PluggedinMCP.
Use this tool first to discover which tools (like 'github__create_issue', 'google_calendar__list_events', etc.) are available before attempting to call them with 'tool_call'.
Requires a valid PluggedinMCP API key configured in the environment.
`;

const GetPluggedinToolsSchema = z.object({});

// Get logger and cache instances from the DI container
const logger = container.get<Logger>('logger');
// Update cache type to use the new entry structure
const toolsCache = container.get<Cache<ToolsCacheEntry>>('toolsCache');

/**
 * Helper function to fetch server names from the pluggedin-app API.
 * Used for prefixing tool names. Returns an empty object on failure.
 * @param apiBaseUrl - The base URL of the pluggedin-app API.
 * @param apiKey - The API key for authentication.
 * @returns A promise resolving to a record mapping server UUIDs to server names.
 */
async function _fetchServerNames(apiBaseUrl: string, apiKey: string): Promise<Record<string, string>> {
  const serverNames: Record<string, string> = {};
  try {
    logger.debug("Fetching server names for tool prefixing...");
    const serversResponse = await axios.get(
      `${apiBaseUrl}/api/mcp-servers`, // Assuming this endpoint exists
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (serversResponse.data && typeof serversResponse.data === 'object') {
      Object.entries(serversResponse.data).forEach(([uuid, serverData]: [string, any]) => {
        if (serverData && serverData.name) {
          serverNames[uuid] = serverData.name;
        }
      });
      logger.debug(`Fetched ${Object.keys(serverNames).length} server names.`);
    } else {
      logger.warn("Invalid response structure from /api/mcp-servers when fetching names.");
    }
  } catch (serverFetchError) {
    logger.error("Error fetching server names for prefixing:", serverFetchError);
    // Proceed without prefixing if server names cannot be fetched, returning empty map
  }
  return serverNames;
}

/**
 * ToolPlugin implementation for the 'get_tools' static tool.
 * Fetches the list of available proxied tools (names only) from the pluggedin-app API cache.
 */
export class GetPluggedinToolsTool implements ToolPlugin {
  readonly name = toolName;
  readonly description = toolDescription;
  readonly inputSchema = GetPluggedinToolsSchema;

  /**
   * Invalidates the cache entry for the current API key.
   * Intended to be called by the 'refresh_tools' plugin.
   */
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

  /**
   * Executes the 'get_tools' logic.
   * Checks the cache first, then fetches from the API if necessary.
   * Prefixes tool names with their server names (fetched separately).
   * @param args - Validated input arguments (empty object for this tool).
   * @param meta - Optional request metadata (not used by this tool).
   * @returns A promise resolving to a ToolExecutionResult containing the JSON stringified list of tool names.
   */
  async execute(
    args: z.infer<typeof GetPluggedinToolsSchema>,
    meta?: any
  ): Promise<ToolExecutionResult> {

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
    const cachedEntry = toolsCache.get(cacheKey);
    if (cachedEntry) {
      // Validate expiration using the logic from the updated Cache class (which already does this)
      // The Cache.get() method now returns null if expired, so this check is implicitly handled.
      logger.debug("Returning cached tool names.");
      // Return success structure matching ToolExecutionResult
      return {
        content: [{ type: "text", text: cachedEntry.value }], // Return the value from the entry
      };
      // Note: The explicit Date.now() < cachedEntry.expiresAt check is redundant
      // because the updated Cache.get() handles expiration internally.
      // Keeping the logic simple here.
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
      
      // Fetch server names using the helper function
      const serverNames = await _fetchServerNames(apiBaseUrl, apiKey);

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

      // 3. Store the fetched result in the cache using the CacheEntry structure
      logger.debug(`Caching ${toolNames.length} tool names.`);
      // Pass the full ToolsCacheEntry object. The Cache.set method will use its internal
      // logic to calculate the actual expiresAt for storage based on the TTL,
      // but TypeScript requires the object structure to match. We provide a placeholder.
      toolsCache.set(cacheKey, {
        value: resultString,
        expiresAt: 0 // Placeholder, Cache.set calculates the real one internally
      });


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
