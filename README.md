# Document search service

A multi-tenant search API. A document is saved in MongoDB first, then a background worker copies it into Elasticsearch. Search never scans MongoDB. It asks Elasticsearch, and Redis remembers recent answers for that tenant.

That split is the point of the design. Creating a document stays fast because the request does not wait for the search index. Search stays fast because it hits an inverted index, and a repeated query can be served from cache. Each tenant only sees its own documents.

## How a document becomes searchable

1. The client sends `POST /documents` with an `X-Tenant-ID` header.
2. The API writes the document to MongoDB. That database is the source of truth: title, content, metadata, and timestamps live there.
3. The API puts an `upsert` job on a BullMQ queue named `document-index`. The queue itself is stored in Redis. The response comes back immediately with `indexing: "queued"`.
4. The worker process picks up the job, reads the document back from MongoDB, and indexes `tenantId`, `title`, `content`, and `createdAt` in Elasticsearch.
5. The worker deletes that tenant's cached search results so the next search cannot return the old list.

Delete follows the same path in reverse. The API removes the MongoDB row only when both the id and the tenant match, then queues a `delete` job. The worker removes that id from Elasticsearch.

If Redis cannot accept the job, the MongoDB write still stands and the response says `indexing: "failed"`. Search will not know about that document until something enqueues the job again. Failed jobs are retried five times with exponential backoff.

Search is eventually consistent. A query issued in the short gap after `201` and before the worker finishes can miss the new document. Wait a moment and search again.

## How search works

`GET /search?q=consensus` does three things:

1. It looks in Redis for `search:{tenantId}:{query}`. The query is trimmed and lowercased, so `Consensus` and `consensus` share one cache entry. Entries expire after 60 seconds.
2. On a miss, Elasticsearch runs a query that always filters on `tenantId` and then fuzzy-matches `title` (boosted) and `content`. Up to 20 hits come back, with a score and highlights.
3. That body is stored in Redis. The response includes `cached: true` or `cached: false` so you can see which path served it.

A tenant cannot search another tenant's documents. The tenant id is a filter on every Elasticsearch query and a condition on every MongoDB read and delete. The prototype trusts the `X-Tenant-ID` header. It does not authenticate the caller. Production would take the tenant from a verified token instead. That gap is described in `docs/PRODUCTION.md`.

Document and search routes also rate-limit each tenant to 100 requests per 60 seconds. If Redis is down, those routes fail rather than skipping the limit.

## Run

Docker Compose starts the API, the worker, MongoDB, Redis, and Elasticsearch.

```bash
docker compose up --build
```

| Service | What it does | Port |
| --- | --- | --- |
| API | HTTP API | 3000 |
| Worker | Consumes `document-index` and updates Elasticsearch | none |
| MongoDB 8.0.4 | Document store | 27017 |
| Redis 7 | Cache, rate limits, and the BullMQ queue | 6379 |
| Elasticsearch 8.15.3 | Search index | 9200 |

MongoDB is pinned to 8.0.4 because newer 8.x images refuse to start on this Docker Desktop kernel. Leave that tag in place unless the kernel is 7.0.14 or newer.

Compose sets `MONGODB_URI`, `REDIS_URL`, and `ELASTICSEARCH_URL` on the API and the worker. Those containers talk to each other by service name (`mongodb`, `redis`, `elasticsearch`), not through a local `.env`. Do not commit credentials.

Elasticsearch in this file has security disabled and a single node. That is for local use only.

To run the processes on the host instead, point the same three variables at local services, then:

```bash
npm run dev
npm run dev:worker
```

## API

Every route except `/health` requires `X-Tenant-ID`.

### Create

`title` and `content` are required. `metadata` is an optional object.

```bash
curl -s -X POST http://localhost:3000/documents \
  -H 'content-type: application/json' \
  -H 'X-Tenant-ID: tenant-001' \
  -d '{"title":"Distributed Systems","content":"Consensus keeps replicas in agreement.","metadata":{"topic":"raft"}}'
```

```json
{
  "id": "674f...",
  "tenantId": "tenant-001",
  "title": "Distributed Systems",
  "content": "Consensus keeps replicas in agreement.",
  "metadata": { "topic": "raft" },
  "createdAt": "2026-09-22T18:00:00.000Z",
  "updatedAt": "2026-09-22T18:00:00.000Z",
  "indexing": "queued"
}
```

`indexing` is `queued` when the worker will pick it up, and `failed` when the queue could not be reached.

### Fetch one document

This reads MongoDB, not Elasticsearch, so it works as soon as create returns.

```bash
curl -s http://localhost:3000/documents/DOCUMENT_ID \
  -H 'X-Tenant-ID: tenant-001'
```

An unknown id for that tenant is `404`. A malformed id is `400`.

### Search

```bash
curl -s 'http://localhost:3000/search?q=consensus' \
  -H 'X-Tenant-ID: tenant-001'
```

```json
{
  "query": "consensus",
  "tenantId": "tenant-001",
  "count": 1,
  "cached": false,
  "results": [
    {
      "id": "674f...",
      "score": 1.4,
      "tenantId": "tenant-001",
      "title": "Distributed Systems",
      "content": "Consensus keeps replicas in agreement.",
      "highlights": { "content": ["<em>Consensus</em> keeps replicas in agreement."] }
    }
  ]
}
```

Missing `q` is `400`. Fuzzy matching means a nearby spelling can still hit.

### Delete

```bash
curl -s -X DELETE http://localhost:3000/documents/DOCUMENT_ID \
  -H 'X-Tenant-ID: tenant-001'
```

```json
{
  "message": "Document deleted successfully",
  "id": "674f...",
  "indexing": "queued"
}
```

The MongoDB row is gone immediately. The Elasticsearch document disappears when the worker finishes.

### Health

```bash
curl -s http://localhost:3000/health
```

```json
{
  "status": "ok",
  "dependencies": {
    "mongodb": "up",
    "redis": "up",
    "elasticsearch": "up"
  }
}
```

`status` is `degraded` and the HTTP status is `503` when any dependency is `down`. This route does not require a tenant header.

### Errors you will see

| Status | When |
| --- | --- |
| 400 | Missing `X-Tenant-ID`, missing `title` or `content`, missing `q`, or a bad document id |
| 404 | Document id is not in that tenant |
| 429 | Tenant exceeded 100 requests in 60 seconds |
| 500 | Unexpected failure while writing, reading, or searching |
| 503 | `/health` only, when a dependency is down |

## Tests and a latency check

```bash
npm test
npm run bench
```

`npm test` checks the tenant search filter, cache key shape, health aggregation, and queue payload validation. It does not need Docker.

`npm run bench` needs the stack on `http://localhost:3000`. It creates one document, waits two seconds for the worker, then runs 50 searches and prints p50 and p95. Override the target with `BENCH_URL` and `BENCH_TENANT`.

## More detail

- `docs/ARCHITECTURE.md` covers data flow, consistency, caching, and tenancy.
- `docs/PRODUCTION.md` covers what this prototype does not do: auth, replication, an outbox, and a 99.95% availability target.

Chatgpt was used to implement the queue, worker, Elasticsearch search, cache invalidation, health checks, tests.
