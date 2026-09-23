import mongoose from "mongoose";
import { elasticsearchClient } from "../config/elasticsearch.ts";
import { redis } from "../config/redis.ts";
import type { DependencyState } from "./status.ts";

async function probe(check: () => Promise<boolean>): Promise<DependencyState> {
  try {
    return (await check()) ? "up" : "down";
  } catch {
    return "down";
  }
}

export function checkMongo(): Promise<DependencyState> {
  return probe(async () => mongoose.connection.readyState === 1);
}

export function checkRedis(): Promise<DependencyState> {
  return probe(async () => (await redis.ping()) === "PONG");
}

export function checkElasticsearch(): Promise<DependencyState> {
  return probe(async () => elasticsearchClient.ping());
}
