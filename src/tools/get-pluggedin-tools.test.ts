import { GetPluggedinToolsTool } from './get-pluggedin-tools.js';
import { getPluggedinMCPApiKey, getPluggedinMCPApiBaseUrl } from '../utils.js';
import axios from 'axios';
import { container } from '../di-container.js'; // Import container
import { Cache } from '../cache.js'; // Import Cache type

// Mock dependencies using Jest
jest.mock('axios');
jest.mock('../utils.js', () => ({
  getPluggedinMCPApiKey: jest.fn(),
  getPluggedinMCPApiBaseUrl: jest.fn(),
}));

// Mock the cache directly via the container
const mockToolsCache = {
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn(),
  invalidateAll: jest.fn(),
  size: jest.fn(),
};
container.register<Cache<string>>('toolsCache', mockToolsCache as unknown as Cache<string>); // Register mock

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedGetPluggedinMCPApiKey = getPluggedinMCPApiKey as jest.Mock;
const mockedGetPluggedinMCPApiBaseUrl = getPluggedinMCPApiBaseUrl as jest.Mock;

describe('GetPluggedinToolsTool', () => {
  let getToolsPlugin: GetPluggedinToolsTool;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    mockToolsCache.get.mockReset();
    mockToolsCache.set.mockReset();

    // Create a new instance for each test
    getToolsPlugin = new GetPluggedinToolsTool();

    // Default mock implementations
    mockedGetPluggedinMCPApiKey.mockReturnValue('test-api-key');
    mockedGetPluggedinMCPApiBaseUrl.mockReturnValue('http://test.com');
    mockToolsCache.get.mockReturnValue(null); // Default to cache miss
  });

  it('should return error result when no API key is set', async () => {
    // Arrange
    mockedGetPluggedinMCPApiKey.mockReturnValue(undefined);

    // Act
    const result = await getToolsPlugin.execute({});

    // Assert
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'Configuration Error: Missing API Key or Base URL.' }]);
    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(mockToolsCache.get).not.toHaveBeenCalled();
  });

  it('should return error result when no API base URL is set', async () => {
    // Arrange
    mockedGetPluggedinMCPApiBaseUrl.mockReturnValue(undefined);

    // Act
    const result = await getToolsPlugin.execute({});

    // Assert
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'Configuration Error: Missing API Key or Base URL.' }]);
    expect(mockedAxios.get).not.toHaveBeenCalled();
     expect(mockToolsCache.get).not.toHaveBeenCalled();
  });

  it('should return cached tool names if available', async () => {
    // Arrange
    const cachedData = JSON.stringify(['cached_server__tool1'], null, 2);
    mockToolsCache.get.mockReturnValue(cachedData);

    // Act
    const result = await getToolsPlugin.execute({});

    // Assert
    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([{ type: 'text', text: cachedData }]);
    expect(mockToolsCache.get).toHaveBeenCalledWith('tools:test-api-key');
    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(mockToolsCache.set).not.toHaveBeenCalled();
  });

  it('should fetch tools from API, prefix names, cache, and return them if not cached', async () => {
    // Arrange
    const apiToolsResponse = {
      data: {
        results: [
          { name: 'tool1', mcp_server_uuid: 'uuid1', description: 'Tool 1' },
          { name: 'tool2', mcp_server_uuid: 'uuid2', description: 'Tool 2' },
        ],
      },
    };
    const apiServersResponse = {
      data: {
        uuid1: { name: 'Server One' },
        uuid2: { name: 'Server_Two' },
      },
    };
    mockedAxios.get
      .mockResolvedValueOnce(apiToolsResponse) // First call for /api/tools
      .mockResolvedValueOnce(apiServersResponse); // Second call for /api/mcp-servers

    const expectedToolNames = ['server_one__tool1', 'server_two__tool2'];
    const expectedResultString = JSON.stringify(expectedToolNames, null, 2);

    // Act
    const result = await getToolsPlugin.execute({});

    // Assert
    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([{ type: 'text', text: expectedResultString }]);
    expect(mockToolsCache.get).toHaveBeenCalledWith('tools:test-api-key');
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    expect(mockedAxios.get).toHaveBeenCalledWith('http://test.com/api/tools', { headers: { Authorization: 'Bearer test-api-key' } });
    expect(mockedAxios.get).toHaveBeenCalledWith('http://test.com/api/mcp-servers', { headers: { Authorization: 'Bearer test-api-key' } });
    expect(mockToolsCache.set).toHaveBeenCalledWith('tools:test-api-key', expectedResultString);
  });

   it('should handle API error when fetching tools', async () => {
    // Arrange
    mockedAxios.get.mockRejectedValueOnce(new Error('API Fetch Failed'));

    // Act
    const result = await getToolsPlugin.execute({});

    // Assert
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'API Error: API Fetch Failed' }]);
    expect(mockToolsCache.get).toHaveBeenCalledWith('tools:test-api-key');
    expect(mockedAxios.get).toHaveBeenCalledTimes(1); // Only the first call fails
    expect(mockToolsCache.set).not.toHaveBeenCalled();
  });

  it('should handle API error when fetching server names', async () => {
    // Arrange
     const apiToolsResponse = {
      data: {
        results: [ { name: 'tool1', mcp_server_uuid: 'uuid1' } ],
      },
    };
    mockedAxios.get
      .mockResolvedValueOnce(apiToolsResponse) // Tools fetch succeeds
      .mockRejectedValueOnce(new Error('Server Fetch Failed')); // Server names fetch fails

    const expectedToolNames = ['uuid1__tool1']; // Fallback to UUID
    const expectedResultString = JSON.stringify(expectedToolNames, null, 2);

    // Act
    const result = await getToolsPlugin.execute({});

     // Assert
    expect(result.isError).toBeUndefined(); // Should still succeed but log error
    expect(result.content).toEqual([{ type: 'text', text: expectedResultString }]);
    expect(mockToolsCache.get).toHaveBeenCalledWith('tools:test-api-key');
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    expect(mockToolsCache.set).toHaveBeenCalledWith('tools:test-api-key', expectedResultString);
    // We expect logger.error to have been called, but mocking logger is complex here
  });

   it('should handle invalid API response structure for tools', async () => {
    // Arrange
    const invalidApiResponse = { data: { not_results: [] } }; // Incorrect structure
    mockedAxios.get.mockResolvedValueOnce(invalidApiResponse);

    // Act
    const result = await getToolsPlugin.execute({});

    // Assert
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'Error: Invalid response from API.' }]);
    expect(mockToolsCache.get).toHaveBeenCalledWith('tools:test-api-key');
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(mockToolsCache.set).not.toHaveBeenCalled();
  });

});
