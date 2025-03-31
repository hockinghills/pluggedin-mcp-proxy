import axios from "axios";
import { getPluggedinMCPApiBaseUrl, getPluggedinMCPApiKey } from "./utils.js";

export enum ProfileCapability {
  TOOLS_MANAGEMENT = "TOOLS_MANAGEMENT",
}

let _capabilitiesCache: ProfileCapability[] | null = null;
let _capabilitiesCacheTimestamp: number = 0;
const CACHE_TTL_MS = 1000; // 1 second cache TTL

export async function getProfileCapabilities(
  forceRefresh: boolean = false
): Promise<ProfileCapability[]> {
  const currentTime = Date.now();
  const cacheAge = currentTime - _capabilitiesCacheTimestamp;

  // Use cache if it exists, is not null, and either:
  // 1. forceRefresh is false, or
  // 2. forceRefresh is true but cache is less than 1 second old
  if (
    _capabilitiesCache !== null &&
    (!forceRefresh || cacheAge < CACHE_TTL_MS)
  ) {
    return _capabilitiesCache;
  }

  try {
    const apiKey = getPluggedinMCPApiKey();
    const apiBaseUrl = getPluggedinMCPApiBaseUrl();

    if (!apiKey) {
      // console.error( // Temporarily comment out to prevent potential stdio interference
      //   "PLUGGEDIN_API_KEY is not set. Please set it via environment variable or command line argument."
      // );
      return _capabilitiesCache || [];
    }

    const headers = { Authorization: `Bearer ${apiKey}` };
    const response = await axios.get(`${apiBaseUrl}/api/profile-capabilities`, {
      headers,
    });
    const data = response.data;

    // Access the 'profileCapabilities' array in the response
    if (data && data.profileCapabilities) {
      const capabilities = data.profileCapabilities
        .map((capability: string) => {
          // Map string to enum value if it exists, otherwise return undefined
          return ProfileCapability[
            capability as keyof typeof ProfileCapability
          ];
        })
        .filter(
          (
            capability: ProfileCapability | undefined
          ): capability is ProfileCapability => capability !== undefined
        );

      _capabilitiesCache = capabilities;
      _capabilitiesCacheTimestamp = currentTime;
      return capabilities;
    }

    return _capabilitiesCache || [];
  } catch (error) {
    // Return empty array if API doesn't exist or has errors
    if (_capabilitiesCache !== null) {
      return _capabilitiesCache;
    }
    return [];
  }
}
