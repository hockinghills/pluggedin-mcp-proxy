import { debugLog, debugError } from './debug-log.js';

/**
 * Manages MCP server sessions in a centralized, testable way
 */
export class SessionManager {
  private sessions: Map<string, any> = new Map();

  /**
   * Get a session by server UUID
   */
  getSessionByServerUuid(serverUuid: string): any | null {
    // Direct lookup by serverUuid
    const directSession = this.sessions.get(serverUuid);
    if (directSession) {
      return directSession;
    }

    // Fallback to prefix matching for backward compatibility
    // TODO: Remove this once all session creation uses serverUuid directly
    for (const [key, session] of this.sessions) {
      if (key.startsWith(serverUuid + '_')) {
        debugLog(`[SessionManager] Using prefix match for ${serverUuid}`);
        return session;
      }
    }

    return null;
  }

  /**
   * Get a session by exact key
   */
  getSession(key: string): any | null {
    return this.sessions.get(key) || null;
  }

  /**
   * Set a session
   */
  setSession(key: string, session: any): void {
    debugLog(`[SessionManager] Setting session for ${key}`);
    this.sessions.set(key, session);
  }

  /**
   * Delete a session
   */
  deleteSession(key: string): boolean {
    debugLog(`[SessionManager] Deleting session for ${key}`);
    return this.sessions.delete(key);
  }

  /**
   * Get all sessions
   */
  getAllSessions(): Map<string, any> {
    return new Map(this.sessions);
  }

  /**
   * Clear all sessions
   */
  clearSessions(): void {
    debugLog(`[SessionManager] Clearing all sessions`);
    this.sessions.clear();
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Check if a session exists
   */
  hasSession(key: string): boolean {
    return this.sessions.has(key);
  }

  /**
   * Find sessions by predicate
   */
  findSessions(predicate: (key: string, session: any) => boolean): Array<[string, any]> {
    const results: Array<[string, any]> = [];
    for (const [key, session] of this.sessions) {
      if (predicate(key, session)) {
        results.push([key, session]);
      }
    }
    return results;
  }

  /**
   * Migrate from global.sessions to SessionManager
   */
  static fromGlobalSessions(): SessionManager {
    const manager = new SessionManager();
    const globalSessions = (global as any).sessions;
    
    if (globalSessions && typeof globalSessions === 'object') {
      debugLog('[SessionManager] Migrating from global.sessions');
      Object.entries(globalSessions).forEach(([key, session]) => {
        manager.setSession(key, session);
      });
    }
    
    return manager;
  }

  /**
   * Export to object for backward compatibility
   */
  toObject(): Record<string, any> {
    const obj: Record<string, any> = {};
    this.sessions.forEach((session, key) => {
      obj[key] = session;
    });
    return obj;
  }
}

// Create a singleton instance
export const sessionManager = new SessionManager();