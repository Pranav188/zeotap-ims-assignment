# Prompts and Implementation Plan

## Assignment prompt

Build a resilient Incident Management System for high-volume signals from APIs, MCP hosts, caches, queues, RDBMS and NoSQL stores. Include async ingestion, debouncing by component within 10 seconds, separated raw signal and work item stores, hot-path dashboard cache, lifecycle workflow, mandatory RCA, MTTR, frontend dashboard, rate limiting, health checks, throughput metrics, tests, Docker Compose, and documentation.

## Plan used

1. Implement a dependency-light Node.js backend with an async in-memory queue and token-bucket rate limiter.
2. Separate persistence into raw JSONL signal audit log, structured work item JSON store, dashboard cache JSON, and aggregation JSON.
3. Use Strategy Pattern for component-specific alert severity/channels.
4. Use State Pattern style transition guards for OPEN, INVESTIGATING, RESOLVED, and CLOSED states.
5. Add mandatory RCA validation and MTTR calculation.
6. Serve a responsive HTMX-style dashboard from the backend.
7. Add seed data, unit tests, Docker Compose, README, and submission PDF.
