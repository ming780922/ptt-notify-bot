# Contract: Public API (`/api/*`)

**Phase**: 1 | **Date**: 2026-04-22
**Consumer**: Telegram Mini App (`miniapp/`)
**Auth**: `Authorization: tma <initData>` header required on all `/api/*` endpoints
except `/api/boards/popular` and `/api/boards/search`.
Returns `401` if initData is missing, expired, or signature invalid.
Returns `200` and upserts the user on first successful authenticated call.

---

## GET `/api/boards/popular`

Returns all boards with `is_popular = 1`. No auth required.

**Response `200`**:
```json
[
  { "name": "Gossiping", "display_name": "八卦", "is_popular": 1, "is_verified": 0 }
]
```

---

## GET `/api/boards/search?q=<query>`

Searches boards by name (case-insensitive). No auth required.

If `q` matches a board already in the database, returns DB records.
If no match found, validates against live PTT.cc and upserts the board on success.

**Response `200`**:
```json
[
  { "name": "Gossiping", "display_name": "八卦", "is_popular": 1, "is_verified": 0 }
]
```

Returns `[]` if the board is not found in DB and PTT validation fails.

---

## GET `/api/user`

Returns the authenticated user's profile.

**Response `200`**:
```json
{
  "telegram_id": 123456789,
  "subscription_count": 3
}
```

---

## GET `/api/subscriptions`

Returns the authenticated user's subscriptions with keywords and rank.

**Response `200`**:
```json
[
  {
    "id": 1,
    "board": "Gossiping",
    "display_name": "八卦",
    "keywords": ["特斯拉"],
    "board_rank": 1,
    "created_at": 1700000000
  }
]
```

Ordered by `created_at` ascending (rank 1 = oldest subscription).

---

## POST `/api/subscriptions`

Adds a new subscription for the authenticated user.

**Request body**:
```json
{
  "board": "Gossiping",
  "keywords": ["特斯拉"]
}
```

| Field | Required | Constraints |
|-------|----------|-------------|
| `board` | yes | Must be a valid PTT board name |
| `keywords` | no | Array of strings, max 5 items |

**Response `200`**:
```json
{
  "id": 1,
  "board": "Gossiping",
  "display_name": "八卦",
  "keywords": ["特斯拉"],
  "board_rank": 1,
  "created_at": 1700000000
}
```

**Response `409`**: Subscription already exists.
**Response `404`**: Board not found / invalid.

---

## GET `/api/subscriptions/:board/keywords`

Returns current keywords for a specific subscription.

**Response `200`**:
```json
{ "keywords": ["特斯拉", "AI"] }
```

**Response `404`**: Subscription not found.

---

## PUT `/api/subscriptions/:board/keywords`

Replaces all keywords for a subscription.

**Request body**:
```json
{ "keywords": ["特斯拉", "AI"] }
```

Max 5 keywords. Returns `400` if limit exceeded.

**Response `200`**:
```json
{ "keywords": ["特斯拉", "AI"] }
```

---

## DELETE `/api/subscriptions/:board`

Removes a subscription and its keywords.

**Response `200`**:
```json
{ "ok": true }
```

**Response `404`**: Subscription not found.

---

## POST `/api/feedback`

Submits user feedback. Delivered to admin Telegram account as a direct message.

**Request body**:
```json
{ "message": "通知速度很快！" }
```

Max 500 characters. Returns `400` if exceeded.

**Response `200`**:
```json
{ "ok": true }
```

---

## Error Format

All error responses use:
```json
{ "error": "Human-readable message" }
```

| Status | Meaning |
|--------|---------|
| `400` | Bad request (validation failure) |
| `401` | Missing or invalid initData |
| `404` | Resource not found |
| `409` | Conflict (duplicate subscription) |
| `500` | Internal server error |
