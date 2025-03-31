import { container } from './di-container.js';
import { Logger } from './logging.js';

const logger = container.get<Logger>('logger');

/**
 * Stores the mapping between a prefixed tool name (e.g., "serverone__tool_a")
 * and the session key (e.g., "uuid1_hash") responsible for that tool.
 * This map is populated by the capability reporting process.
 */
const toolOriginMap: Map<string, string> = new Map();

/**
 * Clears the entire tool origin map.
 * Should be called before repopulating during capability reporting.
 */
export function clearToolOriginMap(): void {
  logger.info('Clearing tool origin map.');
  toolOriginMap.clear();
}

/**
 * Adds or updates an entry in the tool origin map.
 * @param prefixedToolName - The prefixed name of the tool.
 * @param sessionKey - The session key associated with the server providing the tool.
 */
export function registerToolOrigin(prefixedToolName: string, sessionKey: string): void {
  // logger.debug(`Registering origin for tool "${prefixedToolName}" to session key "${sessionKey}"`);
  toolOriginMap.set(prefixedToolName, sessionKey);
}

/**
 * Retrieves the session key for a given prefixed tool name.
 * @param prefixedToolName - The prefixed name of the tool.
 * @returns The session key if found, otherwise undefined.
 */
export function getSessionKeyForTool(prefixedToolName: string): string | undefined {
  return toolOriginMap.get(prefixedToolName);
}

/**
 * Gets the total number of registered tool origins.
 * @returns The number of entries in the map.
 */
export function getToolOriginMapSize(): number {
  return toolOriginMap.size;
}
