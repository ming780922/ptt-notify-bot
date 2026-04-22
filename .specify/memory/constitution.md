<!--
SYNC IMPACT REPORT
Version change: (template) → 1.0.0
Added sections: Core Principles (I–V), Technology Constraints, Development Workflow, Governance
Removed sections: all placeholder tokens replaced
Templates requiring updates:
  ✅ .specify/templates/constitution-template.md (source)
  ✅ .specify/memory/constitution.md (this file)
  ⚠ .specify/templates/plan-template.md (no constitution-specific tokens found, no update needed)
  ⚠ .specify/templates/spec-template.md (no constitution-specific tokens found, no update needed)
  ⚠ .specify/templates/tasks-template.md (no constitution-specific tokens found, no update needed)
Deferred TODOs: none
-->

# PTT Notify Bot Constitution

## Core Principles

### I. Serverless-First (NON-NEGOTIABLE)

All compute MUST run on Cloudflare Workers or GitHub Actions — no persistent servers.
Workers MUST stay within the free-tier CPU/memory limits; any operation that risks exceeding
limits MUST be offloaded to GitHub Actions workflows.
D1 (SQLite) is the sole persistent store; no external databases or caches may be introduced.

### II. Atomic Crawler Coordination

The crawl queue and board lock MUST be managed atomically via D1 to prevent duplicate
notifications. `fetchNextPendingCrawlBoard` MUST use a single SQL statement with a row lock
pattern. Crawler workflows MUST always call `mark_done` even on failure to release locks.

### III. Internal API Security

Every `/internal/*` endpoint MUST require a valid `X-Internal-Secret` header.
Every `/api/*` endpoint (except public board search/list routes) MUST validate Telegram
`initData` via HMAC-SHA256. `DEBUG_MODE = "true"` MUST NEVER be committed or deployed to
production.

### IV. Feature-Flag–Driven Monetization

Ad gates (`AD_ENABLED_ADD_BOARD`, `AD_ENABLED_ADD_KEYWORD`, `AD_ENABLED_UNLOCK`) MUST be
controlled exclusively via Worker env vars — no code changes required to toggle them.
Default values for all flags MUST be `"false"` (fully open access). Free-tier limits
(`FREE_BOARDS_LIMIT`, keyword limits) MUST be defined in `workers/shared/config.ts` as
single-source constants.

### V. Shared Types, No Duplication

TypeScript types shared between workers MUST live in `workers/shared/types.ts`.
Shared constants MUST live in `workers/shared/config.ts`.
`workers/api/src/db/queries.ts` MUST re-export from `workers/bot/src/db/queries.ts` rather
than duplicating query logic. Python crawler scripts MUST not duplicate business logic
already encoded in the Worker SQL queries.

## Technology Constraints

- **Workers runtime**: TypeScript, grammy (bot), Hono or raw `Request`/`Response` (api)
- **Database**: Cloudflare D1 (SQLite) — no ORM, raw SQL only
- **Crawler/Notifier**: Python 3.11+, httpx — no heavy frameworks
- **Mini App**: Next.js 15 static export (`output: 'export'`), React 19, Tailwind CSS —
  deployed to Cloudflare Pages; no SSR
- **Scheduling**: GitHub Actions `workflow_dispatch` triggered by Bot Worker Cron; no
  external schedulers
- **Secrets**: all sensitive values via `wrangler secret put`; MUST NOT appear in
  `wrangler.toml` or committed files

## Development Workflow

1. Schema changes MUST be applied to both local D1 (`--local`) and remote (`--remote`)
   before deploying affected Workers.
2. Typecheck (`npm run typecheck`) MUST pass in both `workers/bot` and `workers/api` before
   any deployment.
3. Mini App MUST be built (`npm run build`) and verified locally before deploying to Pages.
4. New Bot commands MUST be registered in BotFather (`/setcommands`) after deployment.
5. Any change to `INTERNAL_SECRET` MUST be updated in both Worker secrets and GitHub Actions
   secrets simultaneously.

## Governance

This constitution supersedes all other practices documented in this repository. Amendments
require: (1) updating this file with version bump, (2) updating `CLAUDE.md` if operational
guidance changes, (3) ensuring all `.specify/templates/` remain consistent.

Amendment procedure:
- PATCH bump: clarifications, wording — no approval gate required
- MINOR bump: new principle or section — document rationale in commit message
- MAJOR bump: principle removal or governance redefinition — requires explicit discussion

All spec, plan, and task artifacts MUST reference and comply with the version of this
constitution that was active when they were created.

**Version**: 1.0.0 | **Ratified**: 2026-04-22 | **Last Amended**: 2026-04-22
