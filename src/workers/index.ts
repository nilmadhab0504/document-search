import { UnrecoverableError, Worker } from "bullmq";
import { connectDatabase } from "../config/database.ts";
import { DocumentModel } from "../models/document.ts";
import {
  INDEX_QUEUE_NAME,
  bullmqConnection,
  isIndexJobData,
  type IndexJobData,
} from "../queue/index.ts";
import { invalidateTenantSearchCache } from "../services/cache.ts";
import {
  ensureDocumentsIndex,
  indexDocument,
  removeDocumentFromIndex,
} from "../services/search-index.ts";

async function waitForSearchIndex(): Promise<void> {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await ensureDocumentsIndex();
      return;
    } catch (error) {
      console.error(`Waiting for Elasticsearch (${attempt}/30)`, error);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  throw new Error("Elasticsearch did not become ready");
}

async function processIndexJob(data: IndexJobData): Promise<void> {
  if (data.action === "delete") {
    await removeDocumentFromIndex(data.documentId);
  } else {
    const document = await DocumentModel.findById(data.documentId).lean();

    if (!document || document.tenantId !== data.tenantId) {
      await removeDocumentFromIndex(data.documentId);
    } else {
      await indexDocument({
        id: document._id.toString(),
        tenantId: document.tenantId,
        title: document.title,
        content: document.content,
        createdAt: document.createdAt.toISOString(),
      });
    }
  }

  await invalidateTenantSearchCache(data.tenantId);
}

async function main(): Promise<void> {
  await connectDatabase();
  await waitForSearchIndex();

  const worker = new Worker<IndexJobData>(
    INDEX_QUEUE_NAME,
    async (job) => {
      if (!isIndexJobData(job.data)) {
        throw new UnrecoverableError("Invalid index job");
      }

      await processIndexJob(job.data);
    },
    { connection: bullmqConnection() }
  );

  worker.on("failed", (job, error) => {
    console.error(`Index job ${job?.id ?? "unknown"} failed`, error);
  });

  const shutdown = async () => {
    await worker.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  console.log("Index worker listening");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
