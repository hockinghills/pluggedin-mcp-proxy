import { z } from "zod";
import { container } from "../di-container.js";
import { Logger } from "../logging.js";
import { ToolPlugin, pluginRegistry } from "../plugin-system.js";
import { ToolExecutionResult } from "../types.js";
import { reportAllCapabilities } from "../report-tools.js"; // Import the reporting function
import { GetPluggedinToolsTool } from "./get-pluggedin-tools.js"; // Import to invalidate cache

const toolName = "refresh_tools";
const toolDescription = `
Triggers a live discovery of tools and resources from all configured downstream MCP servers and updates the cache.
This operation runs in the background and might take some time. Use 'get_tools' again after a short delay to see updated results.
`;

// Define the input schema (no arguments needed)
const RefreshToolsSchema = z.object({});

// Get logger instance from the DI container
const logger = container.get<Logger>('logger');

/**
 * ToolPlugin implementation for the 'refresh_tools' static tool.
 * Invalidates the tool cache and triggers a background process to rediscover
 * and report capabilities from all downstream servers.
 */
export class RefreshToolsPlugin implements ToolPlugin {
  readonly name = toolName;
  readonly description = toolDescription;
  readonly inputSchema = RefreshToolsSchema;

  /**
   * Executes the 'refresh_tools' logic.
   * Invalidates the cache and starts the background reporting process.
   * Returns immediately with a confirmation message.
   * @param args - Validated input arguments (empty object for this tool).
   * @param meta - Optional request metadata (not used by this tool).
   * @returns A promise resolving to a ToolExecutionResult confirming the process initiation.
   */
  async execute(
    args: z.infer<typeof RefreshToolsSchema>,
    meta?: any
  ): Promise<ToolExecutionResult> {
    logger.info("Refresh tools request received. Invalidating cache and starting background refresh...");

    // Invalidate the tools cache immediately
    // Note: We access invalidateCache statically as defined in GetPluggedinToolsTool
    GetPluggedinToolsTool.invalidateCache();
    // TODO: Invalidate resource cache if/when implemented

    // Execute the live discovery and reporting process in the background
    // We don't await this promise, letting it run independently.
    reportAllCapabilities().catch((err: any) => {
      // Log errors from the background refresh process
      logger.error("Error during background capability refresh:", err);
    });

    // Return immediately with a success message
    return {
      content: [
        { type: "text", text: "Capability refresh process initiated in the background. Use 'get_tools' again shortly to see updates." },
      ],
    };
  }
}

// Register the plugin instance with the registry
pluginRegistry.register(new RefreshToolsPlugin());
