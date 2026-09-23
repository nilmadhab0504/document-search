# Production readiness

The prototype optimizes for a clear design, not for 10 million documents or 99.95% availability. This is what production would add.

## Scalability

- Shard the Elasticsearch index by a hash of `tenantId` so one large tenant does not pin a single shard. Raise replicas to at least one before serving traffic from more than one zone.
- Keep MongoDB as the source of truth. Shard the `documents` collection on `tenantId` once a single replica set is past comfortable working-set size.
- Run several API replicas behind a load balancer and several BullMQ workers. Indexing throughput scales with workers; search throughput scales with Elasticsearch replicas and request caching.
- At 100x traffic, put a CDN or edge cache only in front of public assets. Search stays at the API because responses are tenant-scoped.
- Replace per-request `refresh: true` with the default refresh interval and accept a slightly longer index lag. Refresh-on-write will not survive bulk indexing.

## Resilience

- Add an outbox collection written in the same MongoDB transaction as the document change, and have the worker mark jobs complete from that outbox. The current enqueue-after-insert path can lose a job.
- Use timeouts and a circuit breaker around Elasticsearch. If the breaker is open, search should fail fast instead of occupying API sockets.
- Retry only idempotent index upserts and deletes. BullMQ already retries with backoff; cap attempts and alert on the failed set.
- MongoDB and Redis need replica sets with automated failover. Elasticsearch needs zone-aware shard allocation.
- Rate limiting should fail open or closed by policy. This prototype fails closed, which protects neighbors and takes search down with Redis.

## Security

- Replace the client-supplied `X-Tenant-ID` header with a tenant claim from a verified token. Authorize every id lookup against that claim, which the prototype already does for the header value.
- Terminate TLS at the load balancer and require TLS between services. Enable Elasticsearch security and MongoDB authentication. Rotate credentials in a secret store. Do not ship them in Compose.
- Encrypt volumes at rest. Restrict the search index and the database to the VPC.
- Validate document size, reject unexpected fields, and cap query length so a tenant cannot submit an expensive fuzzy query.

## Observability

- Structured logs with `tenantId`, document id, and BullMQ job id. Do not log document content.
- Metrics: request latency histogram, search cache hit ratio, queue depth, job failures, Elasticsearch query latency, and dependency health.
- Trace `POST /documents` through the enqueue and the worker span so a slow index is visible as one trace.
- Alert on health `degraded`, queue lag, and error rate. The `/health` endpoint is the liveness and readiness input for the orchestrator.

## Performance

- The tenant filter is a `keyword` so it is not analyzed. Title and content stay `text`.
- Cache the hottest queries per tenant. Invalidate by tenant, which is correct and coarse. A document-level generation counter would shrink invalidation if one tenant's cache is large.
- Paginate with `search_after`, not deep `from` offsets.
- Keep mappings stable. Reindex into a new index and alias-swap instead of mutating the live mapping.

## Operations

- Build immutable images. Run the API and the worker from the same image with different commands, as Compose does.
- Roll the API with a readiness check on `/health`. Drain workers before shutdown; the worker already closes on `SIGTERM`.
- Snapshot MongoDB and Elasticsearch on a schedule and test restores. Redis can be rebuilt from MongoDB by replaying an index-all job, so it is a cache, not a backup.
- Zero-downtime index changes use an alias: write to the new index, backfill, then switch the alias.

## SLA

99.95% allows about 22 minutes of downtime per month. That budget is spent by deploys, failover, and Elasticsearch recovery unless those are automated. Meeting it needs at least two zones, health-based routing, a replica for every shard, and a queue that keeps indexing behind a search outage instead of failing writes. The user-facing promise should separate read availability from index freshness: search can stay up on the last index while workers catch up.

## Cost

- One shared Elasticsearch index is cheaper than an index per tenant until a tenant needs its own shard size or retention.
- Cache hot queries so ranking CPU is not repeated.
- Autoscale workers on queue depth and scale search nodes on query latency, not on document count alone.
- Dev and prod should use smaller warm tiers or a single-node Elasticsearch only outside production. The Compose file is a single node with security disabled and is not a cost model for production.

## Benchmark

`npm run bench` measures one local API process. Treat it as a smoke latency check. A production number needs a fixed dataset, concurrent clients, and a warmed index, then a p95 under 500ms as the assignment target.
