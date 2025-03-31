import { z } from 'zod';
import { CallPluggedinToolTool } from './call-pluggedin-tool.js';
import { getMcpServers } from '../fetch-pluggedinmcp.js';
import { getSession } from '../sessions.js';
import { getPluggedinMCPApiKey, sanitizeName } from '../utils.js';
import { getProfileCapabilities, ProfileCapability } from '../fetch-capabilities.js';
import { getInactiveTools } from '../fetch-tools.js';
import { container } from '../di-container.js';
import { Logger } from '../logging.js';
import { ListToolsResultSchema, CompatibilityCallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

// Mock dependencies
jest.mock('../fetch-pluggedinmcp.js');
jest.mock('../sessions.js');
jest.mock('../utils.js', () => ({
  getPluggedinMCPApiKey: jest.fn(),
  sanitizeName: jest.fn((name: string) => name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase()), // Real implementation for testing prefix logic
  getSessionKey: jest.fn((uuid, params) => `${uuid}_${JSON.stringify(params)}`), // Simple mock
}));
jest.mock('../fetch-capabilities.js');
jest.mock('../fetch-tools.js');

// Mock logger via container
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  setLogLevel: jest.fn(),
};
// Check if logger is already registered before trying to register mock
if (!container.has('logger')) {
  container.register<Logger>('logger', mockLogger as unknown as Logger);
} else {
   // If already registered (e.g. by DI container itself), just overwrite methods
   const actualLogger = container.get<Logger>('logger');
   Object.assign(actualLogger, mockLogger);
}


const mockedGetMcpServers = getMcpServers as jest.Mock;
const mockedGetSession = getSession as jest.Mock;
const mockedGetPluggedinMCPApiKey = getPluggedinMCPApiKey as jest.Mock;
const mockedGetProfileCapabilities = getProfileCapabilities as jest.Mock;
const mockedGetInactiveTools = getInactiveTools as jest.Mock;
const mockedSanitizeName = sanitizeName as jest.Mock; // Keep reference if needed

describe('CallPluggedinToolTool', () => {
  let callToolPlugin: CallPluggedinToolTool;
  let mockClientRequest: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    callToolPlugin = new CallPluggedinToolTool();

    // Default mocks
    mockedGetPluggedinMCPApiKey.mockReturnValue('test-api-key');
    mockedGetProfileCapabilities.mockResolvedValue([]); // Default to no special capabilities
    mockedGetInactiveTools.mockResolvedValue({}); // Default to no inactive tools
    mockedGetMcpServers.mockResolvedValue({
      'uuid1': { name: 'ServerOne', type: 'STDIO', command: 'cmd1' },
    });

    mockClientRequest = jest.fn();
    mockedGetSession.mockResolvedValue({
      client: {
        getServerCapabilities: jest.fn().mockReturnValue({ tools: true }),
        getServerVersion: jest.fn().mockReturnValue({ name: 'ServerOne' }),
        request: mockClientRequest,
      },
      cleanup: jest.fn(),
    });

    // Mock tools/list response for findClientForTool
    mockClientRequest.mockImplementation(async (req) => {
       if (req.method === 'tools/list') {
          return { tools: [{ name: 'actual_tool_name', inputSchema: { type: 'object' } }] } as z.infer<typeof ListToolsResultSchema>;
       }
       // Default for tools/call or other methods
       return { content: [{ type: 'text', text: 'mock success' }] } as z.infer<typeof CompatibilityCallToolResultSchema>;
    });
  });

  it('should return error if API key is missing', async () => {
    // Arrange
    mockedGetPluggedinMCPApiKey.mockReturnValue(undefined);
    const args = { tool_name: 'serverone__actual_tool_name', arguments: {} };

    // Act
    const result = await callToolPlugin.execute(args, {});

    // Assert
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'Configuration Error: PluggedinMCP API Key is missing. Please configure the server.' }]);
    expect(mockedGetSession).not.toHaveBeenCalled();
  });

  it('should return error if tool is not found', async () => {
    // Arrange
    const args = { tool_name: 'serverone__nonexistent_tool', arguments: {} };
     // Adjust mock tools/list response
     mockClientRequest.mockImplementation(async (req) => {
       if (req.method === 'tools/list') {
          return { tools: [{ name: 'actual_tool_name', inputSchema: { type: 'object' } }] };
       }
       return { content: [{ type: 'text', text: 'mock success' }] };
    });


    // Act
    const result = await callToolPlugin.execute(args, {});

    // Assert
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'Error: Unknown or inactive tool: serverone__nonexistent_tool' }]);
    expect(mockedGetSession).toHaveBeenCalled(); // Session is checked
    expect(mockClientRequest).toHaveBeenCalledWith(expect.objectContaining({ method: 'tools/list' }), expect.any(Object)); // tools/list is called
  });

   it('should return error if tool is inactive', async () => {
    // Arrange
    mockedGetProfileCapabilities.mockResolvedValue([ProfileCapability.TOOLS_MANAGEMENT]);
    mockedGetInactiveTools.mockResolvedValue({ 'uuid1:actual_tool_name': {} }); // Mark the tool as inactive
    const args = { tool_name: 'serverone__actual_tool_name', arguments: {} };

    // Act
    const result = await callToolPlugin.execute(args, {});

    // Assert
     expect(result.isError).toBe(true);
     // The error is thrown before returning, check the message (adjust if needed based on actual throw)
     // This test might need adjustment if the error handling changes to return instead of throw for inactive
     // For now, assuming it returns the standard "Unknown or inactive" error
     expect(result.content).toEqual([{ type: 'text', text: 'Error: Unknown or inactive tool: serverone__actual_tool_name' }]);
     expect(mockedGetSession).toHaveBeenCalled();
     expect(mockClientRequest).toHaveBeenCalledWith(expect.objectContaining({ method: 'tools/list' }), expect.any(Object));
  });


  it('should successfully proxy the tool call to the correct downstream server', async () => {
    // Arrange
    const args = { tool_name: 'serverone__actual_tool_name', arguments: { param1: 'value1' } };
    const meta = { progressToken: 'token123' };
    const downstreamResult = { content: [{ type: 'text', text: 'Downstream Success!' }] };
    mockClientRequest.mockImplementation(async (req) => {
       if (req.method === 'tools/list') {
          return { tools: [{ name: 'actual_tool_name', inputSchema: { type: 'object' } }] };
       }
       if (req.method === 'tools/call' && req.params.name === 'actual_tool_name') {
          return downstreamResult;
       }
       return { content: [{ type: 'text', text: 'unexpected call' }] };
    });


    // Act
    const result = await callToolPlugin.execute(args, meta);

    // Assert
    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual(downstreamResult.content);
    expect(mockedGetSession).toHaveBeenCalled();
    expect(mockClientRequest).toHaveBeenCalledWith(expect.objectContaining({ method: 'tools/list' }), expect.any(Object));
    expect(mockClientRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'tools/call',
        params: expect.objectContaining({
          name: 'actual_tool_name',
          arguments: args.arguments,
          _meta: { progressToken: meta.progressToken },
        }),
      }),
      expect.any(Object) // Assuming the SDK passes the schema here
    );
    expect(mockLogger.debug).toHaveBeenCalledWith(
       expect.stringContaining("Proxying call to tool 'actual_tool_name' on server 'ServerOne'"),
       args.arguments
    );
  });

  it('should return error if downstream tool call fails', async () => {
     // Arrange
    const args = { tool_name: 'serverone__actual_tool_name', arguments: {} };
    const downstreamError = new Error('Downstream Failed');
     mockClientRequest.mockImplementation(async (req) => {
       if (req.method === 'tools/list') {
          return { tools: [{ name: 'actual_tool_name', inputSchema: { type: 'object' } }] };
       }
       if (req.method === 'tools/call') {
          throw downstreamError;
       }
       return { content: [] };
    });

    // Act
    const result = await callToolPlugin.execute(args, {});

    // Assert
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: `Error executing proxied tool: ${downstreamError.message}` }]);
    expect(mockLogger.error).toHaveBeenCalledWith(
       expect.stringContaining("Error calling tool 'actual_tool_name' through ServerOne"),
       downstreamError
    );
  });

});
