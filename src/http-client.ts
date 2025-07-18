import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { getPluggedinMCPApiKey, getPluggedinMCPApiBaseUrl } from './utils.js';
import { debugLog, debugError } from './debug-log.js';

/**
 * Creates a configured axios instance with standard headers and error handling
 */
export function createHttpClient(): AxiosInstance {
  const apiKey = getPluggedinMCPApiKey();
  const baseUrl = getPluggedinMCPApiBaseUrl();

  const client = axios.create({
    baseURL: baseUrl,
    timeout: 30000, // 30 seconds default timeout
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey && { 'Authorization': `Bearer ${apiKey}` })
    }
  });

  // Request interceptor for logging
  client.interceptors.request.use((config) => {
    debugLog(`[HTTP] ${config.method?.toUpperCase()} ${config.url}`, {
      headers: config.headers,
      params: config.params
    });
    return config;
  }, (error) => {
    debugError('[HTTP] Request error:', error);
    return Promise.reject(error);
  });

  // Response interceptor for logging and error handling
  client.interceptors.response.use((response) => {
    debugLog(`[HTTP] Response ${response.status} from ${response.config.url}`);
    return response;
  }, (error: AxiosError) => {
    debugError(`[HTTP] Response error:`, {
      status: error.response?.status,
      url: error.config?.url,
      message: error.message
    });
    return Promise.reject(error);
  });

  return client;
}

/**
 * Makes an authenticated API request with standard error handling
 */
export async function makeApiRequest<T = any>(
  config: AxiosRequestConfig & { requiresAuth?: boolean }
): Promise<T> {
  const { requiresAuth = true, ...axiosConfig } = config;
  
  if (requiresAuth && !getPluggedinMCPApiKey()) {
    throw new Error('API key is required for this operation');
  }

  const client = createHttpClient();
  
  try {
    const response = await client.request<T>(axiosConfig);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // Enhance error messages based on status codes
      const status = error.response?.status;
      const enhancedMessage = getEnhancedErrorMessage(status, error.message);
      throw new Error(enhancedMessage);
    }
    throw error;
  }
}

/**
 * Provides user-friendly error messages based on HTTP status codes
 */
function getEnhancedErrorMessage(status: number | undefined, defaultMessage: string): string {
  switch (status) {
    case 400:
      return 'Invalid request data provided';
    case 401:
      return 'Invalid API key or authentication failed';
    case 403:
      return 'Permission denied - check your account status';
    case 404:
      return 'Resource not found';
    case 413:
      return 'Request payload too large';
    case 429:
      return 'Rate limit exceeded - please try again later';
    case 500:
      return 'Server error - please try again later';
    case 502:
    case 503:
    case 504:
      return 'Service temporarily unavailable - please try again later';
    default:
      return defaultMessage;
  }
}

/**
 * Helper to build URL with query parameters
 */
export function buildUrl(path: string, params?: Record<string, any>): string {
  const baseUrl = getPluggedinMCPApiBaseUrl();
  const url = new URL(path, baseUrl);
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        // Convert booleans to 1/0 for backend compatibility
        if (typeof value === 'boolean') {
          url.searchParams.append(key, value ? '1' : '0');
        } else {
          url.searchParams.append(key, String(value));
        }
      }
    });
  }
  
  return url.toString();
}