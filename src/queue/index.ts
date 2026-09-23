import { Queue } from "bullmq";

export const INDEX_QUEUE_NAME = "document-index";

export type IndexJobData = {
  action: "upsert" | "delete";
  documentId: string;
  tenantId: string;
};

export function isIndexJobData(value: unknown): value is IndexJobData {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const job = value as IndexJobData;

  return (
    (job.action === "upsert" || job.action === "delete") &&
    typeof job.documentId === "string" &&
    job.documentId.length > 0 &&
    typeof job.tenantId === "string" &&
    job.tenantId.length > 0
  );
}

export function bullmqConnection() {
  const url = process.env.REDIS_URL;

  if (!url) {
    throw new Error("REDIS_URL is not defined");
  }

  return {
    url,
    maxRetriesPerRequest: null,
  };
}

let indexQueue: Queue<IndexJobData> | undefined;

export function getIndexQueue(): Queue<IndexJobData> {
  if (!indexQueue) {
    indexQueue = new Queue<IndexJobData>(INDEX_QUEUE_NAME, {
      connection: bullmqConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 500,
        },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });
  }

  return indexQueue;
}

export async function enqueueIndexJob(data: IndexJobData): Promise<void> {
  await getIndexQueue().add(data.action, data);
}
