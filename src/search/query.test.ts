import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDocumentSearchQuery } from "./query.ts";

describe("buildDocumentSearchQuery", () => {
  it("filters by tenant and searches title and content", () => {
    const query = buildDocumentSearchQuery("tenant-001", "consensus");

    assert.deepEqual(query.bool.filter, [{ term: { tenantId: "tenant-001" } }]);
    assert.deepEqual(query.bool.must[0]?.multi_match.fields, ["title^2", "content"]);
    assert.equal(query.bool.must[0]?.multi_match.query, "consensus");
    assert.equal(query.bool.must[0]?.multi_match.fuzziness, "AUTO");
  });
});
