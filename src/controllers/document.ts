import type { Request, Response } from "express";
import mongoose from "mongoose";
import { DocumentModel } from "../models/document.ts";
import type { TenantRequest } from "../middleware/tenant.ts";
import { enqueueIndexJob } from "../queue/index.ts";
import { invalidateTenantSearchCache } from "../services/cache.ts";

async function queueIndexChange(
  action: "upsert" | "delete",
  documentId: string,
  tenantId: string
): Promise<"queued" | "failed"> {
  try {
    await enqueueIndexJob({ action, documentId, tenantId });
    await invalidateTenantSearchCache(tenantId);
    return "queued";
  } catch (error) {
    console.error("Failed to enqueue index job:", error);
    return "failed";
  }
}

function parseDocumentId(
  id: string | string[] | undefined
): mongoose.Types.ObjectId | undefined {
  if (typeof id !== "string" || !mongoose.isValidObjectId(id)) {
    return undefined;
  }

  return new mongoose.Types.ObjectId(id);
}

export async function createDocument(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { title, content, metadata } = req.body;
    const tenantId = (req as TenantRequest).tenantId;

    if (!title || !content) {
      res.status(400).json({
        error: "title and content are required",
      });
      return;
    }

    const document = await DocumentModel.create({
      tenantId,
      title,
      content,
      metadata,
    });

    const indexing = await queueIndexChange("upsert", document._id.toString(), tenantId);

    res.status(201).json({
      id: document._id,
      tenantId: document.tenantId,
      title: document.title,
      content: document.content,
      metadata: document.metadata,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      indexing,
    });
  } catch (error) {
    console.error("Failed to create document:", error);

    res.status(500).json({
      error: "Failed to create document",
    });
  }
}

export async function getDocument(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const id = parseDocumentId(req.params["id"]);
      const tenantId = (req as TenantRequest).tenantId;

      if (!id) {
        res.status(400).json({
          error: "Invalid document id",
        });
        return;
      }

      const document = await DocumentModel.findOne({
        _id: id,
        tenantId,
      });
  
      if (!document) {
        res.status(404).json({
          error: "Document not found",
        });
        return;
      }
  
      res.status(200).json({
        id: document._id,
        tenantId: document.tenantId,
        title: document.title,
        content: document.content,
        metadata: document.metadata,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      });
    } catch (error) {
      console.error("Failed to retrieve document:", error);
  
      res.status(500).json({
        error: "Failed to retrieve document",
      });
    }
  }

  export async function deleteDocument(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const id = parseDocumentId(req.params["id"]);
      const tenantId = (req as TenantRequest).tenantId;

      if (!id) {
        res.status(400).json({
          error: "Invalid document id",
        });
        return;
      }

      const document = await DocumentModel.findOneAndDelete({
        _id: id,
        tenantId,
      });
  
      if (!document) {
        res.status(404).json({
          error: "Document not found",
        });
        return;
      }
  
      const indexing = await queueIndexChange(
        "delete",
        document._id.toString(),
        tenantId
      );

      res.status(200).json({
        message: "Document deleted successfully",
        id: document._id,
        indexing,
      });
    } catch (error) {
      console.error("Failed to delete document:", error);
  
      res.status(500).json({
        error: "Failed to delete document",
      });
    }
  }