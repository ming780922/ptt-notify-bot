# Contract: Internal API (`/internal/*`)

**Phase**: 1 | **Date**: 2026-04-22
**Consumers**: `crawler.py`, `notify.py` (GitHub Actions)
**Auth**: `X-Internal-Secret: <INTERNAL_SECRET>` header required on all requests.
Returns `401` if missing or wrong.

---

## GET `/internal/active-boards`

Atomically fetches and locks the next pending board to crawl.

**Request**: No body.

**Response `200`**:
```json
[
  {
    "board": "Gossiping",
    "last_article_id": "M.1700000000.A.001",
    "subscribers": [
      {
        "user_id": 123456789,
        "board_rank": 1,
        "keywords": ["特斯拉", "AI"]
      }
    ]
  }
]
```
Returns a single-element array when a board is available, or `[]` when no pending boards exist.

**Side effect**: Sets `crawl_queue.status = 'running'` and `locked_at = now()` for the
returned board.

---

## POST `/internal/board-snapshot`

Updates the last-crawled article ID for a board and optionally marks the crawl job done.

**Request body**:
```json
{
  "board": "Gossiping",
  "last_article_id": "M.1700001234.A.002",
  "mark_done": true
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `board` | yes | Board name |
| `last_article_id` | yes | Most recent article ID seen in this crawl |
| `mark_done` | no | If `true`, sets `crawl_queue.status = 'done'` |

**Response `200`**:
```json
{ "ok": true }
```

---

## POST `/internal/queue`

Enqueues a batch of notifications for users.

**Request body**:
```json
{
  "notifications": [
    {
      "user_id": 123456789,
      "board": "Gossiping",
      "article_id": "M.1700001234.A.002",
      "article_title": "Re: [新聞] 特斯拉降價",
      "article_url": "https://www.ptt.cc/bbs/Gossiping/M.1700001234.A.002.html",
      "article_replies": 42,
      "board_rank": 1
    }
  ]
}
```

**Response `200`**:
```json
{ "ok": true, "queued": 1 }
```

Duplicate `(user_id, article_id)` pairs are silently ignored (ON CONFLICT DO NOTHING).

---

## GET `/internal/pending-notifications`

Fetches the next batch of pending notifications to send.

**Request**: No body. Batch size fixed at `NOTIFICATION_BATCH_SIZE` (50).

**Response `200`**:
```json
[
  {
    "id": 99,
    "user_id": 123456789,
    "board": "Gossiping",
    "article_id": "M.1700001234.A.002",
    "article_title": "Re: [新聞] 特斯拉降價",
    "article_url": "https://www.ptt.cc/bbs/Gossiping/M.1700001234.A.002.html",
    "article_replies": 42,
    "board_rank": 1,
    "retry_count": 0,
    "ad_unlocked_at": 0
  }
]
```

Returns `[]` when no pending notifications exist.

---

## POST `/internal/notification-status`

Updates the delivery status of a batch of notifications.

**Request body**:
```json
{
  "updates": [
    {
      "id": 99,
      "status": "sent",
      "expiry_notified": 0
    },
    {
      "id": 100,
      "status": "failed",
      "expiry_notified": 0
    }
  ]
}
```

| Field | Values | Description |
|-------|--------|-------------|
| `status` | `"sent"`, `"failed"`, `"pending"` | Terminal or retry state |
| `expiry_notified` | `0`, `1` | Set to `1` after sending an expiry notice |

**Response `200`**:
```json
{ "ok": true }
```
