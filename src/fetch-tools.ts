import axios from "axios";
import { getPluggedinMCPApiBaseUrl, getPluggedinMCPApiKey } from "./utils.js";

enum ToolStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
}

// Define interface for tool parameters with only required fields
export interface ToolParameters {
  mcp_server_uuid: string;
  name: string;
  status: ToolStatus;
}

let _toolsCache: Record<string, ToolParameters> | null = null;
let _toolsCacheTimestamp: number = 0;
const CACHE_TTL_MS = 1000; // 1 second cache TTL

export async function getInactiveTools(
  forceRefresh: boolean = false
): Promise<Record<string, ToolParameters>> {
  const currentTime = Date.now();
  const cacheAge = currentTime - _toolsCacheTimestamp;

  // Use cache if it exists, is not null, and either:
  // 1. forceRefresh is false, or
  // 2. forceRefresh is true but cache is less than 1 second old
  if (_toolsCache !== null && (!forceRefresh || cacheAge < CACHE_TTL_MS)) {
    return _toolsCache;
  }

  try {
    const apiKey = getPluggedinMCPApiKey();
    const apiBaseUrl = getPluggedinMCPApiBaseUrl();

    if (!apiKey) {
      // console.error( // Temporarily comment out
      //   "PLUGGEDIN_API_KEY is not set. Please set it via environment variable or command line argument."
      // );
      return _toolsCache || {};
    }

    const headers = { Authorization: `Bearer ${apiKey}` };
    const response = await axios.get(
      `${apiBaseUrl}/api/tools?status=${ToolStatus.INACTIVE}`,
      {
        headers,
      }
    );
    const data = response.data;

    const toolDict: Record<string, ToolParameters> = {};
    // Access the 'results' array in the response
    if (data && data.results) {
      for (const tool of data.results) {
        const params: ToolParameters = {
          mcp_server_uuid: tool.mcp_server_uuid,
          name: tool.name,
          status: tool.status,
        };

        const uniqueId = `${tool.mcp_server_uuid}:${tool.name}`;
        toolDict[uniqueId] = params;
      }
    }

    _toolsCache = toolDict;
    _toolsCacheTimestamp = currentTime;
    return toolDict;
  } catch (error) {
    // Return empty object if API doesn't exist or has errors
    if (_toolsCache !== null) {
      return _toolsCache;
    }
    return {};
  }
}
