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

const toolName = "get_tools"; 
const toolDescription = `
Retrieves the list of currently active and available proxied MCP tools managed by PluggedinMCP.
Use this tool first to discover which tools (like 'github__create_issue', 'google_calendar__list_events', etc.) are available before attempting to call them with 'tool_call'.
Requires a valid PluggedinMCP API key configured in the environment.
`;

const GetPluggedinToolsSchema = z.object({});

export class GetPluggedinToolsTool {
  static toolName = toolName;
  static description = toolDescription;
  static inputSchema = GetPluggedinToolsSchema;

  // This method fetches the cached tool list from the pluggedin-app API
  static async execute(
    requestMeta: any // requestMeta might not be needed anymore, but kept for signature consistency
  ): Promise<string> { // Return type is string (JSON array of names)

    const apiKey = getPluggedinMCPApiKey();
    const apiBaseUrl = getPluggedinMCPApiBaseUrl();

    if (!apiKey || !apiBaseUrl) {
      console.error("PLUGGEDIN_API_KEY or PLUGGEDIN_API_BASE_URL is missing for get_tools.");
      return "[]"; // Return empty JSON array string on configuration error
    }

    try {
      // Fetch the cached tools from the pluggedin-app API
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
        console.error("Invalid response structure received from /api/tools:", response.data);
        return "[]";
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
           console.error("Invalid response structure from /api/mcp-servers");
        }
      } catch (serverFetchError) {
         console.error("Error fetching server names for prefixing:", serverFetchError);
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
      return JSON.stringify(toolNames, null, 2);

    } catch (error) {
      console.error("Error fetching cached tools via /api/tools:", error);
      // Return empty JSON array string on API error
      return "[]";
    }
  }
}
