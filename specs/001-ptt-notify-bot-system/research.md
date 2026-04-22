# Research: PTT Notify Bot — Architectural Decisions

**Phase**: 0 | **Date**: 2026-04-22 | **Plan**: [plan.md](./plan.md)

All decisions below are existing, validated choices — not proposals. Rationale is
reconstructed from code evidence and the project constitution.

---

## Decision 1: Cloudflare Workers + D1 as sole runtime

**Decision**: All server-side logic runs on Cloudflare Workers. Cloudflare D1 (SQLite)
is the only persistent store.

**Rationale**: Free-tier eligible, globally distributed, zero cold-start on Worker requests,
no infrastructure to manage. D1 gives transactional SQL without external DB costs.
Aligns with Constitution Principle I (Serverless-First).

**Alternatives considered**:
- Self-hosted VPS: rejected — ops overhead, cost, not serverless
- Supabase/PlanetScale: rejected — external dependency, added latency, cost

---

## Decision 2: GitHub Actions as scheduled compute for crawl + notify

**Decision**: The Python crawler and notifier run as GitHub Actions workflows, dispatched
by the Bot Worker Cron via `workflow_dispatch`.

**Rationale**: CF Workers have a strict CPU time limit (~50ms/request on free plan) that
prevents long-running HTTP loops. GitHub Actions provides up to 6 hours of free runtime
per job, suitable for iterative board crawling. The bot worker acts only as a scheduler.

**Alternatives considered**:
- CF Durable Objects: rejected — complexity, cost, not needed at current scale
- CF Queues: rejected — available but adds moving parts without clear benefit at this scale
- External cron service: rejected — GitHub Actions is already required for the repo

---

## Decision 3: Atomic board lock via D1 single-statement UPDATE

**Decision**: `fetchNextPendingCrawlBoard` uses a single SQL statement to atomically
transition a board from `pending` → `running` and return it, preventing concurrent
processing by multiple crawl workers.

**Rationale**: D1 is SQLite-backed and serializes writes. A single UPDATE+SELECT within
one transaction is sufficient for `MAX_CRAWL_WORKERS=1`. Aligns with Constitution
Principle II.

**Alternatives considered**:
- Application-level locking: rejected — not safe across multiple Worker instances
- Redis/KV optimistic locking: rejected — adds external dependency

---

## Decision 4: Telegram initData HMAC-SHA256 for Mini App auth

**Decision**: Every authenticated API request from the Mini App includes the full Telegram
`initData` string in `Authorization: tma <initData>`. The API Worker verifies the
HMAC-SHA256 signature using the bot token as the key.

**Rationale**: Telegram's official Mini App auth mechanism. No separate auth system needed.
User identity (`telegram_id`) is extracted directly from the verified payload.
Aligns with Constitution Principle III.

**Alternatives considered**:
- JWT sessions: rejected — stateful, requires token storage
- API keys per user: rejected — requires a registration flow outside Telegram

---

## Decision 5: Keyword matching as case-insensitive substring on article title

**Decision**: A notification is sent if any configured keyword appears as a case-insensitive
substring in the article title. Matching is done in Python (`keyword.lower() in title.lower()`).

**Rationale**: Simple, fast, zero dependencies. Covers the most common user intent (e.g.,
"特斯拉" matches "特斯拉 Model 3 開箱"). Regex or full-text search would be overengineered
for the current scale.

**Alternatives considered**:
- Regex patterns: rejected — user-hostile to configure
- Full-text search in D1: rejected — D1 FTS is limited; overkill for title matching

---

## Decision 6: Feature-flag ad gating via Worker env vars

**Decision**: All monetization gates are controlled by env vars (`AD_ENABLED_*`). All
default to `"false"` (fully open). No code changes needed to enable/disable features.

**Rationale**: Allows safe production deployment before monetization is ready. Easy to
A/B test or roll back. Aligns with Constitution Principle IV.

**Alternatives considered**:
- Database-level flags per user: rejected — overkill for a global toggle
- Feature flags service: rejected — external dependency, unnecessary at this scale

---

## Decision 7: Next.js static export for Mini App

**Decision**: The Mini App is a Next.js 15 project with `output: 'export'`, deployed as
a static site to Cloudflare Pages.

**Rationale**: No SSR needed — all data is fetched client-side from the API Worker using
Telegram initData auth. Static hosting on Pages is free and globally cached. Avoids
running a Node.js server.

**Alternatives considered**:
- Next.js with SSR on Pages Functions: rejected — initData is client-side only, SSR adds no value
- Plain HTML/JS: rejected — React ecosystem + Tailwind gives much better DX
- Vite/React SPA: rejected — Next.js file-based routing is adequate and familiar

---

## Open Issues (for future planning)

- **No automated test suite**: Risk of regressions. Mitigation: add integration tests
  against a local D1 instance.
- **PTT anti-scrape**: No rate limiting or IP rotation. Mitigation: keep `MAX_CRAWL_WORKERS=1`
  and monitor for 429/block responses.
- **Ad SDK server-side verification**: `POST /api/ad/complete` currently grants unlock
  without verifying an actual ad view. Mitigation: wire Monetag server callback when
  monetization is enabled.
- **No monitoring/alerting**: Silent failures in crawl/notify jobs are only visible in
  GitHub Actions logs. Mitigation: add admin Telegram alerts for job failures.
