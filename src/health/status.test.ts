import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateHealth } from "./status.ts";

describe("aggregateHealth", () => {
  it("reports ok only when every dependency is up", () => {
    assert.deepEqual(
      aggregateHealth({
        mongodb: "up",
        redis: "up",
        elasticsearch: "up",
      }),
      {
        status: "ok",
        dependencies: {
          mongodb: "up",
          redis: "up",
          elasticsearch: "up",
        },
      }
    );
  });

  it("reports degraded when any dependency is down", () => {
    const body = aggregateHealth({
      mongodb: "up",
      redis: "down",
      elasticsearch: "up",
    });

    assert.equal(body.status, "degraded");
  });
});
