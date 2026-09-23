import { elasticsearchClient } from "../config/elasticsearch.ts";
import { buildDocumentSearchQuery } from "../search/query.ts";

export const DOCUMENTS_INDEX = "documents";

type IndexedDocument = {
  id: string;
  tenantId: string;
  title: string;
  content: string;
  createdAt: string;
};

type DocumentSource = {
  tenantId: string;
  title: string;
  content: string;
  createdAt: string;
};

export async function ensureDocumentsIndex(): Promise<void> {
  const exists = await elasticsearchClient.indices.exists({
    index: DOCUMENTS_INDEX,
  });

  if (exists) {
    return;
  }

  await elasticsearchClient.indices.create({
    index: DOCUMENTS_INDEX,
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
    },
    mappings: {
      properties: {
        tenantId: { type: "keyword" },
        title: { type: "text" },
        content: { type: "text" },
        createdAt: { type: "date" },
      },
    },
  });

  console.log(`Created Elasticsearch index: ${DOCUMENTS_INDEX}`);
}

export async function indexDocument(document: IndexedDocument): Promise<void> {
  await elasticsearchClient.index({
    index: DOCUMENTS_INDEX,
    id: document.id,
    refresh: true,
    document: {
      tenantId: document.tenantId,
      title: document.title,
      content: document.content,
      createdAt: document.createdAt,
    },
  });
}

export async function removeDocumentFromIndex(documentId: string): Promise<void> {
  await elasticsearchClient.delete(
    {
      index: DOCUMENTS_INDEX,
      id: documentId,
      refresh: true,
    },
    { ignore: [404] }
  );
}

export async function searchIndexedDocuments(tenantId: string, query: string) {
  const response = await elasticsearchClient.search<DocumentSource>({
    index: DOCUMENTS_INDEX,
    size: 20,
    query: buildDocumentSearchQuery(tenantId, query),
    highlight: {
      fields: {
        title: {},
        content: {},
      },
    },
  });

  const hits = response.hits.hits;

  return {
    query,
    tenantId,
    count: hits.length,
    results: hits.map((hit) => ({
      id: hit._id,
      score: hit._score,
      tenantId: hit._source?.tenantId,
      title: hit._source?.title,
      content: hit._source?.content,
      highlights: hit.highlight ?? {},
    })),
  };
}
