import { ToolExecutionResult } from "../types.js";
import { getSession } from "../sessions.js";
import { getSessionKey } from "../utils.js";

// Declare global sessions type
declare global {
  var sessions: any;
}
import { logMcpActivity, createExecutionTimer } from "../notification-logger.js";
import { debugLog, debugError } from "../debug-log.js";
import { sanitizeErrorMessage } from "../security-utils.js";

// Type for tool to server mapping
export type ToolToServerMap = Record<string, { originalName: string; serverUuid: string; }>;

/**
 * Handles execution of dynamic tools from connected MCP servers.
 * Routes tool calls to the appropriate server based on the tool-to-server mapping.
 */
export class DynamicToolHandlers {
  constructor(
    private toolToServerMap: ToolToServerMap,
    private instructionToServerMap: Record<string, string>
  ) {}

  /**
   * Handle calls to dynamic tools (tools from connected MCP servers)
   */
  async handleDynamicTool(toolName: string, args: any): Promise<ToolExecutionResult | null> {
    // Check if this is a dynamic tool
    const toolMapping = this.toolToServerMap[toolName];
    if (!toolMapping) {
      return null; // Not a dynamic tool
    }

    const { originalName, serverUuid } = toolMapping;
    debugLog(`[CallTool Handler] Mapped tool ${toolName} to server ${serverUuid} with original name ${originalName}`);

    const sessions = global.sessions || {};
    let session: any = null;
    
    // Find session by server UUID
    // TODO: Consider refactoring to use direct serverUuid mapping instead of prefix matching
    // This would require updating session creation logic to use serverUuid as the key
    for (const [key, sess] of Object.entries(sessions)) {
      if (key.startsWith(serverUuid + '_')) {
        session = sess;
        break;
      }
    }
    
    if (!session || !session.client) {
      throw new Error(`No active session found for server ${serverUuid}. Please ensure the server is connected.`);
    }

    const timer = createExecutionTimer();
    try {
      debugLog(`[CallTool Handler] Calling tool ${originalName} on server ${serverUuid}`);
      const response = await session.client.request({
        method: "tools/call",
        params: { name: originalName, arguments: args ?? {} },
      });

      // Log successful tool call
      logMcpActivity({
        action: 'tool_call',
        serverName: session.serverName || 'unknown',
        serverUuid: serverUuid,
        itemName: originalName,
        success: true,
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors

      debugLog(`[CallTool Handler] Tool ${originalName} response:`, response);

      if (
        response &&
        typeof response === "object" &&
        Array.isArray(response.content)
      ) {
        // Standard response structure
        return {
          content: response.content,
          isError: !!response.isError,
        };
      } else if (
        response &&
        typeof response === "object" &&
        typeof response.content === "string"
      ) {
        // If content is a string, wrap it in the expected array structure
        return {
          content: [{ type: "text", text: response.content }],
          isError: !!response.isError,
        };
      } else {
        // Unexpected structure: log warning and return standardized error
        debugError(
          `[CallTool Handler] Unexpected response structure from tool ${originalName}:`,
          response
        );
        return {
          content: [
            {
              type: "text",
              text:
                "Tool response format was not recognized. Please contact support or try again.",
            },
          ],
          isError: true,
        };
      }
    } catch (toolError: any) {
      debugError(`[CallTool Handler] Error calling tool ${originalName}:`, toolError);
      
      // Log failed tool call
      logMcpActivity({
        action: 'tool_call',
        serverName: session.serverName || 'unknown',
        serverUuid: serverUuid,
        itemName: originalName,
        success: false,
        errorMessage: toolError instanceof Error ? toolError.message : String(toolError),
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors

      throw new Error(sanitizeErrorMessage(toolError));
    }
  }

  /**
   * Handle custom instruction execution
   */
  async handleCustomInstruction(instructionName: string, args: any): Promise<ToolExecutionResult | null> {
    const serverUuid = this.instructionToServerMap[instructionName];
    if (!serverUuid) {
      return null; // Not a custom instruction
    }

    const sessions = global.sessions || {};
    let session: any = null;
    
    // Find session by server UUID
    // TODO: Consider refactoring to use direct serverUuid mapping instead of prefix matching
    // This would require updating session creation logic to use serverUuid as the key
    for (const [key, sess] of Object.entries(sessions)) {
      if (key.startsWith(serverUuid + '_')) {
        session = sess;
        break;
      }
    }
    
    if (!session || !session.serverCapabilities) {
      throw new Error(`No active session found for server ${serverUuid}. Please ensure the server is connected.`);
    }

    const timer = createExecutionTimer();
    try {
      // Find the actual instruction content
      const server = session.serverCapabilities;
      const instruction = server?.customInstructions?.find((inst: any) => {
        // Instructions should have consistent names set during discovery
        if (!inst.name) {
          debugError(`[CustomInstruction Handler] Warning: Instruction without name found`);
          return false;
        }
        return inst.name === instructionName;
      });

      if (!instruction) {
        throw new Error(`Instruction ${instructionName} not found on server`);
      }

      // Log instruction execution
      logMcpActivity({
        action: 'tool_call' as const,
        serverName: session.serverName || 'unknown',
        serverUuid: serverUuid,
        itemName: instructionName,
        success: true,
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors

      // Return the instruction content
      return {
        content: [{ 
          type: "text", 
          text: `Executing custom instruction from ${session.serverName || 'unknown'}:\n\n${instruction.instruction}` 
        }],
        isError: false,
      };
    } catch (error: any) {
      // Log failed instruction execution
      logMcpActivity({
        action: 'tool_call' as const,
        serverName: session.serverName || 'unknown',
        serverUuid: serverUuid,
        itemName: instructionName,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors

      throw new Error(sanitizeErrorMessage(error));
    }
  }

  /**
   * Get tool information for a dynamic tool
   */
  getToolInfo(toolName: string): { originalName: string; serverUuid: string } | null {
    return this.toolToServerMap[toolName] || null;
  }

  /**
   * Get server UUID for a custom instruction
   */
  getInstructionServerUuid(instructionName: string): string | null {
    return this.instructionToServerMap[instructionName] || null;
  }
}