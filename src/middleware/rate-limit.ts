import type { Request, Response, NextFunction } from "express";
import { redis } from "../config/redis.ts";
import type { TenantRequest } from "./tenant.ts";

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 100;

export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const tenantId = (req as TenantRequest).tenantId;

    const key = `rate-limit:${tenantId}`;

    const requestCount = await redis.incr(key);

    if (requestCount === 1) {
      await redis.expire(key, WINDOW_SECONDS);
    }

    res.setHeader("X-RateLimit-Limit", MAX_REQUESTS);
    res.setHeader(
      "X-RateLimit-Remaining",
      Math.max(0, MAX_REQUESTS - requestCount)
    );

    if (requestCount > MAX_REQUESTS) {
      res.status(429).json({
        error: "Rate limit exceeded",
      });

      return;
    }

    next();
  } catch (error) {
    console.error("Rate limiting failed:", error);

    res.status(500).json({
      error: "Rate limiting service unavailable",
    });
  }
}