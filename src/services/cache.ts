import { redis } from "../config/redis.ts";
import {
  SEARCH_CACHE_TTL_SECONDS,
  searchCacheKey,
  tenantSearchCachePattern,
} from "../search/cache-key.ts";

export async function readSearchCache(tenantId: string, query: string) {
  return redis.get(searchCacheKey(tenantId, query));
}

export async function writeSearchCache(
  tenantId: string,
  query: string,
  payload: string
): Promise<void> {
  await redis.set(
    searchCacheKey(tenantId, query),
    payload,
    "EX",
    SEARCH_CACHE_TTL_SECONDS
  );
}

export async function invalidateTenantSearchCache(tenantId: string): Promise<void> {
  const stream = redis.scanStream({
    match: tenantSearchCachePattern(tenantId),
    count: 100,
  });
  const keys: string[] = [];

  for await (const batch of stream) {
    keys.push(...(batch as string[]));
  }

  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
