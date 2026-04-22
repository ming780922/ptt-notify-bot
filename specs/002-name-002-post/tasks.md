# Tasks: Post Reply Watch

**Input**: `specs/002-name-002-post/spec.md` + `specs/002-name-002-post/plan.md`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4

---

## Phase 1: Schema & Shared Foundations

**Purpose**: New D1 tables and shared constants that everything else depends on.

- [ ] T001 Add `post_watches` and `post_watch_queue` tables to `workers/bot/src/db/schema.sql`; apply locally with `wrangler d1 execute ptt-notify-bot-db --local --file=src/db/schema.sql`
- [ ] T002 [P] Add `MAX_POST_WATCHES = 10` to `workers/shared/config.ts`
- [ ] T003 [P] Add `PostWatch` type to `workers/shared/types.ts`: `{ id, user_id, board, article_id, article_url, article_title, last_reply_count, status, created_at, last_checked_at }`

**Checkpoint**: Schema applies cleanly; config and types compile.

---

## Phase 2: Bot Worker — D1 Queries

**Purpose**: Database access layer for post watches in the bot worker.

- [ ] T004 Add `createPostWatch(db, userId, watch)` to `workers/bot/src/db/queries.ts`: INSERT OR IGNORE into `post_watches`, return created row
- [ ] T005 [P] Add `getPostWatchByUserAndArticle(db, userId, articleId)` to `queries.ts`: SELECT single watch
- [ ] T006 [P] Add `getPostWatchCount(db, userId)` to `queries.ts`: COUNT active watches for user
- [ ] T007 [P] Add `deletePostWatch(db, userId, articleId)` to `queries.ts`: DELETE watch
- [ ] T008 [P] Add `enqueuePostWatchJob(db)` to `queries.ts`: INSERT pending row into `post_watch_queue`
- [ ] T009 [P] Re-export new query functions from `workers/api/src/db/queries.ts` (which re-exports from bot queries)

**Checkpoint**: `npm run typecheck` passes in both workers.

---

## Phase 3: Bot Worker — Callback Handlers & Cron

**Purpose**: Telegram inline button handling and cron dispatch for the watch crawler.

- [ ] T010 [US1] Create `workers/bot/src/handlers/postwatch.ts` with `handleWatchCallback(ctx, env)`:
  - Parse `article_id` from callback data (`watch:<article_id>`)
  - Check watch count; if ≥ `MAX_POST_WATCHES`, answer callback "已達追蹤上限（10 篇）"
  - Check for existing watch; if found, answer callback "已在追蹤中"
  - Look up article metadata from `pending_notifications` (or callback context); call `createPostWatch`
  - Answer callback "✅ 已追蹤，有新推文時通知你。"

- [ ] T011 [P] [US2] Add `handleUnwatchCallback(ctx, env)` to `postwatch.ts`:
  - Parse `article_id` from callback data (`unwatch:<article_id>`)
  - Call `deletePostWatch`; answer callback "✅ 已取消追蹤。" (idempotent — success even if not found)

- [ ] T012 [US1] Register callback query handlers in `workers/bot/src/bot.ts`:
  - `bot.callbackQuery(/^watch:/, handleWatchCallback)`
  - `bot.callbackQuery(/^unwatch:/, handleUnwatchCallback)`

- [ ] T013 [US1] Create `workers/bot/src/cron/watch.ts` with `runWatchCron(env)`:
  - Call `enqueuePostWatchJob(env.DB)`
  - Call `dispatchWatchCrawler(env)` (new dispatch helper — see T014)
  - Log count and dispatch result

- [ ] T014 [P] Add `dispatchWatchCrawler(env)` to `workers/bot/src/utils/dispatch.ts`: `workflow_dispatch` to `watch.yml` via GitHub API (same pattern as `dispatchCrawler`)

- [ ] T015 Wire `runWatchCron` into `workers/bot/src/index.ts` `scheduled()` — add new cron identifier `CRON_WATCH = '*/5 * * * *'` (same cadence as crawl) and call `ctx.waitUntil(runWatchCron(env))`

**Checkpoint**: `npm run typecheck` passes; bot handles watch/unwatch callbacks locally.

---

## Phase 4: notify.py — Add Inline Button to New-Post Notifications

**Purpose**: Board article notifications get a "追蹤留言" button so users can subscribe in one tap.

- [ ] T016 [P] [US1] Modify `send_full_notification` in `crawler/notify.py`:
  - Add inline keyboard with one button: `[{"text": "追蹤留言 🔔", "callback_data": f"watch:{n['article_id']}"}]`
  - Pass keyboard to `send_message` instead of `[]`

- [ ] T017 [P] [US2] Modify reply notification format in `crawler/notify.py` — add `send_reply_notification(client, n)` function:
  - Message: `<b>[{board}]</b>\n{title} 💬 {reply_count}\n{url}`
  - Inline keyboard: `[{"text": "取消追蹤 ✕", "callback_data": f"unwatch:{article_id}"}]`
  - (Reply notifications use `notification_type = 'reply'` field to distinguish from board notifications)

**Checkpoint**: Board notifications display "追蹤留言 🔔" button.

---

## Phase 5: API Worker — Internal Endpoints (Crawler ↔ Worker)

**Purpose**: Internal API surface for the watch crawler.

- [ ] T018 Add `GET /internal/active-post-watches` to `workers/api/src/index.ts`:
  - Query all `post_watches` WHERE `status = 'active'`; return array
  - Requires `X-Internal-Secret` header

- [ ] T019 [P] Add `POST /internal/post-watch-results` to `workers/api/src/index.ts`:
  - Body: `{ results: [{ article_id, new_reply_count, status, notifications: [...] }] }`
  - For each result: update `last_reply_count`, `last_checked_at`, `status` in `post_watches`
  - Insert notifications into `pending_notifications` where provided
  - Requires `X-Internal-Secret` header

- [ ] T020 [P] Add `POST /internal/post-watch-queue` to `workers/api/src/index.ts`:
  - Body: `{ done: true }` — mark latest `in_progress` queue row as `done`
  - Requires `X-Internal-Secret` header

---

## Phase 6: API Worker — Public Endpoints (Mini App)

**Purpose**: Mini App can list and delete post watches.

- [ ] T021 [P] [US3] Add `GET /api/post-watches` to `workers/api/src/index.ts`:
  - Return all active `post_watches` for the authenticated user (ordered by `created_at DESC`)
  - Requires `Authorization: tma <initData>`

- [ ] T022 [P] [US3] Add `DELETE /api/post-watches/:article_id` to `workers/api/src/index.ts`:
  - Delete watch for authenticated user + article_id
  - Return `{ ok: true }`; 404 if not found

**Checkpoint**: `npm run typecheck` passes on api worker; all 5 new endpoints respond correctly.

---

## Phase 7: Watch Crawler

**Purpose**: The GitHub Actions job that checks watched articles for new replies.

- [ ] T023 [US1] Create `crawler/watch_crawler.py`:
  - Fetch all active watches from `GET /internal/active-post-watches`
  - For each watch: fetch PTT article URL with `Cookie: over18=1`
  - Parse push count (count of `.push` divs)
  - If count > `last_reply_count`: build notification row; add to results
  - If article returns 404/non-200: set `status = 'expired'`
  - Batch POST results to `POST /internal/post-watch-results`
  - POST done to `POST /internal/post-watch-queue`
  - Import `send_admin_alert` from `shared.py`; wrap in `_run()` crash handler

- [ ] T024 [P] Create `.github/workflows/watch.yml`:
  - Trigger: `workflow_dispatch` (called by bot cron)
  - Same Python 3.11 setup as `crawl.yml`
  - Run `python crawler/watch_crawler.py`
  - Required secrets: `API_WORKER_URL`, `INTERNAL_SECRET`, `TELEGRAM_BOT_TOKEN`, `ADMIN_TELEGRAM_ID`

- [ ] T025 [P] [US4] Add expiry logic to `watch_crawler.py`: if article fetch returns 404 or repeated error, include `status: 'expired'` in the result for that watch

**Checkpoint**: `watch_crawler.py` runs locally against a dev worker; watched articles with new replies produce entries in `pending_notifications`.

---

## Phase 8: Mini App

**Purpose**: `PostWatchList` component for viewing and deleting watches.

- [ ] T026 [P] [US3] Add `PostWatch` type to `miniapp/lib/types.ts`: `{ id, board, article_id, article_url, article_title, last_reply_count, created_at }`

- [ ] T027 [US3] Create `miniapp/components/PostWatchList.tsx`:
  - Fetch `GET /api/post-watches` on mount
  - Render a card per watch: article title, board, link to article
  - Delete button with optimistic removal (snapshot + rollback on failure) and toast error
  - Empty state: "尚無追蹤文章，收到新文章通知時點擊「追蹤留言」即可訂閱"

- [ ] T028 [US3] Wire `PostWatchList` into `miniapp/app/page.tsx`:
  - Add a "追蹤文章" tab or section alongside the subscription list
  - Keep it as a second tab in the existing layout

**Checkpoint**: Mini App shows post watches; delete removes card immediately; empty state is clear.

---

## Phase 9: Tests

- [ ] T029 [P] Add `crawler/tests/test_watch_crawler.py` with unit tests for reply-count parsing:
  - Parse count from valid article HTML
  - Return 0 for article HTML with no pushes
  - Handle 404 (mark expired)
  - Correctly count all push types (推/→/噓)

- [ ] T030 [P] Update `crawler/tests/test_notify_formatting.py`: add test for `send_full_notification` message now including "追蹤留言" inline button

**Checkpoint**: `pytest crawler/tests/ -v` all pass.

---

## Dependencies & Execution Order

```
Phase 1 (Schema + shared)
  → Phase 2 (Bot queries)
    → Phase 3 (Bot handlers + cron)    ← depends on queries
    → Phase 5 (API internal endpoints)  ← depends on schema
    → Phase 6 (API public endpoints)    ← depends on schema
  → Phase 4 (notify.py buttons)        ← depends on schema (article_id in notification)
  → Phase 7 (watch_crawler.py)         ← depends on Phase 5 being deployed
  → Phase 8 (Mini App)                 ← depends on Phase 6
  → Phase 9 (Tests)                    ← depends on Phase 7, 4

Phases 3, 4, 5, 6 can run in parallel after Phase 2.
Phases 7, 8, 9 can run in parallel after their respective dependencies.
```

---

## Implementation Strategy

1. **Phase 1–2**: Schema + queries — foundation for everything
2. **Phase 3 + 4**: Bot callbacks + notify.py button — enables end-to-end test with a fake crawl
3. **Phase 5–6**: API endpoints — unblocks crawler and Mini App
4. **Phase 7**: Watch crawler — first real end-to-end run
5. **Phase 8**: Mini App management view
6. **Phase 9**: Tests + cleanup
7. **STOP AND VALIDATE**: Watch a post via inline button → reply is added on PTT → notification arrives within 10 minutes
