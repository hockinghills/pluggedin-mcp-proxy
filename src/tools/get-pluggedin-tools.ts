import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  Tool,
  ListToolsResultSchema,
  CompatibilityCallToolResultSchema, // Keep for reference, but execute returns string now
} from "@modelcontextprotocol/sdk/types.js";
import { getMcpServers, ServerParameters } from "../fetch-pluggedinmcp.js"; // Import ServerParameters
import { getSessionKey, sanitizeName, getPluggedinMCPApiKey } from "../utils.js"; // Import getPluggedinMCPApiKey
import { getSession } from "../sessions.js";
import { reportToolsToPluggedinMCP } from "../report-tools.js";
import { getInactiveTools, ToolParameters } from "../fetch-tools.js";
import {
  getProfileCapabilities,
  ProfileCapability,
} from "../fetch-capabilities.js";

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

  // This method will be called by the MCP server when the tool is invoked
  static async execute(
    requestMeta: any 
  ): Promise<any> { // Change return type to any for this workaround
    
    const toolToClientMapping: Record<string, any> = {}; 

    const apiKey = getPluggedinMCPApiKey(); 
    if (!apiKey) {
      // console.warn("PLUGGEDIN_API_KEY is missing during get_tools execution. Returning empty list."); // Removed log
      // Return empty array string directly
      return "[]"; 
    }

    // Fetch necessary data (handle potential errors within these functions if needed)
    let profileCapabilities: ProfileCapability[] = [];
    let serverParams: Record<string, ServerParameters> = {};
    let inactiveTools: Record<string, ToolParameters> = {};

    try {
      profileCapabilities = await getProfileCapabilities(true);
      serverParams = await getMcpServers(true); 
      if (profileCapabilities.includes(ProfileCapability.TOOLS_MANAGEMENT)) {
        inactiveTools = await getInactiveTools(true);
      }
    } catch (fetchError) {
       console.error("Error fetching initial data for get_tools:", fetchError);
       // Return empty array string on error
       return "[]"; 
    }


    if (Object.keys(serverParams).length === 0) {
       // console.warn("No downstream MCP servers found or fetched."); // Removed log
       // Return empty array string if no servers found
       return "[]"; 
    }


    const allProxiedTools: Tool[] = [];

    await Promise.allSettled(
      Object.entries(serverParams).map(async ([uuid, params]) => {
        const sessionKey = getSessionKey(uuid, params);
        const session = await getSession(sessionKey, uuid, params);
        if (!session) return;

        const capabilities = session.client.getServerCapabilities();
        if (!capabilities?.tools) return;

        const serverName = session.client.getServerVersion()?.name || "";
        try {
          const result = await session.client.request(
            {
              method: "tools/list",
              params: { _meta: requestMeta }, 
            },
            ListToolsResultSchema
          );

          const toolsWithSource =
            result.tools
              ?.filter((tool) => {
                if (
                  profileCapabilities.includes(
                    ProfileCapability.TOOLS_MANAGEMENT
                  )
                ) {
                  return !inactiveTools[`${uuid}:${tool.name}`];
                }
                return true;
              })
              .map((tool) => {
                const prefixedToolName = `${sanitizeName(serverName)}__${
                  tool.name
                }`;
                toolToClientMapping[prefixedToolName] = session; // This mapping needs to be handled by CallPluggedinToolTool
                return {
                  ...tool,
                  name: prefixedToolName,
                  description: `[${serverName}] ${tool.description || ""}`,
                };
              }) || [];

          // Reporting tools here might be redundant if done elsewhere, but kept for now
          if (
            profileCapabilities.includes(ProfileCapability.TOOLS_MANAGEMENT) &&
            result.tools
          ) {
            reportToolsToPluggedinMCP(
              result.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                toolSchema: tool.inputSchema,
                mcp_server_uuid: uuid,
              }))
            ).catch((err) =>
              console.error("Error reporting tools during get_pluggedin_tools:", err) // Keep essential error logs
            );
          }

          allProxiedTools.push(...toolsWithSource);
        } catch (error) {
          console.error( // Keep essential error logs
            `Error fetching tools from: ${serverName} during get_pluggedin_tools`,
            error
          );
        }
      })
    );

    // Extract just the names
    const toolNames = allProxiedTools.map(tool => tool.name);
    
    // Return the stringified list of tool names directly
    return JSON.stringify(toolNames, null, 2); 
  }
}
