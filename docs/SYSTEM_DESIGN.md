# System Design Notes

## Production Mapping

The runnable assignment uses local JSON-backed stores so reviewers can start it quickly. The same boundaries map cleanly to production infrastructure:

- Ingestion queue: Kafka, NATS, or Kinesis.
- Raw signal lake: S3 plus OpenSearch or ClickHouse for query.
- Source of truth: PostgreSQL with transactions for work items and RCA.
- Hot path: Redis sorted sets and hashes for dashboard state.
- Aggregations: Prometheus, ClickHouse, or TimescaleDB.

## Design Patterns

- Alerting uses the Strategy Pattern. Each component type maps to a strategy that decides severity and responder channel.
- Incident lifecycle uses a state-machine style State Pattern. Transition guards live in one module and reject invalid jumps.

## Concurrency

Node's event loop handles concurrent HTTP requests while the ingestion path appends signals to an in-memory queue. A single async drain loop prevents race conditions during debounce and state updates. In production, this would be extended with partitioning by component ID so multiple workers can process safely while preserving order for each component.

## RCA and MTTR

The CLOSED transition requires a complete RCA object. MTTR is calculated from the first signal time to the RCA end time, matching the assignment definition.
