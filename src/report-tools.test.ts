import axios from 'axios';
import { getMcpServers } from './fetch-pluggedinmcp.js';
import { initSessions, getSession } from './sessions.js';
import { getPluggedinMCPApiKey, getPluggedinMCPApiBaseUrl, getSessionKey } from './utils.js';
import { reportToolsToPluggedinMCP, reportResourcesToPluggedinMCP, reportAllCapabilities } from './report-tools.js';
import { container } from './di-container.js';
import { Logger } from './logging.js';
import { ListToolsResultSchema, ListResourcesResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Mock dependencies
jest.mock('axios');
jest.mock('./fetch-pluggedinmcp.js');
jest.mock('./sessions.js');
jest.mock('./utils.js', () => ({
  getPluggedinMCPApiKey: jest.fn(),
  getPluggedinMCPApiBaseUrl: jest.fn(),
  getSessionKey: jest.fn((uuid, params) => `${uuid}_${JSON.stringify(params)}`), // Simple mock
  sanitizeName: jest.fn((name: string) => name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase()),
}));

// Mock logger
const mockLogger = {
  debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), setLogLevel: jest.fn(),
};
if (!container.has('logger')) {
  container.register<Logger>('logger', mockLogger as unknown as Logger);
} else {
  const actualLogger = container.get<Logger>('logger');
  Object.assign(actualLogger, mockLogger);
}

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedGetMcpServers = getMcpServers as jest.Mock;
const mockedInitSessions = initSessions as jest.Mock;
const mockedGetSession = getSession as jest.Mock;
const mockedGetPluggedinMCPApiKey = getPluggedinMCPApiKey as jest.Mock;
const mockedGetPluggedinMCPApiBaseUrl = getPluggedinMCPApiBaseUrl as jest.Mock;

describe('Report Tools Module', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mocks
    mockedGetPluggedinMCPApiKey.mockReturnValue('test-api-key');
    mockedGetPluggedinMCPApiBaseUrl.mockReturnValue('http://test.com');
    mockedAxios.post.mockResolvedValue({ data: { results: [], successCount: 0, errorCount: 0, errors: [] } }); // Default success for API posts
  });

  describe('reportToolsToPluggedinMCP', () => {
    it('should return error if API key is not set', async () => {
      mockedGetPluggedinMCPApiKey.mockReturnValue(undefined);
      const result = await reportToolsToPluggedinMCP([]);
      expect(result.error).toBe('API key or base URL not set');
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should return error if tools array is empty or invalid', async () => {
      let result = await reportToolsToPluggedinMCP([]);
      expect(result.error).toBe('Request must include a non-empty array of tools');
      expect(result.status).toBe(400);

      result = await reportToolsToPluggedinMCP(null as any); // Test invalid input
       expect(result.error).toBe('Request must include a non-empty array of tools');
       expect(result.status).toBe(400);
    });

    it('should filter out tools with missing required fields', async () => {
      const tools = [
        { name: 'tool1', inputSchema: {}, mcp_server_uuid: 'uuid1', status: 'ACTIVE' },
        { name: 'tool2', mcp_server_uuid: 'uuid2' }, // Missing inputSchema
      ];
      mockedAxios.post.mockResolvedValue({ data: { results: [{ name: 'tool1' }], successCount: 1 } }); // Mock API response for valid tool

      const result = await reportToolsToPluggedinMCP(tools as any);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Missing required fields');
      expect(result.failureCount).toBe(1);
      expect(result.successCount).toBe(1); // Based on mocked API response
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://test.com/api/tools',
        expect.objectContaining({
          tools: [expect.objectContaining({ name: 'tool1' })], // Only valid tool sent
        }),
        expect.any(Object)
      );
    });

    it('should call the API with valid tools', async () => {
       const tools = [
        { name: 'tool1', description: 'd1', inputSchema: { type: 'object' }, mcp_server_uuid: 'uuid1', status: 'ACTIVE' },
        { name: 'tool2', description: 'd2', inputSchema: { type: 'string' }, mcp_server_uuid: 'uuid2', status: 'INACTIVE' },
      ];
       mockedAxios.post.mockResolvedValue({ data: { results: tools, successCount: 2 } });

       const result = await reportToolsToPluggedinMCP(tools);

       expect(result.successCount).toBe(2);
       expect(result.failureCount).toBe(0);
       expect(result.errors).toHaveLength(0);
       expect(mockedAxios.post).toHaveBeenCalledWith(
         'http://test.com/api/tools',
         {
           tools: [
             { name: 'tool1', description: 'd1', toolSchema: { type: 'object' }, mcp_server_uuid: 'uuid1', status: 'ACTIVE' },
             { name: 'tool2', description: 'd2', toolSchema: { type: 'string' }, mcp_server_uuid: 'uuid2', status: 'INACTIVE' },
           ]
         },
         { headers: { "Content-Type": "application/json", Authorization: "Bearer test-api-key" } }
       );
    });

     it('should handle API errors during submission', async () => {
       const tools = [{ name: 'tool1', inputSchema: {}, mcp_server_uuid: 'uuid1', status: 'ACTIVE' }];
       const apiError = { response: { status: 500, data: { error: 'Server Error' } } };
       mockedAxios.post.mockRejectedValue(apiError);

       const result = await reportToolsToPluggedinMCP(tools as any);

       expect(result.error).toBe('Server Error');
       expect(result.status).toBe(500);
       expect(result.successCount).toBe(0);
       expect(result.failureCount).toBe(1); // The one valid tool failed due to API error
       expect(result.errors).toHaveLength(1);
       expect(result.errors[0].error).toBe('API call failed');
       expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Error submitting tools to API'), expect.any(Object));
    });
  });

  describe('reportResourcesToPluggedinMCP', () => {
     // Similar tests as reportToolsToPluggedinMCP, adapted for resources
     it('should return error if API key is not set', async () => {
       mockedGetPluggedinMCPApiKey.mockReturnValue(undefined);
       const result = await reportResourcesToPluggedinMCP([]);
       expect(result.error).toBe('API key or base URL not set');
       expect(mockedAxios.post).not.toHaveBeenCalled();
     });

     it('should return success with 0 counts for empty array', async () => {
       const result = await reportResourcesToPluggedinMCP([]);
       expect(result.successCount).toBe(0);
       expect(result.failureCount).toBe(0);
       expect(result.errors).toHaveLength(0);
       expect(mockedAxios.post).not.toHaveBeenCalled(); // No API call for empty array
     });

     it('should call the API with valid resources', async () => {
       const resources = [
         { uri: 'res1', name: 'Resource 1', mediaType: 'text/plain', mcp_server_uuid: 'uuid1' },
         { uri: 'res2', description: 'Desc 2', mcp_server_uuid: 'uuid2' },
       ];
       mockedAxios.post.mockResolvedValue({ data: { successCount: 2, errorCount: 0, errors: [] } });

       const result = await reportResourcesToPluggedinMCP(resources as any);

       expect(result.successCount).toBe(2);
       expect(result.failureCount).toBe(0);
       expect(result.errors).toHaveLength(0);
       expect(mockedAxios.post).toHaveBeenCalledWith(
         'http://test.com/api/resources',
         {
           resources: [
             { uri: 'res1', name: 'Resource 1', description: undefined, mime_type: 'text/plain', mcp_server_uuid: 'uuid1' },
             { uri: 'res2', name: undefined, description: 'Desc 2', mime_type: undefined, mcp_server_uuid: 'uuid2' },
           ]
         },
         expect.any(Object)
       );
     });

      it('should handle API errors during submission', async () => {
       const resources = [{ uri: 'res1', mcp_server_uuid: 'uuid1' }];
       const apiError = { response: { status: 400, data: { error: 'Bad Request' } } };
       mockedAxios.post.mockRejectedValue(apiError);

       const result = await reportResourcesToPluggedinMCP(resources as any);

       expect(result.error).toBe('Bad Request');
       expect(result.successCount).toBe(0);
       expect(result.failureCount).toBe(1);
       expect(result.errors).toHaveLength(1);
       expect(result.errors[0].error).toBe('API call failed');
       expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Error reporting resources to PluggedinMCP API'), expect.any(String), expect.any(Object));
    });
  });

  describe('reportAllCapabilities', () => {
     let mockSession1: any;
     let mockSession2: any;

     beforeEach(() => {
        mockedGetMcpServers.mockResolvedValue({
          'uuid1': { name: 'ServerOne', type: 'STDIO', command: 'cmd1' },
          'uuid2': { name: 'ServerTwo', type: 'STDIO', command: 'cmd2' },
          'uuid3': { name: 'ServerThree', type: 'STDIO', command: 'cmd3' }, // Server with no capabilities
        });

        mockSession1 = {
           client: {
             getServerCapabilities: jest.fn().mockReturnValue({ tools: true, resources: true }),
             getServerVersion: jest.fn().mockReturnValue({ name: 'ServerOne' }),
             request: jest.fn()
           }, cleanup: jest.fn()
        };
        mockSession2 = {
           client: {
             getServerCapabilities: jest.fn().mockReturnValue({ tools: true, resources: false }), // Only tools
             getServerVersion: jest.fn().mockReturnValue({ name: 'ServerTwo' }),
             request: jest.fn()
           }, cleanup: jest.fn()
        };
         const mockSession3 = {
           client: {
             getServerCapabilities: jest.fn().mockReturnValue({}), // No capabilities
             getServerVersion: jest.fn().mockReturnValue({ name: 'ServerThree' }),
             request: jest.fn()
           }, cleanup: jest.fn()
        };


        mockedGetSession
          .mockImplementation(async (key) => {
             if (key.startsWith('uuid1')) return mockSession1;
             if (key.startsWith('uuid2')) return mockSession2;
             if (key.startsWith('uuid3')) return mockSession3;
             return undefined;
          });

        // Mock tools/list and resources/list responses
        mockSession1.client.request.mockImplementation(async (req: any) => {
           if (req.method === 'tools/list') return { tools: [{ name: 'tool1a', inputSchema: {} }] };
           if (req.method === 'resources/list') return { resources: [{ uri: 'res1a', name: 'Res1A' }] };
           return {};
        });
         mockSession2.client.request.mockImplementation(async (req: any) => {
           if (req.method === 'tools/list') return { tools: [{ name: 'tool2a', inputSchema: {} }, { name: 'tool2b', inputSchema: {} }] };
           // No resources mock needed as capability is false
           return {};
        });
     });

     it('should fetch capabilities and report them', async () => {
        mockedAxios.post.mockResolvedValue({ data: { successCount: 1, errorCount: 0, errors: [] } }); // Mock successful API posts

        const result = await reportAllCapabilities(2); // Use concurrency 2

        expect(mockedGetMcpServers).toHaveBeenCalledTimes(1);
        expect(mockedInitSessions).toHaveBeenCalledTimes(1);
        expect(mockedGetSession).toHaveBeenCalledTimes(3); // Called for each server

        // Check requests made to sessions
        expect(mockSession1.client.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'tools/list' }), expect.any(Object));
        expect(mockSession1.client.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'resources/list' }), expect.any(Object));
        expect(mockSession2.client.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'tools/list' }), expect.any(Object));
        expect(mockSession2.client.request).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'resources/list' }), expect.any(Object));

        // Check API calls (axios.post)
        expect(mockedAxios.post).toHaveBeenCalledTimes(3); // 1 for tools S1, 1 for resources S1, 1 for tools S2
        // Check tools report for ServerOne
        expect(mockedAxios.post).toHaveBeenCalledWith(
           'http://test.com/api/tools',
           expect.objectContaining({ tools: [expect.objectContaining({ name: 'tool1a', mcp_server_uuid: 'uuid1' })] }),
           expect.any(Object)
        );
         // Check resources report for ServerOne
        expect(mockedAxios.post).toHaveBeenCalledWith(
           'http://test.com/api/resources',
           expect.objectContaining({ resources: [expect.objectContaining({ uri: 'res1a', mcp_server_uuid: 'uuid1' })] }),
           expect.any(Object)
        );
         // Check tools report for ServerTwo
         expect(mockedAxios.post).toHaveBeenCalledWith(
           'http://test.com/api/tools',
           expect.objectContaining({ tools: [
               expect.objectContaining({ name: 'tool2a', mcp_server_uuid: 'uuid2' }),
               expect.objectContaining({ name: 'tool2b', mcp_server_uuid: 'uuid2' })
           ] }),
           expect.any(Object)
        );


        // Check final result summary
        expect(result.totalServers).toBe(3);
        expect(result.processedServers).toBe(3);
        expect(result.successfulServers).toBe(3); // All sessions established and processed without throwing
        expect(result.failedServers).toBe(0);
        expect(result.errors).toHaveLength(0);
        expect(result.totalToolsReported).toBe(3); // 1 from S1 + 2 from S2 (based on mocked successCount=1 per call)
        expect(result.totalResourcesReported).toBe(1); // 1 from S1
     });

      it('should handle errors during session fetching or capability listing', async () => {
         // Mock getSession to fail for ServerTwo
         mockedGetSession.mockImplementation(async (key) => {
             if (key.startsWith('uuid1')) return mockSession1;
             if (key.startsWith('uuid2')) throw new Error('Session Failed');
             if (key.startsWith('uuid3')) return { client: { getServerCapabilities: () => ({}) }, cleanup: jest.fn() }; // Session 3 okay
             return undefined;
          });
         // Mock tools/list to fail for ServerOne
         mockSession1.client.request.mockImplementation(async (req: any) => {
           if (req.method === 'tools/list') throw new Error('Tools List Failed');
           if (req.method === 'resources/list') return { resources: [{ uri: 'res1a', name: 'Res1A' }] }; // Resources okay
           return {};
        });

        mockedAxios.post.mockResolvedValue({ data: { successCount: 1, errorCount: 0, errors: [] } }); // Mock successful API posts for resources

        const result = await reportAllCapabilities();

        expect(result.totalServers).toBe(3);
        expect(result.processedServers).toBe(3);
        expect(result.successfulServers).toBe(1); // Only ServerThree fully succeeded without internal errors
        expect(result.failedServers).toBe(2); // ServerOne (tools list failed) + ServerTwo (session failed)
        expect(result.errors).toHaveLength(2);
        expect(result.errors).toContainEqual({ server: 'ServerOne', error: 'Tools List Failed' });
        expect(result.errors).toContainEqual({ server: 'ServerTwo', error: 'Session Failed' });
        expect(result.totalToolsReported).toBe(0); // No tools reported successfully
        expect(result.totalResourcesReported).toBe(1); // Resources from ServerOne reported
        expect(mockedAxios.post).toHaveBeenCalledTimes(1); // Only the resource report call
     });

  });

});
