import { Redis } from '@upstash/redis';

// Determine environment dynamically to support both Vite client and Node server
const getEnv = (key: string) => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const viteKey = `VITE_${key}`;
    // @ts-ignore
    return import.meta.env[viteKey] || import.meta.env[key];
  }
  return undefined;
};

const url = getEnv('UPSTASH_REDIS_REST_URL');
const token = getEnv('UPSTASH_REDIS_REST_TOKEN');

export const redisClient = (url && token) ? new Redis({ url, token }) : null;

/**
 * Generic wrapper to check Redis cache first, then fetch and store if missed.
 * @param key Unique cache key
 * @param ttlSeconds Time-to-live in seconds
 * @param fetchFn Function that returns a Promise of the data
 */
export async function getCachedOrFetch<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>
): Promise<T> {
  if (!redisClient) {
    return fetchFn();
  }

  try {
    const cachedData = await redisClient.get<T>(key);
    if (cachedData !== null && cachedData !== undefined) {
      console.log(`[CACHE HIT] key: ${key}`);
      return cachedData;
    }
  } catch (error) {
    console.warn(`[Cache Read Error] ${key}:`, error);
  }

  console.log(`[CACHE MISS] key: ${key}`);
  const data = await fetchFn();

  try {
    if (data !== null && data !== undefined) {
      await redisClient.set(key, data, { ex: ttlSeconds });
      console.log(`[CACHE WRITE] key: ${key} TTL: ${ttlSeconds}s`);
    }
  } catch (error) {
    console.warn(`[Cache Write Error] ${key}:`, error);
  }

  return data;
}

/**
 * Invalidate a cached key (typically called on writes/updates).
 * @param key Unique cache key
 */
export async function invalidateCache(key: string) {
  if (!redisClient) return;
  try {
    await redisClient.del(key);
    console.log(`[Cache Invalidated] ${key}`);
  } catch (error) {
    console.warn(`[Cache Invalidate Error] ${key}:`, error);
  }
}
