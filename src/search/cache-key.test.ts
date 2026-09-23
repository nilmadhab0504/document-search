import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  searchCacheKey,
  tenantSearchCachePattern,
} from "./cache-key.ts";

describe("search cache keys", () => {
  it("scopes the key to the tenant and normalizes the query", () => {
    assert.equal(searchCacheKey("tenant-001", "  Distributed "), "search:tenant-001:distributed");
  });

  it("uses a tenant-only pattern for invalidation", () => {
    assert.equal(tenantSearchCachePattern("tenant-001"), "search:tenant-001:*");
    assert.equal(
      searchCacheKey("tenant-002", "distributed").startsWith("search:tenant-001:"),
      false
    );
  });
});
