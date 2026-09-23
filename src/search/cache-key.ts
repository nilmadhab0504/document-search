export const SEARCH_CACHE_TTL_SECONDS = 60;

export function searchCacheKey(tenantId: string, query: string): string {
  return `search:${tenantId}:${query.trim().toLowerCase()}`;
}

export function tenantSearchCachePattern(tenantId: string): string {
  return `search:${tenantId}:*`;
}
