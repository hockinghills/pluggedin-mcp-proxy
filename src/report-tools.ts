import axios from "axios";
import { getPluggedinMCPApiBaseUrl, getPluggedinMCPApiKey } from "./utils.js";
import { getMcpServers } from "./fetch-pluggedinmcp.js";
import { initSessions, getSession } from "./sessions.js";
import { getSessionKey } from "./utils.js";
import { ListToolsResultSchema, ListResourcesResultSchema, Resource } from "@modelcontextprotocol/sdk/types.js"; // Added ListResourcesResultSchema, Resource

// Define interface for tool data structure
export interface PluggedinMCPTool {
  name: string;
  description?: string;
  toolSchema: any;
  mcp_server_uuid: string;
  status?: string; // Add status field
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

// API route handler for submitting resources to PluggedinMCP
// Similar to reportToolsToPluggedinMCP but for resources
export async function reportResourcesToPluggedinMCP(resources: Array<Omit<Resource, 'content' | 'contents' | 'error'> & { mcp_server_uuid: string }>) {
  try {
    const apiKey = getPluggedinMCPApiKey();
    const apiBaseUrl = getPluggedinMCPApiBaseUrl();

    if (!apiKey || !apiBaseUrl) {
      console.error("API key or base URL not set for reporting resources");
      return { error: "API key or base URL not set" };
    }

    if (!Array.isArray(resources) || resources.length === 0) {
      // It's okay to report zero resources if a server has none
      return { successCount: 0, failureCount: 0, errors: [] };
    }

    // Prepare data for submission (ensure required fields are present)
    const validResources = resources.map(res => ({
      uri: res.uri,
      name: res.name,
      description: res.description,
      mime_type: res.mediaType, // Map mediaType to mime_type for the API
      mcp_server_uuid: res.mcp_server_uuid,
    }));

    const response = await axios.post(
      `${apiBaseUrl}/api/resources`, // Use the new endpoint
      { resources: validResources },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    return {
      successCount: response.data.successCount || 0,
      failureCount: response.data.errorCount || 0,
      errors: response.data.errors || [],
    };

  } catch (error: any) {
     console.error("Error reporting resources to PluggedinMCP API:", error.response?.data || error.message);
     return {
       error: "Failed to report resources",
       details: error.response?.data || error.message,
       successCount: 0,
       failureCount: resources.length, // Assume all failed if API call fails
       errors: resources.map(r => ({ resource: r, error: 'API call failed' })),
     };
  }
}


// Function to fetch all MCP servers, initialize clients, and report capabilities (tools AND resources)
export async function reportAllCapabilities() { // Renamed function
  // console.log("Fetching all MCPs and initializing clients..."); // Removed log

  // Get all MCP servers
  const serverParams = await getMcpServers();

  // Initialize all sessions
  await initSessions();

  // console.log(`Found ${Object.keys(serverParams).length} MCP servers`); // Removed log

  // For each server, get its capabilities and report them
  await Promise.allSettled(
    Object.entries(serverParams).map(async ([uuid, params]) => {
      const sessionKey = getSessionKey(uuid, params);
      const session = await getSession(sessionKey, uuid, params);

      if (!session) {
        // console.log(`Could not establish session for ${params.name} (${uuid})`); // Removed log
        return;
      }

      const capabilities = session.client.getServerCapabilities();
      const serverName = params.name || uuid;

      // --- Report Tools ---
      if (capabilities?.tools) {
        try {
          // console.log(`Fetching tools from ${serverName}...`); // Removed log
          const toolResult = await session.client.request(
            { method: "tools/list", params: {} },
            ListToolsResultSchema
          );

          if (toolResult.tools && toolResult.tools.length > 0) {
            // console.log(`Reporting ${toolResult.tools.length} tools from ${serverName}...`); // Removed log
            const reportResult = await reportToolsToPluggedinMCP(
              toolResult.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                toolSchema: tool.inputSchema,
                mcp_server_uuid: uuid,
                status: "ACTIVE",
              }))
            );
            // console.log(`Reported tools from ${serverName}: ${reportResult.successCount} succeeded, ${reportResult.failureCount} failed`); // Removed log
          } else {
            // console.log(`No tools found for ${serverName}`); // Removed log
          }
        } catch (error) {
          console.error(`Error reporting tools for ${serverName}:`, error); // Keep essential error logs
        }
      } else {
         // console.log(`Server ${serverName} does not support tools`); // Removed log
      }

      // --- Report Resources ---
      if (capabilities?.resources) {
         try {
           // console.log(`Fetching resources from ${serverName}...`); // Removed log
           const resourceResult = await session.client.request(
             { method: "resources/list", params: {} },
             ListResourcesResultSchema
           );

           if (resourceResult.resources && resourceResult.resources.length > 0) {
             // console.log(`Reporting ${resourceResult.resources.length} resources from ${serverName}...`); // Removed log
             const reportResult = await reportResourcesToPluggedinMCP(
               resourceResult.resources.map((res) => ({
                 ...res, // Spread the resource object
                 mcp_server_uuid: uuid, // Add the server UUID
               }))
             );
             // console.log(`Reported resources from ${serverName}: ${reportResult.successCount} succeeded, ${reportResult.failureCount} failed`); // Removed log
           } else {
             // console.log(`No resources found for ${serverName}`); // Removed log
           }
         } catch (error) {
           console.error(`Error reporting resources for ${serverName}:`, error); // Keep essential error logs
         }
      } else {
         // console.log(`Server ${serverName} does not support resources`); // Removed log
      }
    })
  );

  // console.log("Finished reporting all capabilities to PluggedinMCP API"); // Removed log
}
