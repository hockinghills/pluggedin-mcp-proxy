import { ToolExecutionResult } from "../types.js";
import { getPluggedinMCPApiKey, getPluggedinMCPApiBaseUrl } from "../utils.js";
import { logMcpActivity, createExecutionTimer } from "../notification-logger.js";
import { debugLog, debugError } from "../debug-log.js";
import { getApiKeySetupMessage } from "./static-handlers-helpers.js";
import { makeApiRequest, buildUrl } from "../http-client.js";
import {
  CreateDocumentInputSchema,
  ListDocumentsInputSchema,
  SearchDocumentsInputSchema,
  GetDocumentInputSchema,
  UpdateDocumentInputSchema
} from '../schemas/index.js';
import {
  createDocumentStaticTool,
  listDocumentsStaticTool,
  searchDocumentsStaticTool,
  getDocumentStaticTool,
  updateDocumentStaticTool
} from '../tools/static-tools.js';

/**
 * Handles document-related operations
 */
export class DocumentHandlers {
  async handleCreateDocument(args: any): Promise<ToolExecutionResult> {
    debugError(`[CallTool Handler] Executing static tool: ${createDocumentStaticTool.name}`);
    const validatedArgs = CreateDocumentInputSchema.parse(args ?? {});

    const apiKey = getPluggedinMCPApiKey();
    if (!apiKey) {
      return {
        content: [{
          type: "text",
          text: getApiKeySetupMessage("pluggedin_create_document")
        }],
        isError: false
      };
    }

    const timer = createExecutionTimer();
    try {
      const response = await makeApiRequest<{ document: any }>({
        method: 'POST',
        url: '/api/documents',
        data: validatedArgs
      });

      // Log successful document creation
      logMcpActivity({
        action: 'tool_call',
        serverName: 'Document Library',
        serverUuid: 'pluggedin_documents',
        itemName: createDocumentStaticTool.name,
        success: true,
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors

      const doc = response.document;
      
      let responseText = `Document created successfully!\n\n`;
      responseText += `**Title:** ${doc.title}\n`;
      responseText += `**ID:** ${doc.id}\n`;
      responseText += `**Format:** ${doc.format}\n`;
      responseText += `**Category:** ${doc.category}\n`;
      if (doc.tags && doc.tags.length > 0) {
        responseText += `**Tags:** ${doc.tags.join(', ')}\n`;
      }
      responseText += `**Created:** ${new Date(doc.createdAt).toLocaleString()}\n`;
      
      return {
        content: [{ type: "text", text: responseText }],
        isError: false,
      };

    } catch (error: any) {
      // Log failed document creation
      logMcpActivity({
        action: 'tool_call',
        serverName: 'Document Library',
        serverUuid: 'pluggedin_documents',
        itemName: createDocumentStaticTool.name,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors
      
      throw error;
    }
  }

  async handleListDocuments(args: any): Promise<ToolExecutionResult> {
    debugError(`[CallTool Handler] Executing static tool: ${listDocumentsStaticTool.name}`);
    const validatedArgs = ListDocumentsInputSchema.parse(args ?? {});

    const apiKey = getPluggedinMCPApiKey();
    if (!apiKey) {
      return {
        content: [{
          type: "text",
          text: getApiKeySetupMessage("pluggedin_list_documents")
        }],
        isError: false
      };
    }

    const timer = createExecutionTimer();
    try {
      const response = await makeApiRequest<{ documents: any[]; total: number }>({
        method: 'POST',
        url: '/api/documents/list',
        data: validatedArgs
      });

      // Log successful list operation
      logMcpActivity({
        action: 'tool_call',
        serverName: 'Document Library',
        serverUuid: 'pluggedin_documents',
        itemName: listDocumentsStaticTool.name,
        success: true,
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors

      const documents = response.documents || [];
      const total = response.total || documents.length;
      
      let responseText = `Found ${total} document(s) (showing ${documents.length}):\n\n`;
      
      documents.forEach((doc: any, index: number) => {
        responseText += `${index + 1}. **${doc.title}**\n`;
        responseText += `   ID: ${doc.id}\n`;
        responseText += `   Format: ${doc.format} | Category: ${doc.category}\n`;
        responseText += `   Source: ${doc.source}`;
        if (doc.source === 'ai_generated' && doc.aiMetadata?.model) {
          responseText += ` (${doc.aiMetadata.model.name})`;
        }
        responseText += '\n';
        if (doc.tags && doc.tags.length > 0) {
          responseText += `   Tags: ${doc.tags.join(', ')}\n`;
        }
        responseText += `   Created: ${new Date(doc.createdAt).toLocaleString()}\n`;
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
        serverName: 'Document Library',
        serverUuid: 'pluggedin_documents',
        itemName: listDocumentsStaticTool.name,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors
      
      throw error;
    }
  }

  async handleSearchDocuments(args: any): Promise<ToolExecutionResult> {
    debugError(`[CallTool Handler] Executing static tool: ${searchDocumentsStaticTool.name}`);
    const validatedArgs = SearchDocumentsInputSchema.parse(args ?? {});

    const apiKey = getPluggedinMCPApiKey();
    if (!apiKey) {
      return {
        content: [{
          type: "text",
          text: getApiKeySetupMessage("pluggedin_search_documents")
        }],
        isError: false
      };
    }

    const timer = createExecutionTimer();
    try {
      const response = await makeApiRequest<{ results: any[] }>({
        method: 'POST',
        url: '/api/documents/search',
        data: validatedArgs
      });

      // Log successful search
      logMcpActivity({
        action: 'tool_call',
        serverName: 'Document Library',
        serverUuid: 'pluggedin_documents',
        itemName: searchDocumentsStaticTool.name,
        success: true,
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors

      const results = response.results || [];
      
      let responseText = `Search results for "${validatedArgs.query}" (${results.length} found):\n\n`;
      
      results.forEach((result: any, index: number) => {
        responseText += `${index + 1}. **${result.title}**\n`;
        responseText += `   ID: ${result.id}\n`;
        // Validate relevance score to prevent NaN display
        const relevanceScore = typeof result.relevanceScore === 'number' && !isNaN(result.relevanceScore) 
          ? result.relevanceScore 
          : 0;
        responseText += `   Relevance: ${(relevanceScore * 100).toFixed(1)}%\n`;
        responseText += `   Snippet: ${result.snippet}\n`;
        responseText += `   Source: ${result.source}`;
        if (result.source === 'ai_generated' && result.aiMetadata?.model) {
          responseText += ` (${result.aiMetadata.model.name})`;
        }
        responseText += `\n\n`;
      });

      return {
        content: [{ type: "text", text: responseText }],
        isError: false,
      };

    } catch (error: any) {
      // Log failed search
      logMcpActivity({
        action: 'tool_call',
        serverName: 'Document Library',
        serverUuid: 'pluggedin_documents',
        itemName: searchDocumentsStaticTool.name,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors
      
      throw error;
    }
  }

  async handleGetDocument(args: any): Promise<ToolExecutionResult> {
    debugError(`[CallTool Handler] Executing static tool: ${getDocumentStaticTool.name}`);
    const validatedArgs = GetDocumentInputSchema.parse(args ?? {});

    const apiKey = getPluggedinMCPApiKey();
    if (!apiKey) {
      return {
        content: [{
          type: "text",
          text: getApiKeySetupMessage("pluggedin_get_document")
        }],
        isError: false
      };
    }

    const timer = createExecutionTimer();
    try {
      const queryParams = {
        includeContent: validatedArgs.includeContent,
        includeVersions: validatedArgs.includeVersions
      };

      const response = await makeApiRequest<{ document: any }>({
        method: 'GET',
        url: buildUrl(`/api/documents/${validatedArgs.documentId}`, queryParams)
      });

      // Log successful retrieval
      logMcpActivity({
        action: 'tool_call',
        serverName: 'Document Library',
        serverUuid: 'pluggedin_documents',
        itemName: getDocumentStaticTool.name,
        success: true,
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors

      const doc = response.document;
      
      let responseText = `# ${doc.title}\n\n`;
      responseText += `**ID:** ${doc.id}\n`;
      responseText += `**Format:** ${doc.format} | **Category:** ${doc.category}\n`;
      responseText += `**Source:** ${doc.source}`;
      if (doc.source === 'ai_generated' && doc.aiMetadata?.model) {
        responseText += ` (${doc.aiMetadata.model.name})`;
      }
      responseText += '\n';
      if (doc.tags && doc.tags.length > 0) {
        responseText += `**Tags:** ${doc.tags.join(', ')}\n`;
      }
      responseText += `**Created:** ${new Date(doc.createdAt).toLocaleString()}\n`;
      responseText += `**Updated:** ${new Date(doc.updatedAt).toLocaleString()}\n`;
      
      if (validatedArgs.includeContent && doc.content) {
        responseText += `\n## Content\n\n${doc.content}\n`;
      }
      
      if (validatedArgs.includeVersions && doc.versions && doc.versions.length > 0) {
        responseText += `\n## Version History\n\n`;
        doc.versions.forEach((version: any, index: number) => {
          responseText += `${index + 1}. Version ${version.version} - ${new Date(version.createdAt).toLocaleString()}\n`;
          if (version.changeSummary) {
            responseText += `   Change: ${version.changeSummary}\n`;
          }
        });
      }

      return {
        content: [{ type: "text", text: responseText }],
        isError: false,
      };

    } catch (error: any) {
      // Log failed retrieval
      logMcpActivity({
        action: 'tool_call',
        serverName: 'Document Library',
        serverUuid: 'pluggedin_documents',
        itemName: getDocumentStaticTool.name,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors
      
      throw error;
    }
  }

  async handleUpdateDocument(args: any): Promise<ToolExecutionResult> {
    debugError(`[CallTool Handler] Executing static tool: ${updateDocumentStaticTool.name}`);
    const validatedArgs = UpdateDocumentInputSchema.parse(args ?? {});

    const apiKey = getPluggedinMCPApiKey();
    if (!apiKey) {
      return {
        content: [{
          type: "text",
          text: getApiKeySetupMessage("pluggedin_update_document")
        }],
        isError: false
      };
    }

    const timer = createExecutionTimer();
    try {
      const response = await makeApiRequest<{ document: any; version: any }>({
        method: 'PUT',
        url: `/api/documents/${validatedArgs.documentId}`,
        data: {
          operation: validatedArgs.operation,
          content: validatedArgs.content,
          metadata: validatedArgs.metadata
        }
      });

      // Log successful update
      logMcpActivity({
        action: 'tool_call',
        serverName: 'Document Library',
        serverUuid: 'pluggedin_documents',
        itemName: updateDocumentStaticTool.name,
        success: true,
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors

      const doc = response.document;
      const version = response.version;
      
      let responseText = `Document updated successfully!\n\n`;
      responseText += `**Title:** ${doc.title}\n`;
      responseText += `**ID:** ${doc.id}\n`;
      responseText += `**Operation:** ${validatedArgs.operation}\n`;
      if (version) {
        responseText += `**New Version:** ${version.version}\n`;
      }
      if (validatedArgs.metadata?.changeSummary) {
        responseText += `**Change Summary:** ${validatedArgs.metadata.changeSummary}\n`;
      }
      responseText += `**Updated:** ${new Date(doc.updatedAt).toLocaleString()}\n`;

      return {
        content: [{ type: "text", text: responseText }],
        isError: false,
      };

    } catch (error: any) {
      // Log failed update
      logMcpActivity({
        action: 'tool_call',
        serverName: 'Document Library',
        serverUuid: 'pluggedin_documents',
        itemName: updateDocumentStaticTool.name,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        executionTime: timer.stop(),
      }).catch(() => {}); // Ignore notification errors
      
      throw error;
    }
  }
}