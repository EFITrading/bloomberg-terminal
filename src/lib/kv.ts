/**
 * Vercel KV (Redis) Helper
 * Simple key-value store for caching market data
 */

// In-memory cache as fallback when Vercel KV is not available
const memoryCache = new Map<string, { data: any; expires: number }>();

/**
 * Store data in KV with expiration
 */
export async function kvSet(key: string, value: any, expirationSeconds: number = 300) {
  try {
    // Try to use Vercel KV if available
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const { kv } = await import('@vercel/kv');
      await kv.set(key, value, { ex: expirationSeconds });
      console.log(`✅ KV SET: ${key} (expires in ${expirationSeconds}s)`);
      return true;
    }
  } catch (error) {
    console.warn('⚠️ Vercel KV not available, using memory cache:', error);
  }

  // Fallback to memory cache
  memoryCache.set(key, {
    data: value,
    expires: Date.now() + expirationSeconds * 1000,
  });
  console.log(`✅ MEMORY SET: ${key} (expires in ${expirationSeconds}s)`);
  return true;
}

/**
 * Get data from KV
 */
export async function kvGet<T = any>(key: string): Promise<T | null> {
  try {
    // Try to use Vercel KV if available
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const { kv } = await import('@vercel/kv');
      const data = await kv.get<T>(key);
      if (data) {
        console.log(`✅ KV GET: ${key} (hit)`);
        return data;
      }
      console.log(`⚠️ KV GET: ${key} (miss)`);
      return null;
    }
  } catch (error) {
    console.warn('⚠️ Vercel KV not available, checking memory cache:', error);
  }

  // Fallback to memory cache
  const cached = memoryCache.get(key);
  if (cached) {
    if (Date.now() < cached.expires) {
      console.log(`✅ MEMORY GET: ${key} (hit)`);
      return cached.data as T;
    } else {
      // Expired, remove from cache
      memoryCache.delete(key);
      console.log(`⚠️ MEMORY GET: ${key} (expired)`);
    }
  }

  console.log(`⚠️ MEMORY GET: ${key} (miss)`);
  return null;
}

/**
 * Delete data from KV
 */
export async function kvDel(key: string) {
  try {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const { kv } = await import('@vercel/kv');
      await kv.del(key);
      console.log(`✅ KV DEL: ${key}`);
      return true;
    }
  } catch (error) {
    console.warn('⚠️ Vercel KV not available:', error);
  }

  // Fallback to memory cache
  memoryCache.delete(key);
  console.log(`✅ MEMORY DEL: ${key}`);
  return true;
}

/**
 * Check if key exists in KV
 */
export async function kvExists(key: string): Promise<boolean> {
  try {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const { kv } = await import('@vercel/kv');
      const exists = await kv.exists(key);
      return exists === 1;
    }
  } catch (error) {
    console.warn('⚠️ Vercel KV not available:', error);
  }

  // Fallback to memory cache
  const cached = memoryCache.get(key);
  if (cached && Date.now() < cached.expires) {
    return true;
  }
  return false;
}

/**
 * Get multiple keys at once
 */
export async function kvMGet<T = any>(keys: string[]): Promise<(T | null)[]> {
  try {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const { kv } = await import('@vercel/kv');
      const results = await kv.mget(...keys) as (T | null)[];
      console.log(`✅ KV MGET: ${keys.length} keys`);
      return results;
    }
  } catch (error) {
    console.warn('⚠️ Vercel KV not available:', error);
  }

  // Fallback to memory cache
  return keys.map((key) => {
    const cached = memoryCache.get(key);
    if (cached && Date.now() < cached.expires) {
      return cached.data as T;
    }
    return null;
  });
}
