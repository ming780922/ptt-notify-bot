# Feature Specification: PTT Notify Bot — Current System

**Feature Directory**: `specs/001-ptt-notify-bot-system`
**Created**: 2026-04-22
**Status**: Baseline (documents existing implementation)
**Input**: User description: "spec current implementations"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Subscribe to a PTT Board (Priority: P1)

A Telegram user opens the Mini App via @pttbell_bot, searches for a PTT board they care about,
and subscribes to it. From then on, whenever a new article is posted on that board, the user
receives a Telegram notification with the article title, reply count, and a direct link.

**Why this priority**: This is the core value proposition. Without subscriptions, no other
feature is useful.

**Independent Test**: Can be fully tested by subscribing to one board and verifying a
notification arrives within 10 minutes of a new article being posted.

**Acceptance Scenarios**:

1. **Given** a Telegram user has started @pttbell_bot, **When** they open the Mini App and
   search for "Gossiping", **Then** the board appears in results and can be selected.
2. **Given** a user has selected a board, **When** they confirm the subscription, **Then** it
   appears in their subscription list with rank 1 or 2 (free tier).
3. **Given** a user is subscribed to a board, **When** a new article is posted on PTT,
   **Then** the user receives a Telegram notification within 10 minutes containing the
   article title, reply count, and a link to the article.
4. **Given** a user is already subscribed to a board, **When** they attempt to subscribe
   again, **Then** the system prevents a duplicate subscription.

---

### User Story 2 — Filter Notifications by Keywords (Priority: P2)

A user wants to receive only notifications for articles whose titles contain specific keywords.
They add keywords to a subscription so that irrelevant articles are silently skipped.

**Why this priority**: Reduces notification noise; essential for high-volume boards like
Gossiping.

**Independent Test**: Can be tested by adding a keyword to a subscription and verifying that
only matching articles trigger notifications while non-matching articles do not.

**Acceptance Scenarios**:

1. **Given** a user has an active subscription, **When** they open the Edit modal and add a
   keyword, **Then** the keyword is saved and displayed on the subscription card.
2. **Given** a subscription has keywords, **When** a new article's title matches at least one
   keyword (case-insensitive substring), **Then** the user receives a notification with the
   matching keyword visually highlighted.
3. **Given** a subscription has keywords, **When** a new article's title matches none of the
   keywords, **Then** the user does NOT receive a notification for that article.
4. **Given** a subscription already has 5 keywords, **When** the user tries to add a 6th,
   **Then** the system prevents the addition and shows an appropriate message.

---

### User Story 3 — Manage Multiple Board Subscriptions (Priority: P2)

A user subscribes to multiple boards, edits keywords on some, and deletes boards they no
longer care about — all from the Mini App without leaving Telegram.

**Why this priority**: Most users follow multiple boards; subscription management is a
high-frequency action.

**Independent Test**: Can be tested by subscribing to two boards, editing keywords on one,
deleting the other, and verifying the correct state is reflected in the UI.

**Acceptance Scenarios**:

1. **Given** a user has multiple subscriptions, **When** they open the Mini App, **Then**
   all subscriptions are listed in order of when they were added.
2. **Given** a user taps a subscription card, **When** the Edit modal opens, **Then** they
   can add or remove keywords and save changes, which are reflected immediately.
3. **Given** a user confirms deletion of a subscription, **When** the action completes,
   **Then** the subscription disappears from the list and no further notifications are sent
   for that board.

---

### User Story 4 — Free Tier & Ad-Unlock Notifications (Priority: P3)

Users with more than 2 subscriptions receive full notifications only for their first 2 boards
(by subscription order). Boards beyond the free limit show a teaser notification prompting the
user to watch an ad to unlock full notifications for 24 hours.

**Why this priority**: Monetization feature; currently disabled by default but the system
fully supports it.

**Independent Test**: Can be tested by setting `AD_ENABLED_UNLOCK=true`, adding 3+
subscriptions, and verifying the 3rd board sends a hidden (teaser) notification while boards
1–2 send full notifications.

**Acceptance Scenarios**:

1. **Given** `AD_ENABLED_UNLOCK=false`, **When** a user has any number of subscriptions,
   **Then** all boards deliver full notifications regardless of rank.
2. **Given** `AD_ENABLED_UNLOCK=true` and a user has 3 subscriptions, **When** new articles
   appear on all 3 boards, **Then** boards 1–2 receive full notifications and board 3 receives
   a teaser notification with an unlock CTA.
3. **Given** a user has unlocked ad access, **When** 24 hours have passed, **Then** the next
   notification for an over-limit board is a teaser again, and a single expiry notice is sent.
4. **Given** a user's ad unlock has expired, **When** they receive the first post-expiry
   notification, **Then** they also receive a one-time expiry reminder (not repeated).

---

### User Story 5 — Send Feedback (Priority: P3)

A user can submit feedback directly from the Mini App. The feedback is delivered to the admin
via a Telegram message.

**Why this priority**: Low-friction feedback channel; helps identify issues without requiring
external tools.

**Independent Test**: Can be tested by submitting a message of ≤500 characters and verifying
delivery to the admin Telegram account.

**Acceptance Scenarios**:

1. **Given** a user opens the Feedback screen and types up to 500 characters, **When** they
   submit, **Then** the message is delivered to the admin's Telegram account.
2. **Given** a user tries to submit feedback with more than 500 characters, **Then** the
   system prevents submission and shows a character-limit warning.

---

### Edge Cases

- What happens when PTT is temporarily unreachable during a crawl?
  Crawler retries up to 3 times with exponential backoff (2s, 4s, 6s); if all fail the board
  is skipped and the crawl job is released (mark_done=true) so the next cron cycle can retry.
- What happens if a crawl job is dispatched but the GitHub Action never starts (stale lock)?
  Bot Worker Cron re-dispatches any job with `dispatched_at` older than 90 seconds.
- What happens when a notification fails to send to Telegram?
  `retry_count` is incremented; the notification is retried up to 3 times across cron cycles;
  after 3 failures the status is set to `failed` and the notification is abandoned.
- What happens when a user unsubscribes from a board that has pending notifications?
  Pending notifications are still sent; subsequent crawl cycles produce no new notifications
  for that board for that user.
- What happens to a board search for a board not in the database?
  The API performs a real-time HTTP request to PTT.cc to validate the board exists by parsing
  the board index HTML.
- What happens when a new article ID is lower than the stored `last_article_id`?
  The article is treated as older content and ignored (no notification generated).

## Requirements *(mandatory)*

### Functional Requirements

**Subscription Management**
- **FR-001**: System MUST allow a Telegram user to subscribe to a PTT board via the Mini App.
- **FR-002**: System MUST prevent duplicate subscriptions (same user, same board).
- **FR-003**: System MUST allow a user to delete any of their subscriptions at any time.
- **FR-004**: System MUST expose a ranked list of a user's subscriptions, ordered by
  subscription creation time (oldest first = rank 1).
- **FR-005**: System MUST allow up to 5 keyword filters per subscription.
- **FR-006**: System MUST allow a user to add, remove, and update keywords on any subscription.
- **FR-007**: System MUST allow board discovery via search (local popular boards + real-time
  PTT validation for unknown boards).

**Article Crawling**
- **FR-008**: System MUST crawl all PTT boards that have at least one active subscriber,
  once every 5 minutes.
- **FR-009**: System MUST track the last crawled article per board and only process articles
  newer than that record.
- **FR-010**: System MUST atomically lock a board crawl job so that at most one worker
  processes any given board at a time.
- **FR-011**: System MUST release stale crawl locks within 5 minutes of them becoming stuck.
- **FR-012**: System MUST retry failed PTT HTTP requests up to 3 times before abandoning a
  board crawl.

**Notifications**
- **FR-013**: System MUST send a Telegram notification to a subscriber when a new article
  appears on a subscribed board and (if keywords are set) the title matches at least one
  keyword.
- **FR-014**: System MUST include the article title, reply count, publication time, and
  direct PTT URL in each full notification.
- **FR-015**: System MUST highlight matched keywords in the notification body using bold and
  underline formatting.
- **FR-016**: System MUST retry failed notifications up to 3 times before marking them as
  permanently failed.
- **FR-017**: System MUST clean up notifications older than 7 days with a final status of
  `sent` or `failed`.
- **FR-018**: When `AD_ENABLED_UNLOCK=true`, System MUST send hidden (teaser) notifications
  for subscriptions beyond the free-tier limit unless the user has an active ad unlock.
- **FR-019**: When a user's ad unlock expires, System MUST send exactly one expiry notice
  per expiry event.

**Authentication & Security**
- **FR-020**: All `/api/*` endpoints MUST authenticate requests using the Telegram initData
  HMAC-SHA256 mechanism.
- **FR-021**: All `/internal/*` endpoints MUST authenticate requests using a shared secret
  header (`X-Internal-Secret`).
- **FR-022**: System MUST create or update a user record on the first successful
  authenticated API request.

**Feedback**
- **FR-023**: System MUST allow users to submit text feedback of up to 500 characters via
  the Mini App.
- **FR-024**: System MUST deliver submitted feedback to the configured admin Telegram account.

### Key Entities

- **User**: A Telegram account that has interacted with the bot. Key attributes: `telegram_id`,
  `username`, `ad_unlocked_at` (Unix timestamp), `expiry_notified` (boolean flag).
- **Board**: A PTT board. Key attributes: `name` (board identifier), `display_name`,
  `is_popular` (shown in popular list), `is_verified` (validated against live PTT).
- **Subscription**: A link between a User and a Board. Key attributes: `user_id`, `board`,
  `created_at` (determines rank). Has one associated keyword set.
- **Keyword Filter**: Keywords for a subscription. Stored as a JSON array on the subscription.
  Max 5 per subscription. Matching is case-insensitive substring.
- **Board Snapshot**: The most recently crawled article ID per board. Used to detect new
  articles on the next crawl.
- **Crawl Queue Entry**: A per-board record tracking crawl status (`pending`, `running`,
  `done`) and timestamps for lock detection.
- **Pending Notification**: A queued message to be sent. Key attributes: `user_id`, `board`,
  `article_id`, `article_title`, `article_url`, `article_replies`, `board_rank`, `status`,
  `retry_count`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: New articles on subscribed PTT boards are delivered to subscribers within
  10 minutes of publication, under normal operating conditions.
- **SC-002**: Keyword filtering reduces unwanted notifications to zero for articles whose
  titles do not match any configured keyword.
- **SC-003**: Users can add, edit, or delete a subscription within 3 taps/actions in the
  Mini App.
- **SC-004**: The system supports up to 1 concurrent board-crawl worker without producing
  duplicate notifications.
- **SC-005**: Notifications that fail to deliver are retried automatically; no notification
  is permanently abandoned before 3 delivery attempts.
- **SC-006**: Notifications older than 7 days with a terminal status are purged, keeping
  storage usage bounded.
- **SC-007**: When ad-unlock is disabled (default), 100% of subscriptions receive full
  notifications regardless of subscription count.

## Assumptions

- Telegram users have a stable enough connection to receive Telegram messages; no special
  offline/queueing beyond Telegram's own delivery guarantees is required.
- PTT.cc is accessible from GitHub Actions runner IPs; the crawler does not require VPN or
  special network configuration.
- The free-tier board limit (currently 2) and keyword limit (currently 5) are configured as
  constants and may be adjusted without code changes.
- Ad-gate features (`AD_ENABLED_*` env vars) default to `"false"` — the production system
  runs in fully-open mode until explicitly enabled.
- Board metadata (`boards` table) is seeded/maintained manually or via the PTT validation
  endpoint; there is no automated board discovery beyond what subscribers have searched for.
- The landing page is a separate Next.js project (`landing/`) and is out of scope for this
  specification.
- `DEBUG_MODE=true` is strictly a local development convenience and is never deployed to
  production.
