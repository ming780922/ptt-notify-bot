# Data Model: PTT Notify Bot

**Phase**: 1 | **Date**: 2026-04-22 | **Plan**: [plan.md](./plan.md)
**Source**: `workers/bot/src/db/schema.sql`

---

## Entity Relationship Overview

```
users ──< subscriptions >── boards
              │
              └── subscription_filters (1:1)

boards ──── board_snapshots (1:1)
boards ──── crawl_queue (1:1)

users ──< pending_notifications
```

---

## Entities

### `users`

Represents a Telegram user who has interacted with the bot.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `telegram_id` | INTEGER | PRIMARY KEY | Telegram user ID (from initData) |
| `username` | TEXT | nullable | Telegram @username |
| `ad_unlocked_at` | INTEGER | DEFAULT 0 | Unix timestamp: ad unlock expiry; 0 = never unlocked |
| `expiry_notified` | INTEGER | DEFAULT 0 | 0/1 flag: has the user received the current expiry notice |
| `created_at` | INTEGER | DEFAULT unixepoch() | First interaction time |

**State transitions for ad unlock**:
- `ad_unlocked_at = 0`: never unlocked (default)
- `ad_unlocked_at > now()`: currently unlocked
- `ad_unlocked_at <= now()` and `expiry_notified = 0`: expired, expiry notice not yet sent
- `ad_unlocked_at <= now()` and `expiry_notified = 1`: expired, expiry notice already sent

---

### `subscriptions`

A user's subscription to a PTT board.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Internal ID |
| `user_id` | INTEGER | FK → users(telegram_id) ON DELETE CASCADE | Owner |
| `board` | TEXT | NOT NULL | PTT board name (e.g. "Gossiping") |
| `created_at` | INTEGER | DEFAULT unixepoch() | Subscription time; determines rank |
| — | — | UNIQUE(user_id, board) | One subscription per user per board |

**Rank**: Derived at query time as `ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC)`.
Rank ≤ `FREE_BOARDS_LIMIT` (2) → free tier; rank > 2 → requires ad unlock when `AD_ENABLED_UNLOCK=true`.

**Indexes**: `idx_subscriptions_user_id`, `idx_subscriptions_board`

---

### `subscription_filters`

Keywords for a subscription. One-to-one with `subscriptions`.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `subscription_id` | INTEGER | PRIMARY KEY, FK → subscriptions(id) ON DELETE CASCADE | |
| `keywords` | TEXT | DEFAULT '[]' | JSON array of keyword strings |

**Validation rules**:
- `keywords` is always a valid JSON array (never null)
- Max 5 elements (`MAX_KEYWORDS_PER_BOARD`)
- Matching: case-insensitive substring of article title
- Empty array `[]` means "notify on all articles"

---

### `boards`

Known PTT boards. Seeded with 18 popular boards at schema init.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `name` | TEXT | PRIMARY KEY | Canonical board identifier (e.g. "Gossiping") |
| `display_name` | TEXT | nullable | Human-readable name (e.g. "八卦") |
| `is_popular` | INTEGER | DEFAULT 0 | 1 = shown in popular board list |
| `is_verified` | INTEGER | DEFAULT 0 | 1 = validated against live PTT |

**Discovery**: Boards not in this table are validated in real-time against PTT.cc by the
API Worker's search endpoint, then upserted with `is_verified=1`.

---

### `board_snapshots`

Tracks the last crawled article per board to detect new content.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `board` | TEXT | PRIMARY KEY | Board name |
| `last_article_id` | TEXT | nullable | Article ID of the most recently seen article |
| `last_crawled_at` | INTEGER | DEFAULT unixepoch() | Timestamp of last successful crawl |

**Article ID format**: `M.{unix_timestamp}.{sender_initial}.{seq}` — lexicographically
comparable; newer articles have higher IDs.

---

### `crawl_queue`

Manages crawl job lifecycle per board.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `board` | TEXT | PRIMARY KEY | Board name |
| `status` | TEXT | DEFAULT 'pending' | `pending` → `running` → `done` |
| `locked_at` | INTEGER | nullable | Unix timestamp when status set to `running` |
| `dispatched_at` | INTEGER | DEFAULT unixepoch() | When Bot Worker last dispatched this board |

**Status lifecycle**:
```
[Bot Cron enqueue] → pending
[fetchNextPendingCrawlBoard] → running (locked_at = now)
[crawler: mark_done=true] → done
[next cron cycle] → pending (re-enqueued for active boards)
```

**Stale lock recovery**: If `locked_at` is older than 300 seconds and status = `running`,
the bot cron re-dispatches and the board is treated as available.

**Index**: `idx_crawl_queue_status`

---

### `pending_notifications`

Queue of Telegram messages to be sent.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `user_id` | INTEGER | FK → users(telegram_id) | Recipient |
| `board` | TEXT | NOT NULL | Source board |
| `article_id` | TEXT | NOT NULL | PTT article ID |
| `article_title` | TEXT | nullable | Article title |
| `article_url` | TEXT | nullable | Full PTT article URL |
| `article_replies` | INTEGER | DEFAULT 0 | Reply count (爆=100, X{n}=-10) |
| `board_rank` | INTEGER | nullable | Subscription rank at enqueue time |
| `status` | TEXT | DEFAULT 'pending' | `pending` → `processing` → `sent` / `failed` |
| `created_at` | INTEGER | DEFAULT unixepoch() | |
| `processed_at` | INTEGER | nullable | When notification was last attempted |
| `retry_count` | INTEGER | DEFAULT 0 | Incremented on each failed send attempt |
| — | — | UNIQUE(user_id, article_id) | No duplicate notifications per user per article |

**Status lifecycle**:
```
[crawler enqueue] → pending
[notifier batch fetch] → processing
[Telegram send OK] → sent
[Telegram send fail, retry_count < 3] → pending (retry_count++)
[Telegram send fail, retry_count >= 3] → failed
```

**Cleanup**: Records with status `sent` or `failed` older than 7 days are deleted by
the notify cron (`CLEANUP_DAYS=7`).

**Indexes**: `idx_pending_notifications_status` (status, created_at)

---

## Derived Views (query-time, not stored)

**Subscription rank**: Computed in `getSubscriptionsWithRank()` using window function:
```sql
ROW_NUMBER() OVER (PARTITION BY s.user_id ORDER BY s.created_at ASC) AS board_rank
```

**Active boards with subscribers**: Joined from `subscriptions` + `subscription_filters` +
`board_snapshots` to produce the `ActiveBoard` type used by the crawler.

**Pending notifications with user unlock status**: Joined from `pending_notifications` +
`users` to include `ad_unlocked_at` for free-tier gating in the notifier.
