# Implementation Plan: Post Reply Watch

**Spec**: `specs/002-name-002-post/spec.md`
**Branch**: `002-name-002-post`

---

## Tech Context

| Layer | Tech | Notes |
|-------|------|-------|
| Bot Worker | TypeScript + Cloudflare Workers + grammy | New `CallbackQuery` handlers for watch/unwatch buttons |
| API Worker | TypeScript + Cloudflare Workers | New `/api/post-watches` (Mini App) + `/internal/post-watch-*` (crawler) |
| Database | Cloudflare D1 (SQLite) | New `post_watches` table; reuses `pending_notifications` for dispatch |
| Reply Crawler | Python 3.11 + httpx + BeautifulSoup | New `watch_crawler.py`; same pattern as `crawler.py` |
| Notifier | Python 3.11 + httpx | `notify.py` reused unchanged |
| Scheduler | GitHub Actions `watch.yml` | New workflow triggered by bot cron alongside `crawl.yml` |
| Mini App | Next.js 15 + React 19 + Tailwind | New `PostWatchList.tsx` only — no add-watch UI (done via inline button) |

---

## Constitution Check

| Principle | Assessment |
|-----------|------------|
| **Serverless-First** | ✅ New crawler on GitHub Actions; new routes on Workers |
| **Atomic Crawler Coordination** | ✅ `post_watch_queue` table with lock row, same pattern as `crawl_queue` |
| **Internal API Security** | ✅ All `/internal/post-watch-*` require `X-Internal-Secret` |
| **Feature-Flag–Driven Monetization** | ✅ Watch limit (10) in `shared/config.ts`; can be gated later |
| **Shared Types / No Duplication** | ✅ `PostWatch` type in `workers/shared/types.ts`; crawler imports from `shared.py` |

---

## Data Model

### New table: `post_watches`

```sql
CREATE TABLE post_watches (
  id                INTEGER  PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER  REFERENCES users(telegram_id) ON DELETE CASCADE,
  board             TEXT     NOT NULL,
  article_id        TEXT     NOT NULL,
  article_url       TEXT     NOT NULL,
  article_title     TEXT,
  last_reply_count  INTEGER  DEFAULT 0,
  status            TEXT     DEFAULT 'active',   -- 'active' | 'expired'
  created_at        INTEGER  DEFAULT (unixepoch()),
  last_checked_at   INTEGER  DEFAULT (unixepoch()),
  UNIQUE(user_id, article_id)
);

CREATE INDEX idx_post_watches_user_id ON post_watches(user_id);
CREATE INDEX idx_post_watches_status  ON post_watches(status, last_checked_at);
```

### New table: `post_watch_queue`

```sql
CREATE TABLE post_watch_queue (
  id            INTEGER  PRIMARY KEY AUTOINCREMENT,
  status        TEXT     DEFAULT 'pending',  -- 'pending' | 'in_progress' | 'done'
  dispatched_at INTEGER  DEFAULT (unixepoch())
);

CREATE INDEX idx_post_watch_queue_status ON post_watch_queue(status);
```

Single-row lock pattern: bot cron inserts a `pending` row, crawler flips to `in_progress`, marks `done` on finish.

### Reused: `pending_notifications`

Reply notifications are inserted into `pending_notifications` with `board_rank = null` (always full notification). Existing `notify.py` dispatches them without modification.

---

## Telegram UX Flow

### New-post notification (modified)

```
[Gossiping] 標題文字
Wed Apr 22 12:34:56 2026
https://www.ptt.cc/bbs/Gossiping/M.xxx.html

[ 追蹤留言 ]   ← new inline button
```

Callback data: `watch:<article_id>` (article metadata is looked up server-side from `pending_notifications` or stored in `post_watches` at creation).

### Reply notification (new)

```
[Gossiping] 標題文字 💬 42
https://www.ptt.cc/bbs/Gossiping/M.xxx.html

[ 取消追蹤 ]   ← inline button
```

Callback data: `unwatch:<article_id>`

### Bot callback responses

| Callback | Outcome | Bot reply |
|----------|---------|-----------|
| `watch:<id>` — new | Watch created | "✅ 已追蹤，有新推文時通知你。" |
| `watch:<id>` — duplicate | No-op | "已在追蹤中。" |
| `watch:<id>` — limit reached | No-op | "已達追蹤上限（10 篇），請先從管理介面移除舊的追蹤。" |
| `unwatch:<id>` — exists | Watch deleted | "✅ 已取消追蹤。" |
| `unwatch:<id>` — not found | No-op | "✅ 已取消追蹤。" (idempotent) |

---

## New API Endpoints

### Public (Mini App, `Authorization: tma <initData>`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/post-watches` | List user's active watches |
| `DELETE` | `/api/post-watches/:article_id` | Remove a watch |

### Internal (`X-Internal-Secret`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/internal/active-post-watches` | Fetch all active watches for crawler |
| `POST` | `/internal/post-watch-results` | Batch update reply counts + enqueue notifications |
| `POST` | `/internal/post-watch-queue` | Mark queue job done |

Note: Watch **creation** happens in the bot worker's `CallbackQuery` handler (direct D1 write), not via the API worker.

---

## Project Structure Changes

```
workers/
  shared/
    config.ts           + MAX_POST_WATCHES = 10
    types.ts            + PostWatch type
  bot/
    src/
      cron/
        watch.ts        NEW — runWatchCron(): enqueue + dispatch watch_crawler
      handlers/
        postwatch.ts    NEW — handleWatchCallback, handleUnwatchCallback (CallbackQuery)
      db/
        schema.sql      + post_watches, post_watch_queue tables
        queries.ts      + createPostWatch, deletePostWatch, getPostWatchCount,
                              getPostWatchByArticle
      bot.ts            MODIFIED — register callback_query handlers for watch/unwatch
      index.ts          MODIFIED — runWatchCron wired into scheduled()
  api/
    src/
      index.ts          MODIFIED — GET /api/post-watches, DELETE /api/post-watches/:id,
                                   GET /internal/active-post-watches,
                                   POST /internal/post-watch-results,
                                   POST /internal/post-watch-queue

crawler/
  notify.py             MODIFIED — add "追蹤留言" inline button to send_full_notification
  watch_crawler.py      NEW — fetches articles, diffs reply count, enqueues notifications
  tests/
    test_watch_crawler.py  NEW — unit tests for reply-count parsing

miniapp/
  components/
    PostWatchList.tsx   NEW — list active watches + delete

.github/workflows/
  watch.yml             NEW — triggered by workflow_dispatch; runs watch_crawler.py
```

---

## Reply-Count Parsing

PTT article pages contain push elements:

```html
<div class="push">
  <span class="push-tag">推 </span>
  ...
</div>
```

Total push count = number of `.push` divs (all types: 推/→/噓). This matches the `nrec` shown on board index pages. Same `Cookie: over18=1` header as board crawler.

---

## Dispatcher Flow

```
[Bot Worker Cron */5]
  → enqueuePostWatchJob → D1: post_watch_queue (insert pending row)
  → dispatchWatchCrawler (workflow_dispatch: watch.yml)

[GitHub Actions: watch.yml]
  → GET /internal/active-post-watches   ← fetch all active watches
  → fetch each article URL from PTT
  → compare push count to last_reply_count
  → POST /internal/post-watch-results   ← update counts, enqueue notifications
  → POST /internal/post-watch-queue { done: true }

[existing notify.yml + notify.py picks up pending_notifications rows]
```

---

## Key Decisions

1. **Inline button for subscription** — no URL input in Mini App. Article metadata (board, article_id, article_url, title) is already known at notification time; the callback carries `watch:<article_id>` and the bot looks up metadata from the notification context or stores it directly.

2. **Callback data size** — Telegram limits callback data to 64 bytes. `watch:M.1234567890.A.001` fits comfortably. Full article metadata is stored server-side at watch creation (D1 write in bot worker).

3. **Bot worker creates watches directly** — the `CallbackQuery` handler writes to D1 directly (bot worker has D1 binding) rather than calling the API worker. This avoids an extra hop for a latency-sensitive user interaction.

4. **Reuse `pending_notifications` + `notify.py`** — reply notifications use the same pipeline. `board_rank = null` bypasses rank-based gating (always full notification). The "追蹤留言" button is added to `send_full_notification` in `notify.py`.

5. **Mini App is management-only** — `PostWatchList.tsx` shows active watches and allows deletion. No add-watch flow in Mini App. This keeps the Mini App simple and puts subscription at the natural moment (when you see the article notification).

6. **Idempotent unwatch** — if the watch is already deleted when "取消追蹤" is tapped (e.g., deleted from Mini App first), the bot replies with success anyway to avoid confusing the user.
