# Implementation Plan: PTT Notify Bot — Current System

**Branch**: `001-ptt-notify-bot-system` | **Date**: 2026-04-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-ptt-notify-bot-system/spec.md`

## Summary

PTT Notify Bot delivers real-time PTT article notifications to Telegram users via a
serverless pipeline: two Cloudflare Workers (bot + api) coordinate with Python crawlers
running on GitHub Actions, persisting all state in Cloudflare D1. This plan documents
the existing architecture and establishes a baseline for future evolution.

## Technical Context

**Language/Version**: TypeScript (Workers, Mini App), Python 3.11 (crawler/notifier),
Next.js 15 / React 19 (Mini App)
**Primary Dependencies**: grammy (Telegram bot), raw Worker fetch, httpx (Python),
Tailwind CSS, Telegram Mini App SDK
**Storage**: Cloudflare D1 (SQLite) — raw SQL, no ORM
**Testing**: No automated test suite currently exists (manual + integration via staging)
**Target Platform**: Cloudflare Workers (edge), GitHub Actions (Python runners),
Cloudflare Pages (Mini App static export)
**Project Type**: Multi-component serverless system (bot + API worker + static Mini App
+ scheduled Python scripts)
**Performance Goals**: New article notifications delivered within 10 minutes of
publication; Telegram send rate within API limits (~30 msg/s per bot)
**Constraints**: CF Workers CPU budget per request; D1 row limits; GitHub Actions
concurrent job limits; PTT.cc rate sensitivity (no retry storms)
**Scale/Scope**: Small-to-medium user base; 1 concurrent crawler; up to 50
notifications per notifier batch

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|---------|
| I. Serverless-First | ✅ PASS | All compute on CF Workers + GitHub Actions; D1 is sole store |
| II. Atomic Crawler Coordination | ✅ PASS | `fetchNextPendingCrawlBoard` atomically locks board via single UPDATE+SELECT |
| III. Internal API Security | ✅ PASS | `/internal/*` requires `X-Internal-Secret`; `/api/*` requires initData HMAC-SHA256 |
| IV. Feature-Flag–Driven Monetization | ✅ PASS | All ad gates via env vars; all default `"false"`; limits in `shared/config.ts` |
| V. Shared Types, No Duplication | ✅ PASS | `workers/shared/types.ts` + `config.ts`; api re-exports bot's queries |

No violations. No complexity justification required.

## Project Structure

### Documentation (this feature)

```text
specs/001-ptt-notify-bot-system/
├── plan.md              # This file
├── research.md          # Phase 0 — architectural decisions
├── data-model.md        # Phase 1 — D1 schema + entity relationships
├── contracts/
│   ├── internal-api.md  # /internal/* endpoints (crawler ↔ API Worker)
│   └── public-api.md    # /api/* endpoints (Mini App ↔ API Worker)
└── tasks.md             # Phase 2 — /speckit-tasks output
```

### Source Code (repository root)

```text
workers/
├── shared/
│   ├── types.ts           # Shared TypeScript types
│   └── config.ts          # Shared constants (limits, durations)
├── bot/
│   ├── src/
│   │   ├── bot.ts         # grammy bot + command registration
│   │   ├── env.ts         # Worker env bindings interface
│   │   ├── handlers/      # /start, /feedback command handlers
│   │   ├── cron/          # runCrawlCron, runNotifyCron
│   │   └── db/
│   │       ├── schema.sql
│   │       └── queries.ts
│   └── wrangler.toml
└── api/
    ├── src/
    │   ├── index.ts       # Route definitions + auth middleware
    │   ├── env.ts         # Worker env bindings interface
    │   ├── middleware/    # initData validation, internal secret check
    │   └── db/
    │       └── queries.ts # re-exports from workers/bot/src/db/queries.ts
    └── wrangler.toml

crawler/
├── crawler.py             # PTT board scraper
└── notify.py              # Telegram notification dispatcher

miniapp/
├── app/
│   ├── layout.tsx         # SDK init (Telegram, Monetag)
│   ├── page.tsx           # Main dashboard + state
│   └── globals.css
├── components/            # SubscriptionList, AddBoardModal, EditBoardModal, …
└── lib/
    ├── api.ts             # apiFetch wrapper
    ├── config.ts          # API_BASE, free-tier constants
    ├── haptic.ts          # HapticFeedback wrapper
    └── types.ts           # Client-side types

.github/workflows/
├── crawl.yml              # Python crawler job (dispatched by bot cron)
├── notify.yml             # Python notifier job (dispatched by bot cron)
├── deploy-bot.yml
├── deploy-api.yml
└── deploy-miniapp.yml
```

**Structure Decision**: Multi-project monorepo. Each deployable unit has its own
`wrangler.toml`; shared logic lives in `workers/shared/`. Python scripts are
standalone with no build step.

## Complexity Tracking

> No constitution violations — section not required.
