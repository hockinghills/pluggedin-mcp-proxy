import axios from "axios";
import { getPluggedinMCPApiBaseUrl, getPluggedinMCPApiKey } from "./utils.js";
import { getMcpServers } from "./fetch-pluggedinmcp.js";
import { initSessions, getSession } from "./sessions.js";
import { getSessionKey, sanitizeName } from "./utils.js"; // Added sanitizeName
import { ListToolsResultSchema, ListResourcesResultSchema, Resource as SdkResource } from "@modelcontextprotocol/sdk/types.js";
import { container } from "./di-container.js";
import { Logger } from "./logging.js";
import { PluggedinMCPToolReport, PluggedinMCPResourceReport, ResourceInfo, ToolSchema } from "./types.js";
import { clearToolOriginMap, registerToolOrigin } from './tool-registry.js'; // Import registry functions

// Removed local PluggedinMCPTool interface, using PluggedinMCPToolReport from types.ts

// Define the expected return type for report functions for clarity
interface ReportResult {
  successCount: number;
  failureCount: number;
  errors: { item: any, error: string }[]; // Generic error structure
  results?: any[]; // Optional results array for tools
  success?: boolean; // Optional success flag for tools
  error?: string; // Top-level error message
  status?: number; // HTTP status code for errors
  details?: any; // Additional error details
}

// Get logger instance from the DI container
const logger = container.get<Logger>('logger');

// API route handler for submitting tools to PluggedinMCP
export async function reportToolsToPluggedinMCP(tools: PluggedinMCPToolReport[]): Promise<ReportResult> {
  try {
    const apiKey = getPluggedinMCPApiKey();
    const apiBaseUrl = getPluggedinMCPApiBaseUrl();

    if (!apiKey || !apiBaseUrl) { // Also check apiBaseUrl
      logger.error("API key or base URL not set for reporting tools");
      // Return full ReportResult structure
      return { error: "API key or base URL not set", successCount: 0, failureCount: 0, errors: [] };
    }

    // Validate that tools is an array
    if (!Array.isArray(tools) || tools.length === 0) {
      // Return full ReportResult structure
      return {
        error: "Request must include a non-empty array of tools",
        status: 400,
        successCount: 0,
        failureCount: 0,
        errors: []
      };
    }

    // Validate required fields for all tools and prepare for submission
    const validTools: PluggedinMCPToolReport[] = [];
    const errors: { tool: PluggedinMCPToolReport, error: string }[] = [];

    for (const tool of tools) {
      // Destructure using the imported type definition
      const { name, description, inputSchema, mcp_server_uuid, status } = tool;

      // Validate required fields for each tool
      // Note: inputSchema is the correct field name from the Tool type
      if (!name || !inputSchema || !mcp_server_uuid) {
        errors.push({
          tool,
          error:
            "Missing required fields: name, inputSchema, or mcp_server_uuid",
        });
        continue;
      }

      // Push the validated tool using the correct type structure
      validTools.push({
        name,
        description,
        inputSchema: inputSchema, // Use the correct field name from the type
        mcp_server_uuid,
        status: status || "ACTIVE", // Default status if not provided
      });
    }

    // Prepare payload for API, potentially mapping field names if needed
    const apiPayload = {
       tools: validTools.map(vt => ({
          name: vt.name,
          description: vt.description,
          toolSchema: vt.inputSchema, // Send inputSchema as toolSchema to API
          mcp_server_uuid: vt.mcp_server_uuid,
          status: vt.status
       }))
    };

    // Submit valid tools to PluggedinMCP API
    let results: any[] = [];
    if (apiPayload.tools.length > 0) {
      try {
        const response = await axios.post(
          `${apiBaseUrl}/api/tools`,
          apiPayload, // Send the prepared payload
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
          }
        );

        results = response.data.results || [];
      } catch (error: any) {
        const errorMessage = error.response?.data?.error || error.message || "Unknown error submitting tools";
        const errorStatus = error.response?.status;
        logger.error(`Error submitting tools to API: ${errorMessage}`, { status: errorStatus, details: error.response?.data || error.request || error.message });
        // Return a consistent error structure
        return {
          error: errorMessage,
          status: errorStatus || 500,
          details: error.response?.data || error.request || error.message,
          successCount: 0,
          failureCount: apiPayload.tools.length, // Use payload length
          errors: apiPayload.tools.map(t => ({ item: t, error: 'API call failed' })), // Use generic item
        };
      }
    }

    // Ensure the return type matches ReportResult
    return {
      results: results, // API results if successful
      errors: errors.map(e => ({ item: e.tool, error: e.error })), // Validation errors
      success: results.length > 0 && errors.length === 0, // Consider validation errors
      failureCount: errors.length,
      successCount: results.length, // Assuming API returns results for successes
    };
  } catch (error: any) {
    logger.error("Unexpected error in reportToolsToPluggedinMCP:", error);
    return {
      error: "Failed to process tools request",
      details: error.message,
      status: 500,
      successCount: 0,
      failureCount: tools.length, // Assume all failed
      errors: tools.map(t => ({ item: t, error: 'Unexpected error' })), // Use generic item
    };
  }
}

// Define the input type more clearly using ResourceInfo
type ResourceReportInput = ResourceInfo & { mcp_server_uuid: string };

// API route handler for submitting resources to PluggedinMCP
export async function reportResourcesToPluggedinMCP(resources: ResourceReportInput[]): Promise<ReportResult> {
  try {
    const apiKey = getPluggedinMCPApiKey();
    const apiBaseUrl = getPluggedinMCPApiBaseUrl();

    if (!apiKey || !apiBaseUrl) {
      logger.error("API key or base URL not set for reporting resources");
      // Return full ReportResult structure
      return { error: "API key or base URL not set", successCount: 0, failureCount: 0, errors: [] };
    }

    if (!Array.isArray(resources) || resources.length === 0) {
      // It's okay to report zero resources if a server has none
      return { successCount: 0, failureCount: 0, errors: [] };
    }

    // Prepare data for submission, mapping to the expected API structure
    const apiPayload = {
       resources: resources.map(res => ({
         uri: res.uri,
         name: res.name,
         description: res.description,
         mime_type: res.mediaType, // Map mediaType to mime_type for the API
         mcp_server_uuid: res.mcp_server_uuid,
       }))
    };


    const response = await axios.post(
      `${apiBaseUrl}/api/resources`, // Use the new endpoint
      apiPayload, // Send the prepared payload
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
     const errorMessage = error.response?.data?.error || error.message || "Unknown error reporting resources";
     logger.error("Error reporting resources to PluggedinMCP API:", errorMessage, { details: error.response?.data || error.message });
     return {
       error: errorMessage,
       details: error.response?.data || error.message,
       successCount: 0,
       failureCount: resources.length, // Assume all failed if API call fails
       errors: resources.map(r => ({ item: r, error: 'API call failed' })), // Use generic item
     };
  }
}

// Interface for the result of reportAllCapabilities
interface ReportAllResult {
  totalServers: number;
  processedServers: number;
  successfulServers: number;
  failedServers: number;
  errors: { server: string; error: string }[];
  totalToolsReported: number;
  totalResourcesReported: number;
}

// Function to fetch all MCP servers, initialize clients, and report capabilities (tools AND resources)
// Implements parallel processing with concurrency control and improved error reporting.
export async function reportAllCapabilities(concurrency = 3): Promise<ReportAllResult> {
  logger.info(`Starting capability reporting with concurrency ${concurrency}...`);

  // Clear the existing tool origin map before starting discovery
  clearToolOriginMap();

  const results: ReportAllResult = {
    totalServers: 0,
    processedServers: 0,
    successfulServers: 0,
    failedServers: 0,
    errors: [],
    totalToolsReported: 0,
    totalResourcesReported: 0,
  };

  try {
    // Get all MCP servers
    const serverParams = await getMcpServers();
    const serverEntries = Object.entries(serverParams);
    results.totalServers = serverEntries.length;
    logger.info(`Found ${results.totalServers} MCP servers to process.`);

    // Initialize all sessions (can still be done sequentially before parallel processing)
    await initSessions();
    logger.info("Sessions initialized.");

    // Process servers in parallel batches
    for (let i = 0; i < serverEntries.length; i += concurrency) {
      const batch = serverEntries.slice(i, i + concurrency);
      logger.debug(`Processing batch ${Math.floor(i / concurrency) + 1} with ${batch.length} servers...`);

      await Promise.allSettled(
        batch.map(async ([uuid, params]) => {
          const serverName = params.name || uuid;
          let serverProcessed = false;
          let serverSucceeded = false;
          let serverToolsReported = 0;
          let serverResourcesReported = 0;

          try {
            const sessionKey = getSessionKey(uuid, params);
            const session = await getSession(sessionKey, uuid, params);

            if (!session) {
              throw new Error(`Could not establish session`);
            }

            const capabilities = session.client.getServerCapabilities();
            logger.debug(`Processing server: ${serverName} (UUID: ${uuid})`);

            // --- Report Tools ---
            if (capabilities?.tools) {
              logger.debug(`Fetching tools from ${serverName}...`);
              const toolResult = await session.client.request(
                { method: "tools/list", params: {} },
                ListToolsResultSchema
              );

              if (toolResult.tools && toolResult.tools.length > 0) {
                logger.debug(`Found ${toolResult.tools.length} tools from ${serverName}. Registering origins and reporting...`);
                const toolsToReport: PluggedinMCPToolReport[] = [];

                // Register origin and prepare report data
                toolResult.tools.forEach((tool) => {
                  const prefixedToolName = `${sanitizeName(serverName)}__${tool.name}`;
                  registerToolOrigin(prefixedToolName, sessionKey); // Register origin mapping
                  toolsToReport.push({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema as ToolSchema,
                    mcp_server_uuid: uuid,
                    status: "ACTIVE", // Assuming default status
                  });
                });

                // Report tools to the API
                const reportResult = await reportToolsToPluggedinMCP(toolsToReport);
                serverToolsReported = reportResult.successCount || 0; // Assuming API returns success count correctly
                if (reportResult.failureCount && reportResult.failureCount > 0) {
                   logger.warn(`Failed to report ${reportResult.failureCount} tools from ${serverName}. Errors: ${JSON.stringify(reportResult.errors)}`);
                }
                logger.debug(`Reported ${serverToolsReported} tools from ${serverName}.`);
              } else {
                logger.debug(`No tools found for ${serverName}`);
              }
            } else {
              logger.debug(`Server ${serverName} does not support tools`);
            }

            // --- Report Resources ---
            if (capabilities?.resources) {
              logger.debug(`Fetching resources from ${serverName}...`);
              const resourceResult = await session.client.request(
                { method: "resources/list", params: {} },
                ListResourcesResultSchema
              );

              if (resourceResult.resources && resourceResult.resources.length > 0) {
                logger.debug(`Reporting ${resourceResult.resources.length} resources from ${serverName}...`);
                // Map SDK Resource to ResourceReportInput, casting mediaType
                const resourcesToReport: ResourceReportInput[] = resourceResult.resources.map((res: SdkResource) => ({
                  uri: res.uri,
                  name: res.name,
                  description: res.description,
                  mediaType: res.mediaType as string | undefined, // Cast mediaType
                  mcp_server_uuid: uuid, // Add the server UUID
                }));

                const reportResult = await reportResourcesToPluggedinMCP(resourcesToReport);
                serverResourcesReported = reportResult.successCount || 0;
                 if (reportResult.failureCount && reportResult.failureCount > 0) {
                   logger.warn(`Failed to report ${reportResult.failureCount} resources from ${serverName}. Errors: ${JSON.stringify(reportResult.errors)}`);
                 }
                logger.debug(`Reported ${serverResourcesReported} resources from ${serverName}.`);
              } else {
                logger.debug(`No resources found for ${serverName}`);
              }
            } else {
              logger.debug(`Server ${serverName} does not support resources`);
            }

            serverProcessed = true;
            serverSucceeded = true; // Mark as succeeded if no errors thrown during processing

          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Error processing server ${serverName}: ${errorMessage}`);
            results.errors.push({ server: serverName, error: errorMessage });
            serverProcessed = true; // Still counts as processed even if failed
            serverSucceeded = false;
          } finally {
             // Aggregate results safely after each server attempt
             if (serverProcessed) results.processedServers++;
             if (serverSucceeded) results.successfulServers++; else results.failedServers++;
             results.totalToolsReported += serverToolsReported;
             results.totalResourcesReported += serverResourcesReported;
          }
        })
      );
    }

    logger.info(`Finished reporting capabilities. Summary: ${JSON.stringify({ processed: results.processedServers, success: results.successfulServers, failed: results.failedServers, tools: results.totalToolsReported, resources: results.totalResourcesReported })}`);
    if (results.errors.length > 0) {
       logger.warn(`Encountered ${results.errors.length} errors during reporting. Check details: ${JSON.stringify(results.errors)}`);
    }

  } catch (error) {
     const errorMessage = error instanceof Error ? error.message : String(error);
     logger.error(`Fatal error during capability reporting setup: ${errorMessage}`);
     // Add the fatal error to the results
     results.errors.push({ server: "Setup", error: `Fatal error: ${errorMessage}` });
     // Mark all servers as failed if setup fails
     results.processedServers = results.totalServers;
     results.failedServers = results.totalServers;
  }

  return results;
}
