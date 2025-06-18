import axios from 'axios';
import { getPluggedinMCPApiKey, getPluggedinMCPApiBaseUrl } from './utils.js';

export interface McpActivityData {
  action: 'tool_call' | 'prompt_get' | 'resource_read';
  serverName: string;
  serverUuid: string;
  itemName: string;
  success: boolean;
  errorMessage?: string;
  executionTime?: number;
}

/**
 * Log MCP server activity to the pluggedin-app notification system
 */
export async function logMcpActivity(data: McpActivityData): Promise<void> {
  console.log(`[Notification Logger] Attempting to log activity:`, JSON.stringify(data, null, 2));
  
  try {
    const apiKey = getPluggedinMCPApiKey();
    const baseUrl = getPluggedinMCPApiBaseUrl();
    
    console.log(`[Notification Logger] Configuration - API Key: ${apiKey ? 'SET' : 'NOT SET'}, Base URL: ${baseUrl || 'NOT SET'}`);
    
    if (!apiKey || !baseUrl) {
      console.warn('[Notification Logger] API key or base URL not configured, skipping notification');
      return;
    }

    const notificationUrl = `${baseUrl}/api/notifications/mcp-activity`;
    console.log(`[Notification Logger] Sending POST to: ${notificationUrl}`);
    
    const response = await axios.post(notificationUrl, data, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 5000, // Short timeout for notifications
    });

    console.log(`[Notification Logger] ✅ Successfully logged ${data.action} for ${data.itemName}`);
    console.log(`[Notification Logger] Response status: ${response.status}, data:`, response.data);
  } catch (error) {
    // Don't throw errors for notification logging failures
    console.error('[Notification Logger] ❌ Failed to log MCP activity:', 
      axios.isAxiosError(error) 
        ? `Status: ${error.response?.status}, Data: ${JSON.stringify(error.response?.data)}` 
        : error instanceof Error 
          ? error.message 
          : String(error)
    );
  }
}

/**
 * Helper function to measure execution time
 */
export function createExecutionTimer() {
  const startTime = Date.now();
  
  return {
    stop: () => Date.now() - startTime,
  };
} 