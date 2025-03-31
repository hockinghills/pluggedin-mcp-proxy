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
  errors?: { item: any, error: string }[]; // Keep for general/unexpected errors or backward compatibility
  validationErrors?: { item: any, error: string }[]; // For input/config validation issues
  apiErrors?: { item: any, error: string }[]; // For errors during the API call itself
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

    // Configuration Error Handling
    if (!apiKey || !apiBaseUrl) {
      logger.error("API key or base URL not set for reporting tools");
      return {
        error: "Configuration Error",
        validationErrors: [{ item: 'Configuration', error: "API key or base URL not set" }],
        successCount: 0,
        failureCount: tools.length, // Assume all fail if config is bad
        apiErrors: [],
        errors: []
      };
    }

    // Input Validation: Basic check
    if (!Array.isArray(tools)) { // Removed || tools.length === 0 check, empty array is valid input but results in no API call
      return {
        error: "Input Error",
        validationErrors: [{ item: 'Input', error: "Request must include an array of tools" }],
        status: 400,
        successCount: 0,
        failureCount: 0, // No tools attempted
        apiErrors: [],
        errors: []
      };
    }

    // Input Validation: Per-tool check
    const validTools: PluggedinMCPToolReport[] = [];
    const validationFailures: { item: PluggedinMCPToolReport, error: string }[] = [];

    for (const tool of tools) {
      const { name, description, inputSchema, mcp_server_uuid, status } = tool;
      if (!name || !inputSchema || !mcp_server_uuid) {
        validationFailures.push({
          item: tool,
          error: "Missing required fields: name, inputSchema, or mcp_server_uuid",
        });
      } else {
        validTools.push({
          name,
          description,
          inputSchema: inputSchema,
          mcp_server_uuid,
          status: status || "ACTIVE",
        });
      }
    }

    // Prepare payload only with valid tools
    const apiPayload = {
       tools: validTools.map(vt => ({
          name: vt.name,
          description: vt.description,
          toolSchema: vt.inputSchema,
          mcp_server_uuid: vt.mcp_server_uuid,
          status: vt.status
       }))
    };

    let apiResults: any[] = [];
    let apiCallErrors: { item: any, error: string }[] = [];
    let apiErrorMessage: string | undefined = undefined;
    let apiErrorStatus: number | undefined = undefined;
    let apiErrorDetails: any = undefined;

    // Submit valid tools to PluggedinMCP API only if there are valid tools
    if (apiPayload.tools.length > 0) {
      try {
        const response = await axios.post(
          `${apiBaseUrl}/api/tools`,
          apiPayload,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
          }
        );
        // Assuming response.data.results contains results for successfully processed tools
        // and potentially errors for individual tool failures within a successful call.
        // Adjust based on actual API behavior. For now, assume `results` are successes.
        apiResults = response.data.results || [];
        // TODO: Handle potential individual errors returned in response.data if the API supports it.

      } catch (error: any) {
        // API Call Error Handling
        apiErrorMessage = error.response?.data?.error || error.message || "Unknown error submitting tools";
        apiErrorStatus = error.response?.status;
        apiErrorDetails = error.response?.data || error.request || error.message;
        logger.error(`Error submitting tools to API: ${apiErrorMessage}`, { status: apiErrorStatus, details: apiErrorDetails });
        // Mark all attempted tools as failed due to API error
        apiCallErrors = apiPayload.tools.map(t => ({ item: t, error: `API call failed: ${apiErrorMessage}` }));
      }
    } else {
       logger.debug("No valid tools to submit after validation.");
    }

    // Consolidate Results
    const totalFailures = validationFailures.length + apiCallErrors.length;
    const totalSuccesses = apiResults.length; // Assuming apiResults only contains successes

    return {
      successCount: totalSuccesses,
      failureCount: totalFailures,
      validationErrors: validationFailures,
      apiErrors: apiCallErrors,
      results: apiResults,
      success: totalFailures === 0 && tools.length > 0, // Overall success if no validation or API errors occurred for non-empty input
      error: apiErrorMessage, // Top-level error from API call if it failed
      status: apiErrorStatus,
      details: apiErrorDetails,
      errors: [] // Clear generic errors if specific ones are populated
    };

  } catch (error: any) {
    // General/Unexpected Error Handling
    logger.error("Unexpected error in reportToolsToPluggedinMCP:", error);
    return {
      error: "Unexpected error processing tools request",
      details: error.message,
      status: 500,
      successCount: 0,
      failureCount: tools.length, // Assume all failed
      errors: tools.map(t => ({ item: t, error: `Unexpected error: ${error.message}` })), // Populate generic errors
      validationErrors: [],
      apiErrors: []
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
