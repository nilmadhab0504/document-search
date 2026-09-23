import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isIndexJobData } from "./index.ts";

describe("isIndexJobData", () => {
  it("accepts upsert and delete jobs", () => {
    assert.equal(
      isIndexJobData({
        action: "upsert",
        documentId: "abc",
        tenantId: "tenant-001",
      }),
      true
    );
    assert.equal(
      isIndexJobData({
        action: "delete",
        documentId: "abc",
        tenantId: "tenant-001",
      }),
      true
    );
  });

  it("rejects incomplete jobs", () => {
    assert.equal(isIndexJobData({ action: "upsert", documentId: "", tenantId: "t" }), false);
    assert.equal(isIndexJobData({ action: "reindex" }), false);
    assert.equal(isIndexJobData(null), false);
  });
});
