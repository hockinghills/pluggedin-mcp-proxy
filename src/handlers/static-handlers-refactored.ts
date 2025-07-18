import { ToolExecutionResult } from "../types.js";
import { NotificationHandlers } from "./notification-handlers.js";
import { DocumentHandlers } from "./document-handlers.js";
import { SetupHandlers } from "./setup-handlers.js";

// Type for tool to server mapping
export type ToolToServerMap = Record<string, { originalName: string; serverUuid: string; }>;

/**
 * Handles execution of static tools that are built into the Plugged.in MCP proxy.
 * Delegates to domain-specific handlers for better organization and maintainability.
 */
export class StaticToolHandlers {
  private notificationHandlers: NotificationHandlers;
  private documentHandlers: DocumentHandlers;
  private setupHandlers: SetupHandlers;

  constructor(
    private toolToServerMap: ToolToServerMap,
    private instructionToServerMap: Record<string, string>
  ) {
    this.notificationHandlers = new NotificationHandlers();
    this.documentHandlers = new DocumentHandlers();
    this.setupHandlers = new SetupHandlers(toolToServerMap, instructionToServerMap);
  }

  /**
   * Route tool calls to appropriate domain handlers
   */
  async handleStaticTool(toolName: string, args: any): Promise<ToolExecutionResult | null> {
    switch (toolName) {
      // Setup and discovery tools
      case 'pluggedin_setup':
        return this.setupHandlers.handleSetup(args);
      case 'pluggedin_discover_tools':
        return this.setupHandlers.handleDiscoverTools(args);
      case 'pluggedin_rag_query':
        return this.setupHandlers.handleRagQuery(args);

      // Notification tools
      case 'pluggedin_send_notification':
        return this.notificationHandlers.handleSendNotification(args);
      case 'pluggedin_list_notifications':
        return this.notificationHandlers.handleListNotifications(args);
      case 'pluggedin_mark_notification_read':
        return this.notificationHandlers.handleMarkNotificationRead(args);
      case 'pluggedin_delete_notification':
        return this.notificationHandlers.handleDeleteNotification(args);

      // Document tools
      case 'pluggedin_create_document':
        return this.documentHandlers.handleCreateDocument(args);
      case 'pluggedin_list_documents':
        return this.documentHandlers.handleListDocuments(args);
      case 'pluggedin_search_documents':
        return this.documentHandlers.handleSearchDocuments(args);
      case 'pluggedin_get_document':
        return this.documentHandlers.handleGetDocument(args);
      case 'pluggedin_update_document':
        return this.documentHandlers.handleUpdateDocument(args);

      default:
        return null; // Not a static tool
    }
  }
}