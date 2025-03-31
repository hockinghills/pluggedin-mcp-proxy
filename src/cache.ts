// src/cache.ts

/**
 * A generic in-memory cache with Time-To-Live (TTL) support.
 * @template T The type of data to be stored in the cache.
 */
export class Cache<T> {
  // Store expiresAt timestamp instead of creation timestamp
  private cache: Map<string, { data: T; expiresAt: number }> = new Map();
  private ttl: number; // Time-to-live in milliseconds

  /**
   * Creates an instance of Cache.
   * @param {number} [ttlMs=60000] - The time-to-live for cache entries in milliseconds. Defaults to 1 minute.
   */
  constructor(ttlMs: number = 60000) {
    this.ttl = ttlMs;
  }

  /**
   * Retrieves an item from the cache. Returns null if the item is not found or has expired.
   * @param key The cache key.
   * @returns The cached data or null.
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null; // Not found
    }

    // Check if the current time is past the expiration time
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key); // Expired
      return null;
    }

    return entry.data; // Found and valid
  }

  /**
   * Adds or updates an item in the cache.
   * @param key The cache key.
   * @param data The data to cache.
   */
  set(key: string, data: T): void {
    // Calculate expiration time when setting the entry
    const expiresAt = Date.now() + this.ttl;
    this.cache.set(key, {
      data,
      expiresAt: expiresAt
    });
  }

  /**
   * Removes an item from the cache.
   * @param key The cache key to invalidate.
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clears the entire cache.
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Gets the number of items currently in the cache (including potentially expired ones before next get).
   */
  size(): number {
    return this.cache.size;
  }
}
