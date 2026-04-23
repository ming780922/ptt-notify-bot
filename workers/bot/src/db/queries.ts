import type {
  User,
  Subscription,
  BoardSnapshot,
  Board,
  CrawlJob,
  PendingNotification,
  ActiveBoard,
  PostWatch,
} from '../../../shared/types'
import { CONFIG } from '../../../shared/config'

// ─── users ───────────────────────────────────────────────────────────────────

export async function upsertUser(
  db: D1Database,
  telegramId: number,
  username: string | null
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO users (telegram_id, username)
       VALUES (?, ?)
       ON CONFLICT(telegram_id) DO UPDATE SET username = excluded.username`
    )
    .bind(telegramId, username)
    .run()
}

export async function getUserById(db: D1Database, telegramId: number): Promise<User | null> {
  return db
    .prepare('SELECT * FROM users WHERE telegram_id = ?')
    .bind(telegramId)
    .first<User>()
}

// ─── subscriptions ────────────────────────────────────────────────────────────

export interface SubscriptionWithRank extends Subscription {
  board_rank: number
}

export async function getSubscriptionsByUser(
  db: D1Database,
  userId: number
): Promise<SubscriptionWithRank[]> {
  const result = await db
    .prepare(
      `SELECT
         id, user_id, board, created_at,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) AS board_rank
       FROM subscriptions
       WHERE user_id = ?`
    )
    .bind(userId)
    .all<SubscriptionWithRank>()
  return result.results
}

export async function getActiveBoardsWithSubscribers(db: D1Database): Promise<ActiveBoard[]> {
  const result = await db
    .prepare(
      `SELECT
         s.board,
         bs.last_article_id,
         u.telegram_id AS user_id,
         u.telegram_id AS chat_id,
         ROW_NUMBER() OVER (PARTITION BY s.user_id ORDER BY s.created_at ASC) AS board_rank
       FROM subscriptions s
       JOIN users u ON u.telegram_id = s.user_id
       LEFT JOIN board_snapshots bs ON bs.board = s.board
       ORDER BY s.board, s.created_at ASC`
    )
    .all<{
      board: string
      last_article_id: string | null
      user_id: number
      chat_id: number
      board_rank: number
    }>()

  const map = new Map<string, ActiveBoard>()
  for (const row of result.results) {
    if (!map.has(row.board)) {
      map.set(row.board, {
        board: row.board,
        last_article_id: row.last_article_id ?? null,
        subscribers: [],
      })
    }
    map.get(row.board)!.subscribers.push({
      user_id: row.user_id,
      chat_id: row.chat_id,
      board_rank: row.board_rank,
      keywords: [],
    })
  }
  return Array.from(map.values())
}

export async function createSubscription(
  db: D1Database,
  userId: number,
  board: string
): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO subscriptions (user_id, board) VALUES (?, ?)')
    .bind(userId, board)
    .run()
}

export async function deleteSubscription(
  db: D1Database,
  userId: number,
  board: string
): Promise<void> {
  await db
    .prepare('DELETE FROM subscriptions WHERE user_id = ? AND board = ?')
    .bind(userId, board)
    .run()
}

export async function getSubscriptionCount(db: D1Database, userId: number): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS cnt FROM subscriptions WHERE user_id = ?')
    .bind(userId)
    .first<{ cnt: number }>()
  return row?.cnt ?? 0
}

// ─── board_snapshots ──────────────────────────────────────────────────────────

export async function getBoardSnapshot(
  db: D1Database,
  board: string
): Promise<BoardSnapshot | null> {
  return db
    .prepare('SELECT * FROM board_snapshots WHERE board = ?')
    .bind(board)
    .first<BoardSnapshot>()
}

export async function updateBoardSnapshot(
  db: D1Database,
  board: string,
  lastArticleId: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO board_snapshots (board, last_article_id, last_crawled_at)
       VALUES (?, ?, unixepoch())
       ON CONFLICT(board) DO UPDATE SET
         last_article_id = excluded.last_article_id,
         last_crawled_at = excluded.last_crawled_at`
    )
    .bind(board, lastArticleId)
    .run()
}

// ─── boards ───────────────────────────────────────────────────────────────────

export async function getPopularBoards(db: D1Database): Promise<Board[]> {
  const result = await db
    .prepare('SELECT * FROM boards WHERE is_popular = 1 ORDER BY name ASC')
    .all<Board>()
  return result.results
}

export async function getAllBoards(db: D1Database): Promise<Board[]> {
  const result = await db
    .prepare('SELECT * FROM boards ORDER BY is_popular DESC, name ASC')
    .all<Board>()
  return result.results
}

export async function searchBoards(db: D1Database, query: string): Promise<Board[]> {
  const result = await db
    .prepare(
      `SELECT * FROM boards
       WHERE LOWER(name) LIKE LOWER(?) OR LOWER(display_name) LIKE LOWER(?)
       ORDER BY is_popular DESC, name ASC
       LIMIT 20`
    )
    .bind(`%${query}%`, `%${query}%`)
    .all<Board>()
  return result.results
}

export async function upsertBoard(
  db: D1Database,
  name: string,
  displayName: string,
  isVerified: number
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO boards (name, display_name, is_verified)
       VALUES (?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         display_name = excluded.display_name,
         is_verified  = excluded.is_verified`
    )
    .bind(name, displayName, isVerified)
    .run()
}

// ─── crawl_queue ──────────────────────────────────────────────────────────────

export async function enqueueCrawlBoards(db: D1Database, boards: string[]): Promise<void> {
  if (boards.length === 0) return
  const placeholders = boards.map(() => '(?)').join(', ')
  await db
    .prepare(
      `INSERT INTO crawl_queue (board)
       VALUES ${placeholders}
       ON CONFLICT(board) DO UPDATE SET
         status = 'pending',
         dispatched_at = unixepoch()`
    )
    .bind(...boards)
    .run()
}

/**
 * Atomically fetches the next pending board from crawl_queue and returns it
 * as an ActiveBoard (with subscribers and last_article_id).
 * Returns null when the queue is empty.
 */
export async function fetchNextPendingCrawlBoard(db: D1Database): Promise<ActiveBoard | null> {
  const job = await fetchNextCrawlJob(db)
  if (!job) return null

  const snapshot = await getBoardSnapshot(db, job.board)

  const result = await db
    .prepare(
      `SELECT
         u.telegram_id               AS user_id,
         u.telegram_id               AS chat_id,
         sub_rank.rank               AS board_rank,
         COALESCE(sf.keywords, '[]') AS keywords_json
       FROM subscriptions s
       JOIN users u ON u.telegram_id = s.user_id
       JOIN (
         SELECT id,
                ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) AS rank
         FROM subscriptions
       ) sub_rank ON sub_rank.id = s.id
       LEFT JOIN subscription_filters sf ON sf.subscription_id = s.id
       WHERE s.board = ?`
    )
    .bind(job.board)
    .all<{ user_id: number; chat_id: number; board_rank: number; keywords_json: string }>()

  return {
    board: job.board,
    last_article_id: snapshot?.last_article_id ?? null,
    subscribers: result.results.map((row) => ({
      user_id: row.user_id,
      chat_id: row.chat_id,
      board_rank: row.board_rank,
      keywords: parseKeywords(row.keywords_json),
    })),
  }
}

export async function fetchNextCrawlJob(db: D1Database): Promise<CrawlJob | null> {
  const now = Math.floor(Date.now() / 1000)
  const lockCutoff = now - CONFIG.CRAWL_LOCK_TIMEOUT

  // Atomically pick the next pending job (or a stale locked job) and mark it running
  const job = await db
    .prepare(
      `SELECT board FROM crawl_queue
       WHERE status = 'pending'
          OR (status = 'running' AND locked_at < ?)
       ORDER BY dispatched_at ASC
       LIMIT 1`
    )
    .bind(lockCutoff)
    .first<{ board: string }>()

  if (!job) return null

  await db
    .prepare(
      `UPDATE crawl_queue
       SET status = 'running', locked_at = ?
       WHERE board = ?`
    )
    .bind(now, job.board)
    .run()

  return db
    .prepare('SELECT * FROM crawl_queue WHERE board = ?')
    .bind(job.board)
    .first<CrawlJob>()
}

export async function markCrawlJobDone(db: D1Database, board: string): Promise<void> {
  await db
    .prepare(`UPDATE crawl_queue SET status = 'done', locked_at = NULL WHERE board = ?`)
    .bind(board)
    .run()
}

// ─── pending_notifications ────────────────────────────────────────────────────

export type NotificationInsert = Pick<
  PendingNotification,
  'user_id' | 'board' | 'article_id' | 'article_title' | 'article_url' | 'article_replies' | 'board_rank'
>

export async function enqueuePendingNotifications(
  db: D1Database,
  notifications: NotificationInsert[]
): Promise<void> {
  if (notifications.length === 0) return

  const stmts = notifications.map((n) =>
    db
      .prepare(
        `INSERT INTO pending_notifications
           (user_id, board, article_id, article_title, article_url, article_replies, board_rank)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, article_id) DO NOTHING`
      )
      .bind(n.user_id, n.board, n.article_id, n.article_title, n.article_url, n.article_replies, n.board_rank)
  )

  await db.batch(stmts)
}

// Reply notifications reuse the same article_id as the original board notification which may
// already be in the table (status=sent). DO UPDATE resets it to pending so the notifier fires.
export async function enqueueReplyNotifications(
  db: D1Database,
  notifications: NotificationInsert[]
): Promise<void> {
  if (notifications.length === 0) return

  const stmts = notifications.map((n) =>
    db
      .prepare(
        `INSERT INTO pending_notifications
           (user_id, board, article_id, article_title, article_url, article_replies, board_rank)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, article_id) DO UPDATE SET
           status = 'pending',
           article_replies = excluded.article_replies,
           board_rank = excluded.board_rank,
           created_at = unixepoch(),
           processed_at = NULL,
           retry_count = 0`
      )
      .bind(n.user_id, n.board, n.article_id, n.article_title, n.article_url, n.article_replies, n.board_rank)
  )

  await db.batch(stmts)
}

export async function fetchPendingNotifications(
  db: D1Database,
  limit: number
): Promise<PendingNotification[]> {
  const now = Math.floor(Date.now() / 1000)

  // Select then mark as processing atomically via batch
  const rows = await db
    .prepare(
      `SELECT * FROM pending_notifications
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT ?`
    )
    .bind(limit)
    .all<PendingNotification>()

  if (rows.results.length === 0) return []

  const ids = rows.results.map((r) => r.id)
  const updateStmts = ids.map((id) =>
    db
      .prepare(
        `UPDATE pending_notifications
         SET status = 'processing', processed_at = ?
         WHERE id = ?`
      )
      .bind(now, id)
  )
  await db.batch(updateStmts)

  return rows.results
}

export interface NotificationStatusUpdate {
  id: number
  status: 'sent' | 'failed'
}

export async function updateNotificationStatuses(
  db: D1Database,
  updates: NotificationStatusUpdate[]
): Promise<void> {
  if (updates.length === 0) return

  const now = Math.floor(Date.now() / 1000)
  const stmts = updates.map(({ id, status }) => {
    if (status === 'sent') {
      return db
        .prepare(
          `UPDATE pending_notifications
           SET status = 'sent', processed_at = ?
           WHERE id = ?`
        )
        .bind(now, id)
    }
    // failed: increment retry_count; re-queue if under max, otherwise mark failed
    return db
      .prepare(
        `UPDATE pending_notifications
         SET
           retry_count  = retry_count + 1,
           status       = CASE WHEN retry_count + 1 >= ? THEN 'failed' ELSE 'pending' END,
           processed_at = ?
         WHERE id = ?`
      )
      .bind(CONFIG.NOTIFICATION_RETRY_MAX, now, id)
  })

  await db.batch(stmts)
}

export async function cleanupOldNotifications(db: D1Database, days: number): Promise<void> {
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400
  await db
    .prepare(
      `DELETE FROM pending_notifications
       WHERE status IN ('sent', 'failed') AND created_at < ?`
    )
    .bind(cutoff)
    .run()
}

// ─── users (additional) ───────────────────────────────────────────────────────

export async function updateAdUnlockedAt(db: D1Database, telegramId: number): Promise<number> {
  const now = Math.floor(Date.now() / 1000)
  await db
    .prepare(`UPDATE users SET ad_unlocked_at = ?, expiry_notified = 0 WHERE telegram_id = ?`)
    .bind(now, telegramId)
    .run()
  return now
}

// ─── subscriptions (additional) ──────────────────────────────────────────────

export async function getSubscriptionByUserAndBoard(
  db: D1Database,
  userId: number,
  board: string
): Promise<Subscription | null> {
  return db
    .prepare('SELECT * FROM subscriptions WHERE user_id = ? AND board = ?')
    .bind(userId, board)
    .first<Subscription>()
}

export async function createSubscriptionFilter(db: D1Database, subscriptionId: number): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO subscription_filters (subscription_id) VALUES (?)')
    .bind(subscriptionId)
    .run()
}

export async function getSubscriptionFilter(db: D1Database, subscriptionId: number): Promise<string[]> {
  const row = await db
    .prepare('SELECT keywords FROM subscription_filters WHERE subscription_id = ?')
    .bind(subscriptionId)
    .first<{ keywords: string }>()
  return parseKeywords(row?.keywords ?? '[]')
}

export async function updateSubscriptionFilter(
  db: D1Database,
  subscriptionId: number,
  keywords: string[]
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO subscription_filters (subscription_id, keywords) VALUES (?, ?)
       ON CONFLICT(subscription_id) DO UPDATE SET keywords = excluded.keywords`
    )
    .bind(subscriptionId, JSON.stringify(keywords))
    .run()
}

// ─── post_watches ─────────────────────────────────────────────────────────────

export async function createPostWatch(
  db: D1Database,
  watch: Pick<PostWatch, 'user_id' | 'board' | 'article_id' | 'article_url' | 'article_title' | 'last_reply_count'>
): Promise<PostWatch | null> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO post_watches
         (user_id, board, article_id, article_url, article_title, last_reply_count)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(watch.user_id, watch.board, watch.article_id, watch.article_url, watch.article_title, watch.last_reply_count)
    .run()
  return db
    .prepare('SELECT * FROM post_watches WHERE user_id = ? AND article_id = ?')
    .bind(watch.user_id, watch.article_id)
    .first<PostWatch>()
}

export async function getPostWatchByUserAndArticle(
  db: D1Database,
  userId: number,
  articleId: string
): Promise<PostWatch | null> {
  return db
    .prepare('SELECT * FROM post_watches WHERE user_id = ? AND article_id = ?')
    .bind(userId, articleId)
    .first<PostWatch>()
}

export async function getPostWatchCount(db: D1Database, userId: number): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS cnt FROM post_watches WHERE user_id = ? AND status = 'active'`)
    .bind(userId)
    .first<{ cnt: number }>()
  return row?.cnt ?? 0
}

export async function getPostWatchesByUser(db: D1Database, userId: number): Promise<PostWatch[]> {
  const result = await db
    .prepare(`SELECT * FROM post_watches WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC`)
    .bind(userId)
    .all<PostWatch>()
  return result.results
}

export async function deletePostWatch(
  db: D1Database,
  userId: number,
  articleId: string
): Promise<void> {
  await db
    .prepare('DELETE FROM post_watches WHERE user_id = ? AND article_id = ?')
    .bind(userId, articleId)
    .run()
}

export async function getActivePostWatches(db: D1Database): Promise<PostWatch[]> {
  const result = await db
    .prepare(`SELECT * FROM post_watches WHERE status = 'active' ORDER BY last_checked_at ASC`)
    .all<PostWatch>()
  return result.results
}

export async function updatePostWatchResult(
  db: D1Database,
  userId: number,
  articleId: string,
  newReplyCount: number,
  status: 'active' | 'expired'
): Promise<void> {
  await db
    .prepare(
      `UPDATE post_watches
       SET last_reply_count = ?, last_checked_at = unixepoch(), status = ?
       WHERE user_id = ? AND article_id = ?`
    )
    .bind(newReplyCount, status, userId, articleId)
    .run()
}

export async function enqueuePostWatchJob(db: D1Database): Promise<void> {
  await db
    .prepare(`INSERT INTO post_watch_queue (status) VALUES ('pending')`)
    .run()
}

export async function markPostWatchQueueDone(db: D1Database): Promise<void> {
  await db
    .prepare(
      `UPDATE post_watch_queue SET status = 'done'
       WHERE id = (SELECT id FROM post_watch_queue WHERE status = 'in_progress' ORDER BY id DESC LIMIT 1)`
    )
    .run()
}

export async function claimPostWatchQueueJob(db: D1Database): Promise<boolean> {
  const job = await db
    .prepare(`SELECT id FROM post_watch_queue WHERE status = 'pending' ORDER BY id ASC LIMIT 1`)
    .first<{ id: number }>()
  if (!job) return false
  await db
    .prepare(`UPDATE post_watch_queue SET status = 'in_progress' WHERE id = ?`)
    .bind(job.id)
    .run()
  return true
}

function parseKeywords(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string') : []
  } catch {
    return []
  }
}

// ─── pending_notifications (additional) ──────────────────────────────────────

export interface PendingNotificationWithUser extends PendingNotification {
  ad_unlocked_at: number
  expiry_notified: number
  keywords: string
}

export async function fetchPendingNotificationsWithUser(
  db: D1Database,
  limit: number
): Promise<PendingNotificationWithUser[]> {
  const now = Math.floor(Date.now() / 1000)
  const rows = await db
    .prepare(
      `SELECT pn.*, u.ad_unlocked_at, u.expiry_notified, COALESCE(sf.keywords, '[]') AS keywords
       FROM pending_notifications pn
       JOIN users u ON u.telegram_id = pn.user_id
       LEFT JOIN subscriptions s ON s.user_id = pn.user_id AND LOWER(s.board) = LOWER(pn.board)
       LEFT JOIN subscription_filters sf ON sf.subscription_id = s.id
       WHERE pn.status = 'pending'
       ORDER BY pn.created_at ASC
       LIMIT ?`
    )
    .bind(limit)
    .all<PendingNotificationWithUser>()

  if (rows.results.length === 0) return []

  const updateStmts = rows.results.map((r) =>
    db
      .prepare(`UPDATE pending_notifications SET status = 'processing', processed_at = ? WHERE id = ?`)
      .bind(now, r.id)
  )
  await db.batch(updateStmts)

  return rows.results
}
