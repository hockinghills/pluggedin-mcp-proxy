import axios from "axios";
import { getPluggedinMCPApiBaseUrl, getPluggedinMCPApiKey } from "./utils.js";
import { getMcpServers } from "./fetch-pluggedinmcp.js";
import { initSessions, getSession } from "./sessions.js";
import { getSessionKey } from "./utils.js";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";

// Define interface for tool data structure
export interface PluggedinMCPTool {
  name: string;
  description?: string;
  toolSchema: any;
  mcp_server_uuid: string;
}

// API route handler for submitting tools to PluggedinMCP
export async function reportToolsToPluggedinMCP(tools: PluggedinMCPTool[]) {
  try {
    const apiKey = getPluggedinMCPApiKey();
    const apiBaseUrl = getPluggedinMCPApiBaseUrl();

    if (!apiKey) {
      return { error: "API key not set" };
    }

    // Validate that tools is an array
    if (!Array.isArray(tools) || tools.length === 0) {
      return {
        error: "Request must include a non-empty array of tools",
        status: 400,
      };
    }

    // Validate required fields for all tools and prepare for submission
    const validTools = [];
    const errors = [];

    for (const tool of tools) {
      const { name, description, toolSchema, mcp_server_uuid } = tool;

      // Validate required fields for each tool
      if (!name || !toolSchema || !mcp_server_uuid) {
        errors.push({
          tool,
          error:
            "Missing required fields: name, toolSchema, or mcp_server_uuid",
        });
        continue;
      }

      validTools.push({
        name,
        description,
        toolSchema,
        mcp_server_uuid,
      });
    }

    // Submit valid tools to PluggedinMCP API
    let results: any[] = [];
    if (validTools.length > 0) {
      try {
        const response = await axios.post(
          `${apiBaseUrl}/api/tools`,
          { tools: validTools },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
          }
        );

        results = response.data.results || [];
      } catch (error: any) {
        if (error.response) {
          // The request was made and the server responded with a status code outside of 2xx
          return {
            error: error.response.data.error || "Failed to submit tools",
            status: error.response.status,
            details: error.response.data,
          };
        } else if (error.request) {
          // The request was made but no response was received
          return {
            error: "No response received from server",
            details: error.request,
          };
        } else {
          // Something happened in setting up the request
          return {
            error: "Error setting up request",
            details: error.message,
          };
        }
      }
    }

    return {
      results,
      errors,
      success: results.length > 0,
      failureCount: errors.length,
      successCount: results.length,
    };
  } catch (error: any) {
    return {
      error: "Failed to process tools request",
      status: 500,
    };
  }
}

// Function to fetch all MCP servers, initialize clients, and report tools to PluggedinMCP API
export async function reportAllTools() {
  console.log("Fetching all MCPs and initializing clients...");

  // Get all MCP servers
  const serverParams = await getMcpServers();

  // Initialize all sessions
  await initSessions();

  console.log(`Found ${Object.keys(serverParams).length} MCP servers`);

  // For each server, get its tools and report them
  await Promise.allSettled(
    Object.entries(serverParams).map(async ([uuid, params]) => {
      const sessionKey = getSessionKey(uuid, params);
      const session = await getSession(sessionKey, uuid, params);

      if (!session) {
        console.log(`Could not establish session for ${params.name} (${uuid})`);
        return;
      }

      const capabilities = session.client.getServerCapabilities();
      if (!capabilities?.tools) {
        console.log(`Server ${params.name} (${uuid}) does not support tools`);
        return;
      }

      try {
        console.log(`Fetching tools from ${params.name} (${uuid})...`);

        const result = await session.client.request(
          { method: "tools/list", params: {} },
          ListToolsResultSchema
        );

        if (result.tools && result.tools.length > 0) {
          console.log(
            `Reporting ${result.tools.length} tools from ${params.name} to PluggedinMCP API...`
          );

          const reportResult = await reportToolsToPluggedinMCP(
            result.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              toolSchema: tool.inputSchema,
              mcp_server_uuid: uuid,
            }))
          );

          console.log(
            `Reported tools from ${params.name}: ${reportResult.successCount} succeeded, ${reportResult.failureCount} failed`
          );
        } else {
          console.log(`No tools found for ${params.name}`);
        }
      } catch (error) {
        console.error(`Error reporting tools for ${params.name}:`, error);
      }
    })
  );

  console.log("Finished reporting all tools to PluggedinMCP API");
  process.exit(0);
}
