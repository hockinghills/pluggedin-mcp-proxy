import { Cache } from './cache.js';

// Use Jest's fake timers to control time
jest.useFakeTimers();

describe('Cache', () => {
  let cache: Cache<string>;
  const ttl = 1000; // 1 second TTL for testing

  beforeEach(() => {
    // Create a new cache instance before each test
    cache = new Cache<string>(ttl);
    // Reset timers before each test
    jest.clearAllTimers();
  });

  it('should initialize with an empty map', () => {
    expect(cache.size()).toBe(0);
  });

  it('should set and get a value within TTL', () => {
    const key = 'testKey';
    const value = 'testValue';
    cache.set(key, value);
    expect(cache.get(key)).toBe(value);
    expect(cache.size()).toBe(1);
  });

  it('should return null for a non-existent key', () => {
    expect(cache.get('nonExistentKey')).toBeNull();
  });

  it('should return null for an expired key', () => {
    const key = 'testKey';
    const value = 'testValue';
    cache.set(key, value);

    // Advance time beyond the TTL
    jest.advanceTimersByTime(ttl + 1);

    expect(cache.get(key)).toBeNull();
    // Check if the expired item was actually removed from the internal map
    expect(cache.size()).toBe(0);
  });

  it('should update the timestamp when setting an existing key', () => {
    const key = 'testKey';
    cache.set(key, 'value1');
    const entry1 = (cache as any).cache.get(key); // Access private member for testing
    const timestamp1 = entry1.timestamp;

    // Advance time but stay within TTL
    jest.advanceTimersByTime(ttl / 2);
    cache.set(key, 'value2'); // Update the value (and timestamp)
    const entry2 = (cache as any).cache.get(key);
    const timestamp2 = entry2.timestamp;

    expect(timestamp2).toBeGreaterThan(timestamp1);
    expect(cache.get(key)).toBe('value2'); // Ensure the new value is retrieved

    // Advance time again, the TTL should be based on the *last* set operation
    jest.advanceTimersByTime(ttl / 2 + 1);
    expect(cache.get(key)).toBe('value2'); // Still valid

    jest.advanceTimersByTime(ttl / 2);
    expect(cache.get(key)).toBeNull(); // Now expired
  });

  it('should invalidate a specific key', () => {
    const key1 = 'key1';
    const key2 = 'key2';
    cache.set(key1, 'value1');
    cache.set(key2, 'value2');
    expect(cache.size()).toBe(2);

    cache.invalidate(key1);

    expect(cache.get(key1)).toBeNull();
    expect(cache.get(key2)).toBe('value2');
    expect(cache.size()).toBe(1);
  });

  it('should invalidate all keys', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    expect(cache.size()).toBe(3);

    cache.invalidateAll();

    expect(cache.get('key1')).toBeNull();
    expect(cache.get('key2')).toBeNull();
    expect(cache.get('key3')).toBeNull();
    expect(cache.size()).toBe(0);
  });

  it('should handle different data types', () => {
    const numberCache = new Cache<number>(ttl);
    const objectCache = new Cache<{ id: number }>(ttl);
    const arrayCache = new Cache<string[]>(ttl);

    numberCache.set('num', 123);
    objectCache.set('obj', { id: 1 });
    arrayCache.set('arr', ['a', 'b']);

    expect(numberCache.get('num')).toBe(123);
    expect(objectCache.get('obj')).toEqual({ id: 1 });
    expect(arrayCache.get('arr')).toEqual(['a', 'b']);
  });
});
