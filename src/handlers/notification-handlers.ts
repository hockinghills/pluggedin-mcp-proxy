import { ToolExecutionResult } from "../types.js";
import { getPluggedinMCPApiKey, getPluggedinMCPApiBaseUrl } from "../utils.js";
import { logMcpActivity, createExecutionTimer } from "../notification-logger.js";
import { debugLog, debugError } from "../debug-log.js";
import { getApiKeySetupMessage } from "./static-handlers-helpers.js";
import { makeApiRequest, buildUrl } from "../http-client.js";
import {
  SendNotificationInputSchema,
  ListNotificationsInputSchema,
  MarkNotificationReadInputSchema,
  DeleteNotificationInputSchema
} from '../schemas/index.js';
import {
  sendNotificationStaticTool,
  listNotificationsStaticTool,
  markNotificationReadStaticTool,
  deleteNotificationStaticTool
} from '../tools/static-tools.js';

/**
 * Handles notification-related operations
 */
export class NotificationHandlers {
  async handleSendNotification(args: any): Promise<ToolExecutionResult> {
    debugError(`[CallTool Handler] Executing static tool: ${sendNotificationStaticTool.name}`);
    const validatedArgs = SendNotificationInputSchema.parse(args ?? {});

    const apiKey = getPluggedinMCPApiKey();
    if (!apiKey) {
      return {
        content: [{
          type: "text",
          text: getApiKeySetupMessage("pluggedin_send_notification")
        }],
        isError: false
      };
    }

    const timer = createExecutionTimer();
    try {
      const response = await makeApiRequest<{ notificationId: string; emailSent?: boolean }>({
        method: 'POST',
        url: '/api/notifications',
        data: validatedArgs
      });

      // Log successful notification send
      logMcpActivity({
        action: 'tool_call',
        serverName: 'Notification System',
        serverUuid: 'pluggedin_notifications',
        itemName: sendNotificationStaticTool.name,
        success: true,
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors

      const notificationId = response.notificationId;
      const emailSent = response.emailSent || false;
      
      let responseText = `Notification sent successfully! (ID: ${notificationId})`;
      if (emailSent) {
        responseText += '\nEmail notification was also sent.';
      }

      return {
        content: [{ type: "text", text: responseText }],
        isError: false,
      };

    } catch (error: any) {
      // Log failed notification send
      logMcpActivity({
        action: 'tool_call',
        serverName: 'Notification System',
        serverUuid: 'pluggedin_notifications',
        itemName: sendNotificationStaticTool.name,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors
      
      throw error;
    }
  }

  async handleListNotifications(args: any): Promise<ToolExecutionResult> {
    debugError(`[CallTool Handler] Executing static tool: ${listNotificationsStaticTool.name}`);
    const validatedArgs = ListNotificationsInputSchema.parse(args ?? {});

    const apiKey = getPluggedinMCPApiKey();
    if (!apiKey) {
      return {
        content: [{
          type: "text",
          text: getApiKeySetupMessage("pluggedin_list_notifications")
        }],
        isError: false
      };
    }

    // Build query parameters with boolean conversion
    const queryParams = {
      limit: validatedArgs.limit,
      unreadOnly: validatedArgs.unreadOnly, // buildUrl will convert to 1/0
      severity: validatedArgs.severity
    };

    const notificationApiUrl = buildUrl('/api/notifications', queryParams);

    const timer = createExecutionTimer();
    try {
      const response = await makeApiRequest<{ notifications: any[] }>({
        method: 'GET',
        url: notificationApiUrl
      });

      // Log successful list operation
      logMcpActivity({
        action: 'tool_call',
        serverName: 'Notification System',
        serverUuid: 'pluggedin_notifications',
        itemName: listNotificationsStaticTool.name,
        success: true,
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors

      const notifications = response.notifications || [];
      
      let responseText = `Found ${notifications.length} notification(s):\n\n`;
      
      notifications.forEach((notif: any, index: number) => {
        responseText += `${index + 1}. [${notif.severity || 'INFO'}] ${notif.title || 'Notification'}\n`;
        responseText += `   ID: ${notif.id}\n`;
        responseText += `   Message: ${notif.message}\n`;
        responseText += `   Status: ${notif.isRead ? 'Read' : 'Unread'}\n`;
        responseText += `   Created: ${new Date(notif.createdAt).toLocaleString()}\n`;
        if (notif.link) {
          responseText += `   Link: ${notif.link}\n`;
        }
        responseText += '\n';
      });

      return {
        content: [{ type: "text", text: responseText }],
        isError: false,
      };

    } catch (error: any) {
      // Log failed list operation
      logMcpActivity({
        action: 'tool_call',
        serverName: 'Notification System',
        serverUuid: 'pluggedin_notifications',
        itemName: listNotificationsStaticTool.name,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors
      
      throw error;
    }
  }

  async handleMarkNotificationRead(args: any): Promise<ToolExecutionResult> {
    debugError(`[CallTool Handler] Executing static tool: ${markNotificationReadStaticTool.name}`);
    const validatedArgs = MarkNotificationReadInputSchema.parse(args ?? {});

    const apiKey = getPluggedinMCPApiKey();
    if (!apiKey) {
      return {
        content: [{
          type: "text",
          text: getApiKeySetupMessage("pluggedin_mark_notification_read")
        }],
        isError: false
      };
    }

    const timer = createExecutionTimer();
    try {
      await makeApiRequest({
        method: 'PUT',
        url: `/api/notifications/${validatedArgs.notificationId}/read`
      });

      // Log successful mark as read
      logMcpActivity({
        action: 'tool_call',
        serverName: 'Notification System',
        serverUuid: 'pluggedin_notifications',
        itemName: markNotificationReadStaticTool.name,
        success: true,
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors

      return {
        content: [{ type: "text", text: `Notification ${validatedArgs.notificationId} marked as read.` }],
        isError: false,
      };

    } catch (error: any) {
      // Log failed mark as read
      logMcpActivity({
        action: 'tool_call',
        serverName: 'Notification System',
        serverUuid: 'pluggedin_notifications',
        itemName: markNotificationReadStaticTool.name,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors
      
      throw error;
    }
  }

  async handleDeleteNotification(args: any): Promise<ToolExecutionResult> {
    debugError(`[CallTool Handler] Executing static tool: ${deleteNotificationStaticTool.name}`);
    const validatedArgs = DeleteNotificationInputSchema.parse(args ?? {});

    const apiKey = getPluggedinMCPApiKey();
    if (!apiKey) {
      return {
        content: [{
          type: "text",
          text: getApiKeySetupMessage("pluggedin_delete_notification")
        }],
        isError: false
      };
    }

    const timer = createExecutionTimer();
    try {
      await makeApiRequest({
        method: 'DELETE',
        url: `/api/notifications/${validatedArgs.notificationId}`
      });

      // Log successful deletion
      logMcpActivity({
        action: 'tool_call',
        serverName: 'Notification System',
        serverUuid: 'pluggedin_notifications',
        itemName: deleteNotificationStaticTool.name,
        success: true,
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors

      return {
        content: [{ type: "text", text: `Notification ${validatedArgs.notificationId} deleted successfully.` }],
        isError: false,
      };

    } catch (error: any) {
      // Log failed deletion
      logMcpActivity({
        action: 'tool_call',
        serverName: 'Notification System',
        serverUuid: 'pluggedin_notifications',
        itemName: deleteNotificationStaticTool.name,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors
      
      throw error;
    }
  }
}