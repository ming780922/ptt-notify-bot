# Feature Specification: Post Reply Watch

**Feature Branch**: `002-name-002-post`
**Created**: 2026-04-22
**Status**: Draft

## User Scenarios & Testing

### User Story 1 — Subscribe to a Post from a New-Post Notification (Priority: P1)

When a user receives a new-post notification from a board they follow, the message includes a "追蹤留言" inline button. Tapping it subscribes them to reply updates for that article. When the reply count increases, a follow-up Telegram notification is sent.

**Why this priority**: Core value — zero friction subscription, no URL copy-paste required.

**Independent Test**: Receive a board notification, tap "追蹤留言", wait for a new reply on that article (or manually trigger), confirm a reply notification arrives.

**Acceptance Scenarios**:

1. **Given** a new-post Telegram notification, **When** the user taps "追蹤留言", **Then** the watch is saved and the bot replies with a confirmation message.
2. **Given** the user already watches the same article, **When** they tap "追蹤留言" again, **Then** the bot replies "已在追蹤中" and does not duplicate the watch.
3. **Given** a watched article's reply count increases, **When** the reply crawler runs, **Then** the user receives a Telegram message with article title, board, and updated reply count.
4. **Given** a watched article's reply count is unchanged, **When** the crawler runs, **Then** no notification is sent.

---

### User Story 2 — Remove a Post Watch (Priority: P2)

A user can remove a post watch in two ways: via an inline button on a reply notification, or from the watch list in the Mini App.

**Why this priority**: Without easy removal, unwanted watches accumulate and become noise.

**Independent Test**: Watch a post, receive a reply notification, tap "取消追蹤" — confirm no further reply notifications arrive for that article.

**Acceptance Scenarios**:

1. **Given** a reply notification, **When** the user taps "取消追蹤", **Then** the watch is deleted and the bot confirms removal.
2. **Given** the Mini App watch list, **When** the user deletes a watch, **Then** the card is removed immediately (optimistic update); if deletion fails, the card is re-inserted and a toast error shown.
3. **Given** a watch is deleted, **When** the reply crawler runs, **Then** no notification is sent for that article.

---

### User Story 3 — View Active Post Watches in Mini App (Priority: P2)

A user can open the Mini App and see all their active post watches with article title and board, and delete any of them.

**Why this priority**: Needed for management of watches that have no recent reply notification to tap on.

**Independent Test**: Add two watches via inline buttons, open Mini App, verify both appear, delete one, verify only one remains.

**Acceptance Scenarios**:

1. **Given** a user has active watches, **When** they open the Mini App, **Then** each watch is listed with its article title and board.
2. **Given** a user has no active watches, **When** they open the Mini App, **Then** an empty state is shown.

---

### User Story 4 — Auto-Expire Watches on Archived Posts (Priority: P3)

Post watches automatically stop when the article is no longer accessible (deleted, archived, 404).

**Why this priority**: PTT articles get archived; watches must not accumulate indefinitely.

**Independent Test**: Create a watch for a known-deleted article URL, trigger the crawler, confirm the watch is marked `expired` and no notification is sent.

**Acceptance Scenarios**:

1. **Given** a watched article returns 404 from PTT, **When** the crawler runs, **Then** the watch is marked `expired` and no notification is sent.
2. **Given** an expired watch, **When** the user views the Mini App, **Then** expired watches do not appear in the list.

---

### Edge Cases

- User taps "追蹤留言" on an article they already watch — bot replies "已在追蹤中", no duplicate created.
- User has reached the 10-watch limit and taps "追蹤留言" — bot replies with a limit-reached message.
- Reply count decreases (PTT re-count) — no notification sent.
- Reply count jumps by many between checks — one notification for the batch, not one per reply.
- User deletes watch from Mini App while a reply notification with "取消追蹤" button is still in chat — tapping the stale button should gracefully handle a 404 (watch already removed) and confirm "已取消追蹤".
- Board notification has no matching watch — "追蹤留言" button still appears; watch creation begins fresh.

---

## Requirements

### Functional Requirements

- **FR-001**: New-post Telegram notifications MUST include a "追蹤留言" inline button carrying the article's board, article_id, article_url, and article_title as callback data.
- **FR-002**: Bot MUST handle the "追蹤留言" callback: create a post watch and reply with a confirmation, or reply "已在追蹤中" if already watching.
- **FR-003**: Bot MUST enforce a per-user watch limit of 10; reply with a limit-reached message if exceeded.
- **FR-004**: Reply notifications MUST include a "取消追蹤" inline button carrying the article_id.
- **FR-005**: Bot MUST handle the "取消追蹤" callback: delete the watch and confirm removal (or confirm gracefully if already removed).
- **FR-006**: System MUST store each watch with user_id, board, article_id, article_url, article_title, and last_reply_count (fetched at subscription time).
- **FR-007**: A reply crawler MUST periodically fetch each active watched article, parse the current push count, and compare to stored value.
- **FR-008**: System MUST send a reply notification when reply count increases.
- **FR-009**: System MUST NOT send a notification when reply count is unchanged or decreases.
- **FR-010**: System MUST mark a watch `expired` when the article returns non-200 from PTT.
- **FR-011**: Users MUST be able to list and delete active watches from the Mini App.

### Key Entities

- **PostWatch**: user_id, board, article_id, article_url, article_title, last_reply_count, status (`active` | `expired`), created_at, last_checked_at.

---

## Success Criteria

- **SC-001**: User can subscribe to a post with one tap and receive a reply notification within 10 minutes of a new reply.
- **SC-002**: User can unsubscribe with one tap from a reply notification or from the Mini App.
- **SC-003**: No duplicate notifications for the same reply-count snapshot.
- **SC-004**: Watches for 404/archived articles auto-expire within one crawl cycle.

---

## Assumptions

- PTT article inline button data (board, article_id, article_url, title) is available in the notification callback — the board crawler already stores all of these in `pending_notifications`.
- Telegram callback data has a 64-byte limit; article metadata will be stored server-side (keyed by article_id) rather than embedded entirely in callback data.
- Reply count is parsed from the PTT article page push count (number of `推`/`→`/`噓` elements), same auth as board crawler (`Cookie: over18=1`).
- The existing `pending_notifications` + `notify.py` pipeline is reused for reply notification dispatch.
- Maximum 10 watched posts per user is sufficient for v1.
