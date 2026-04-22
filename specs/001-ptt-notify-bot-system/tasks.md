# Tasks: PTT Notify Bot — Current System

**Input**: Design documents from `specs/001-ptt-notify-bot-system/`
**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/ ✅

**Context**: This task list targets the four open issues identified in research.md and
establishes verification checkpoints for all five user stories against the existing
implementation. All foundational components (D1 schema, Workers, crawler, Mini App)
already exist.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US5)

---

## Phase 1: Setup (Baseline Verification)

**Purpose**: Confirm the existing system is healthy before adding improvements.

- [x] T001 Verify local D1 schema applies cleanly: `wrangler d1 execute ptt-notify-bot-db --local --file=workers/bot/src/db/schema.sql`
- [x] T002 [P] Run typecheck for bot worker: `cd workers/bot && npm run typecheck`
- [x] T003 [P] Run typecheck for api worker: `cd workers/api && npm run typecheck`
- [x] T004 [P] Run typecheck for miniapp: `cd miniapp && npm run typecheck`
- [x] T005 [P] Build miniapp static export: `cd miniapp && npm run build`

**Checkpoint**: All type checks pass and miniapp builds without errors.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infrastructure shared across all user stories — already implemented, gaps
to address before improving individual stories.

- [x] T006 Add `DEBUG_MODE` guard to CI: ensure `wrangler.toml` for api worker has `DEBUG_MODE = "false"` and add a `grep` check in `deploy-api.yml` that fails the workflow if `DEBUG_MODE` is `"true"` — `workers/api/wrangler.toml`, `.github/workflows/deploy-api.yml`
- [x] T007 [P] Document all env vars and secrets in `workers/bot/wrangler.toml` and `workers/api/wrangler.toml` with inline comments explaining purpose and where to obtain each value
- [x] T008 [P] Add `INTERNAL_SECRET` length validation to both Workers startup: reject with `500` at first request if `env.INTERNAL_SECRET` is empty or shorter than 32 chars — `workers/bot/src/index.ts`, `workers/api/src/index.ts`

**Checkpoint**: Foundation hardened — ready to work on individual user stories.

---

## Phase 3: User Story 1 — Subscribe to a PTT Board (Priority: P1) 🎯 MVP

**Goal**: A user can subscribe to a board and receive a Telegram notification within
10 minutes of a new article.

**Independent Test**: Subscribe to a low-traffic board, post a test article (or wait for
one), confirm a Telegram notification arrives with correct title, reply count, and URL.

### Implementation for User Story 1

- [x] T009 [US1] Add PTT board validation error handling to `POST /api/subscriptions`: return `404` with message `"Board not found on PTT"` when real-time PTT check fails — `workers/api/src/index.ts`
- [x] T010 [US1] Add retry logic to `crawler.py` for the board snapshot `POST /internal/board-snapshot` call (currently no retry) — `crawler/crawler.py`
- [x] T011 [US1] Add stale-lock recovery to `runCrawlCron`: log a warning to the admin Telegram chat when a board's `dispatched_at` is older than 90s and it is being re-dispatched — `workers/bot/src/cron/crawl.ts`
- [x] T012 [P] [US1] Add `article_replies` display to full notification message in `notify.py`: format as `💬 {n}` and append to the message body — `crawler/notify.py`

**Checkpoint**: US1 end-to-end verified: subscribe → crawl → notification with reply count.

---

## Phase 4: User Story 2 — Filter Notifications by Keywords (Priority: P2)

**Goal**: Only articles whose titles contain at least one keyword (case-insensitive
substring) generate a notification; non-matching articles are silently skipped.

**Independent Test**: Subscribe with keyword "測試", post an article without that word,
confirm no notification; post one with "測試" in the title, confirm notification with
keyword highlighted in bold+underline.

### Implementation for User Story 2

- [x] T013 [US2] Validate `keywords` array in `PUT /api/subscriptions/:board/keywords`: return `400` if any keyword is an empty string or longer than 50 characters — `workers/api/src/index.ts`
- [x] T014 [US2] Validate `keywords` array in `POST /api/subscriptions`: apply same rules as T013 — `workers/api/src/index.ts`
- [x] T015 [P] [US2] Add keyword match logging to `crawler.py`: when an article is filtered OUT by keywords, log `skip: board={board} article_id={id} keywords={keywords}` to stdout for debugging — `crawler/crawler.py`
- [x] T016 [P] [US2] Add edge-case handling in `notify.py` keyword highlighting: if the keyword appears multiple times in the title, highlight all occurrences — `crawler/notify.py`

**Checkpoint**: US2 verified: keyword match → highlighted notification; keyword miss → no notification.

---

## Phase 5: User Story 3 — Manage Multiple Board Subscriptions (Priority: P2)

**Goal**: User can add, edit, and delete any number of subscriptions from the Mini App.

**Independent Test**: Add two boards, edit keywords on one, delete the other; confirm
the Mini App reflects the correct state after each action without a page reload.

### Implementation for User Story 3

- [x] T017 [US3] Add optimistic update rollback in `EditBoardModal`: if the `PUT /keywords` request fails, restore the previous keyword list and show a toast error — `miniapp/components/EditBoardModal.tsx`
- [x] T018 [US3] Add optimistic update rollback in `SubscriptionList` delete flow: if `DELETE /subscriptions/:board` fails, re-insert the subscription card and show a toast error — `miniapp/components/SubscriptionList.tsx`
- [x] T019 [P] [US3] Add loading state to `AddBoardModal` board search: show a spinner while the `GET /api/boards/search` request is in-flight — `miniapp/components/AddBoardModal.tsx`
- [x] T020 [P] [US3] Prevent adding a board that the user already subscribes to in `AddBoardModal`: disable/grey-out boards already in the subscription list — `miniapp/components/AddBoardModal.tsx`

**Checkpoint**: US3 verified: add/edit/delete all reflect correctly in UI with proper error handling.

---

## Phase 6: User Story 4 — Free Tier & Ad-Unlock Notifications (Priority: P3)

**Goal**: When `AD_ENABLED_UNLOCK=true`, subscriptions beyond rank 2 send hidden
(teaser) notifications; ad unlock grants 24 h of full notifications.

**Independent Test**: Set `AD_ENABLED_UNLOCK=true` on a local api worker, add 3
subscriptions, trigger crawl manually, confirm board 3 sends a teaser notification
and boards 1–2 send full notifications.

### Implementation for User Story 4

- [x] T021 [US4] Wire Monetag server-side callback verification to `POST /api/ad/complete`: instead of unconditionally setting `ad_unlocked_at`, verify the Monetag `transaction_id` via Monetag's server API before granting unlock — `workers/api/src/index.ts`
- [x] T022 [P] [US4] Add `UnlockBar` visibility gate in Mini App: only render `UnlockBar` component when `AD_ENABLED_UNLOCK` env-driven flag is propagated through a `GET /api/user` response field — `miniapp/components/UnlockBar.tsx`, `workers/api/src/index.ts`
- [x] T023 [P] [US4] Add `ad_enabled_unlock` boolean to `GET /api/user` response so the Mini App can conditionally show ad-related UI without hardcoding the flag — `workers/api/src/index.ts`
- [x] T024 [US4] Test expiry notice deduplication: add an integration test script in `crawler/test_expiry_notice.py` that inserts a user with `ad_unlocked_at=1` (expired) and `expiry_notified=0`, runs one notify cycle, and asserts `expiry_notified=1` in D1 after the run

**Checkpoint**: US4 verified with `AD_ENABLED_UNLOCK=true`: rank-based gating works,
expiry notice fires exactly once per expiry event.

---

## Phase 7: User Story 5 — Send Feedback (Priority: P3)

**Goal**: User can submit ≤500 character feedback from Mini App; it is delivered to the
admin Telegram account.

**Independent Test**: Submit feedback from the Mini App; verify the admin account receives
the message via Telegram within 30 seconds.

### Implementation for User Story 5

- [x] T025 [US5] Add character counter to `FeedbackScreen`: display `{n}/500` below the textarea and disable the submit button when the limit is exceeded — `miniapp/components/FeedbackScreen.tsx`
- [x] T026 [P] [US5] Trim whitespace from feedback before validation in `POST /api/feedback`: reject if trimmed length is 0 (empty/whitespace-only) — `workers/api/src/index.ts`

**Checkpoint**: US5 verified: feedback arrives in admin Telegram; empty/over-limit submissions rejected.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Address open issues from research.md and improve system-wide reliability.

### Monitoring & Alerting (research.md open issue: no alerting)

- [x] T027 Add admin Telegram alert on crawl job failure: in `crawler.py`, catch top-level exceptions and send a message to `TELEGRAM_ADMIN_ID` via the bot token before exiting — `crawler/crawler.py`
- [x] T028 [P] Add admin Telegram alert on notify job failure: same pattern as T027 — `crawler/notify.py`
- [x] T029 [P] Add GitHub Actions job status badge to `README.md` for `crawl.yml` and `notify.yml` so pipeline health is visible at a glance — `README.md`

### PTT Anti-Scrape Hardening (research.md open issue: no rate limiting)

- [x] T030 Add `Retry-After` header respect to `crawler.py`: if PTT returns HTTP 429, read `Retry-After` header and sleep that many seconds before retrying — `crawler/crawler.py`
- [x] T031 [P] Add random jitter (0–2 s) between board requests in `crawler.py` to reduce request burst patterns — `crawler/crawler.py`

### Test Suite Foundation (research.md open issue: no automated tests)

- [x] T032 [P] Add `pytest` to `crawler/requirements.txt` and create `crawler/tests/test_crawler_parsing.py` with unit tests for PTT HTML parsing (article ID extraction, reply count parsing for "爆", "X5", integers) — `crawler/requirements.txt`, `crawler/tests/test_crawler_parsing.py`
- [x] T033 [P] Add `crawler/tests/test_notify_formatting.py` with unit tests for notification message formatting (keyword highlighting, hidden message format, expiry notice format) — `crawler/tests/test_notify_formatting.py`
- [x] T034 Add dedicated `test.yml` CI workflow triggered on push/PR to `crawler/**`: runs `pytest crawler/tests/` on code changes only, not on every operational crawl/notify run — `.github/workflows/test.yml`

**Checkpoint**: All open issues from research.md addressed. System observable, hardened
against PTT rate-limiting, and has a minimal test safety net.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Baseline)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 completion
- **Phases 3–7 (User Stories)**: All depend on Phase 2; can proceed in any order or in parallel
- **Phase 8 (Polish)**: Can begin after Phase 2; independent of user story phases

### User Story Dependencies

- **US1 (P1)**: No dependency on other stories — start after Phase 2
- **US2 (P2)**: Independent of US1 — can run in parallel
- **US3 (P2)**: Independent of US1/US2 — can run in parallel
- **US4 (P3)**: Depends on US1 being working (needs notification pipeline)
- **US5 (P3)**: Fully independent — can run in parallel with any story

### Parallel Opportunities

```bash
# After Phase 2 completes, all of these can run simultaneously:
Phase 3 (US1) — crawler/notification pipeline
Phase 4 (US2) — keyword validation
Phase 5 (US3) — Mini App UX
Phase 7 (US5) — feedback
Phase 8 (Polish) — monitoring + tests
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 — verify types and build pass
2. Complete Phase 2 — harden foundational security
3. Complete Phase 3 (US1) — crawl + notification pipeline solid
4. **STOP and VALIDATE**: Subscribe to a board, confirm notification arrives with reply count

### Incremental Delivery

1. Phase 1 + 2 → Foundation verified
2. Phase 3 (US1) → Core pipeline hardened (MVP)
3. Phase 4 (US2) → Keyword edge cases fixed
4. Phase 5 (US3) → Mini App UX polished
5. Phase 6 (US4) → Ad unlock wired for production
6. Phase 7 (US5) → Feedback UX improved
7. Phase 8 → System observable and tested

---

## Notes

- All tasks operate on existing code — no new architecture decisions required
- [P] tasks touch different files and can be assigned to different engineers simultaneously
- Each user story phase has a clear checkpoint for independent validation
- Phase 8 tasks are standalone improvements; they do not block any user story delivery
- T021 (Monetag verification) should be coordinated with monetization launch timing
