# Architecture

## System

```text
Client
  |  X-Tenant-ID
  v
API (Express)
  |-- MongoDB          source of truth for documents
  |-- Redis            search cache and rate limits
  |-- BullMQ queue     document-index jobs on Redis
  v
Worker
  |-- reads the document from MongoDB
  |-- upserts or deletes the Elasticsearch document
  |-- deletes that tenant's search cache keys
  v
Elasticsearch         full-text index, filtered by tenantId
```

## Indexing flow

1. `POST /documents` validates the tenant header and writes the document to MongoDB.
2. The API enqueues an `upsert` job and deletes cached searches for that tenant.
3. The API returns `201` with `indexing: "queued"`. The request does not wait for Elasticsearch.
4. The worker loads the document, indexes `tenantId`, `title`, `content`, and `createdAt`, then invalidates the tenant cache again so a search that raced the job cannot stay stale for the full TTL.

`DELETE /documents/:id` deletes the MongoDB row only when `_id` and `tenantId` match, then enqueues a `delete` job. The worker removes that id from Elasticsearch and ignores a missing index document.

Jobs retry 5 times with exponential backoff. A malformed payload is not retried.

## Search flow

1. `GET /search?q=` requires `X-Tenant-ID`.
2. Redis is checked at `search:{tenantId}:{normalized query}` for 60 seconds.
3. On a miss, Elasticsearch runs a `bool` query: a `term` filter on `tenantId` and a fuzzy `multi_match` on `title` (boosted) and `content`.
4. The response includes score and highlights. The uncached body is stored in Redis.

Tenant isolation is a filter, not a separate index. A query cannot omit `tenantId`, and document reads use the same predicate in MongoDB.

## Storage

| Store | Role | Why |
| --- | --- | --- |
| MongoDB | Document record, metadata, timestamps | Durable source of truth and point reads by id |
| Elasticsearch | Full-text search and ranking | Inverted index, fuzzy match, highlighting. The prototype uses one shard and zero replicas |
| Redis | Cache, rate limit counters, BullMQ | Sub-millisecond cache and a queue without another broker |

## API

| Method | Path | Behavior |
| --- | --- | --- |
| `POST` | `/documents` | Create. Body: `title`, `content`, optional `metadata` |
| `GET` | `/documents/:id` | Fetch one document for the tenant |
| `DELETE` | `/documents/:id` | Delete for the tenant and queue index removal |
| `GET` | `/search?q=` | Ranked search for the tenant |
| `GET` | `/health` | `mongodb`, `redis`, `elasticsearch` are `up` or `down` |

## Consistency

MongoDB is authoritative. Search is eventually consistent for the queue delay, typically well under a second locally. Cache invalidation runs when the job is enqueued and again when it completes. A search in that window can still cache the previous Elasticsearch hit; the second invalidation and the 60 second TTL bound that window.

The prototype does not use a transactional outbox. If the process dies after the MongoDB write and before `enqueueIndexJob`, the response is `indexing: "failed"` and the search index can miss that document until the write is repeated.

## Caching

- Search responses, keyed by tenant and normalized query, TTL 60 seconds.
- Invalidation deletes `search:{tenantId}:*` with `SCAN`, not `KEYS`.
- Rate limits use `INCR` and `EXPIRE` per tenant. They fail closed if Redis is down.

## Multi-tenancy

The tenant id is the `X-Tenant-ID` header. It is required on document and search routes and is stored on every document. Elasticsearch filters on the `tenantId` keyword. This is shared-index isolation, which is enough for the prototype and is cheaper to operate than an index per tenant. It is not a security boundary by itself: production needs an authenticated principal that is allowed to act as that tenant.

## Scale sketch

The API and worker are stateless and can run as multiple replicas. Elasticsearch shards split the inverted index. BullMQ consumers scale by running more workers on the same queue. MongoDB and Redis remain the shared coordination points and would move to replica sets and Redis Cluster before the search tier becomes the limit.
