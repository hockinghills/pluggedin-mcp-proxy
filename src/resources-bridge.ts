// src/resources-bridge.ts
import { Resource } from "@modelcontextprotocol/sdk/types.js";
import { getInactiveTools } from "./fetch-tools.js";
import { getMcpServers } from "./fetch-pluggedinmcp.js";
import { getProfileCapabilities, ProfileCapability } from "./fetch-capabilities.js";
import axios from "axios";
import { getPluggedinMCPApiBaseUrl, getPluggedinMCPApiKey } from "./utils.js";

// Cache for tools converted to resources
let toolResourcesCache: Resource[] = [];
let lastCacheTime = 0;
const CACHE_TTL = 60000; // 1 minute cache

/**
 * Fetches tools from the database and converts them to resources
 * that can be displayed in the MCP inspector
 */
export async function getToolsAsResources(): Promise<Resource[]> {
  const now = Date.now();
  if (toolResourcesCache.length > 0 && now - lastCacheTime < CACHE_TTL) {
    return toolResourcesCache;
  }

  try {
    const apiKey = getPluggedinMCPApiKey();
    const apiBaseUrl = getPluggedinMCPApiBaseUrl();

    if (!apiKey) {
      console.error("API key not set, cannot fetch tools");
      return [];
    }

    // Fetch all tools from the API
    const response = await axios.get(
      `${apiBaseUrl}/api/tools`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!response.data || !response.data.results) {
      return [];
    }

    // Get server information to add context to resources
    const serverParams = await getMcpServers();
    const serverNames: Record<string, string> = {};
    
    // Create a mapping of server UUIDs to names
    Object.entries(serverParams).forEach(([uuid, params]) => {
      serverNames[uuid] = params.name || uuid;
    });

    // Convert tools to resources
    const resources: Resource[] = response.data.results.map((tool: any) => {
      const serverName = serverNames[tool.mcp_server_uuid] || "Unknown Server";
      
      // Corrected URI format as per Step 6
      return {
        uri: `mcp://tools/${tool.mcp_server_uuid}/${tool.name}`, // Corrected URI prefix
        name: `${serverName} "${tool.name}" tool`,
        description: tool.description || `Tool from ${serverName}`,
        mediaType: "application/json", // Keep as JSON since we return tool details
      };
    });

    // Update cache
    toolResourcesCache = resources;
    lastCacheTime = now;
    
    return resources;
  } catch (error) {
    console.error("Error fetching tools as resources:", error);
    return [];
  }
}
