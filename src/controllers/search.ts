import type { Request, Response } from "express";
import type { TenantRequest } from "../middleware/tenant.ts";
import { readSearchCache, writeSearchCache } from "../services/cache.ts";
import {
  ensureDocumentsIndex,
  searchIndexedDocuments,
} from "../services/search-index.ts";

export async function searchDocuments(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { q } = req.query;
    const tenantId = (req as TenantRequest).tenantId;

    if (!q || typeof q !== "string") {
      res.status(400).json({
        error: "Query parameter 'q' is required",
      });
      return;
    }

    const cachedResult = await readSearchCache(tenantId, q);

    if (cachedResult) {
      res.status(200).json({
        ...JSON.parse(cachedResult),
        cached: true,
      });
      return;
    }

    await ensureDocumentsIndex();

    const result = await searchIndexedDocuments(tenantId, q);

    await writeSearchCache(tenantId, q, JSON.stringify(result));

    res.status(200).json({
      ...result,
      cached: false,
    });
  } catch (error) {
    console.error("Search failed:", error);

    res.status(500).json({
      error: "Search failed",
    });
  }
}
