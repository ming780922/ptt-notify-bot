import type { Env } from './env'
import type { TelegramUser } from './utils/auth'
import type { NotificationInsert, PendingNotificationWithUser } from './db/queries'
import { verifyTelegramInitData } from './utils/auth'
import { json, error, preflight } from './utils/cors'
import {
  upsertUser,
  getSubscriptionsByUser,
  getSubscriptionCount,
  createSubscription,
  deleteSubscription,
  getSubscriptionByUserAndBoard,
  createSubscriptionFilter,
  getSubscriptionFilter,
  updateSubscriptionFilter,
  getAllBoards,
  searchBoards,
  upsertBoard,
  updateBoardSnapshot,
  fetchNextPendingCrawlBoard,
  markCrawlJobDone,
  enqueuePendingNotifications,
  fetchPendingNotificationsWithUser,
  updateNotificationStatuses,
} from './db/queries'
import { CONFIG } from '../../shared/config'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return preflight()

    const url = new URL(request.url)
    const { pathname } = url
    const method = request.method

    try {
      // ── Internal routes ──────────────────────────────────────────────────────
      if (pathname.startsWith('/internal/')) {
        const secret = request.headers.get('X-Internal-Secret')
        if (secret !== env.INTERNAL_SECRET) return error('Unauthorized', 401)

        if (pathname === '/internal/active-boards' && method === 'GET') {
          return handleActiveBoards(env)
        }
        if (pathname === '/internal/pending-notifications' && method === 'GET') {
          return handlePendingNotifications(env)
        }
        if (pathname === '/internal/notification-status' && method === 'POST') {
          return handleNotificationStatus(request, env)
        }
        if (pathname === '/internal/board-snapshot' && method === 'POST') {
          return handleBoardSnapshot(request, env)
        }
        if (pathname === '/internal/queue' && method === 'POST') {
          return handleQueue(request, env)
        }
        return error('Not Found', 404)
      }

      // ── Public API routes ──────────────────────────────────────────────────
      if (pathname === '/api/boards/popular' && method === 'GET') {
        return handlePopularBoards(env)
      }
      if (pathname === '/api/boards/search' && method === 'GET') {
        return handleSearchBoards(url, env)
      }

      // ── Protected API routes (require Telegram initData auth) ──────────────
      if (pathname.startsWith('/api/')) {
        const tgUser = await authenticateTelegram(request, env)
        if (tgUser instanceof Response) return tgUser

        if (pathname === '/api/user' && method === 'GET') {
          return handleGetUser(env, tgUser.telegramId)
        }
        if (pathname === '/api/subscriptions' && method === 'GET') {
          return handleGetSubscriptions(env, tgUser.telegramId)
        }
        if (pathname === '/api/subscriptions' && method === 'POST') {
          return handleAddSubscription(request, env, tgUser.telegramId)
        }
        const kwMatch = pathname.match(/^\/api\/subscriptions\/(.+)\/keywords$/)
        if (kwMatch && method === 'GET') {
          return handleGetKeywords(env, tgUser.telegramId, decodeURIComponent(kwMatch[1]))
        }
        if (kwMatch && method === 'PUT') {
          return handlePutKeywords(request, env, tgUser.telegramId, decodeURIComponent(kwMatch[1]))
        }
        const delMatch = pathname.match(/^\/api\/subscriptions\/([^/]+)$/)
        if (delMatch && method === 'DELETE') {
          return handleDeleteSubscription(env, tgUser.telegramId, decodeURIComponent(delMatch[1]))
        }
        if (pathname === '/api/feedback' && method === 'POST') {
          return handleFeedback(request, env, tgUser.telegramId)
        }
        return error('Not Found', 404)
      }

      return error('Not Found', 404)
    } catch (err) {
      console.error('[api] unhandled error:', err)
      return error('Internal Server Error', 500)
    }
  },
}

// ─── Auth helpers ──────────────────────────────────────────────────────────────

async function authenticateTelegram(
  request: Request,
  env: Env
): Promise<TelegramUser | Response> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('tma ')) {
    console.error('[auth] missing/invalid authorization header')
    return error('Unauthorized', 401)
  }

  const initData = authHeader.slice(4)
  const tgUser = await verifyTelegramInitData(initData, env.BOT_TOKEN, env.DEBUG_MODE === 'true')
  if (!tgUser) {
    console.error('[auth] verification failed for initData')
    return error('Unauthorized', 401)
  }

  await upsertUser(env.DB, tgUser.telegramId, tgUser.username)
  return tgUser
}

// ─── API handlers ──────────────────────────────────────────────────────────────

async function handleGetUser(env: Env, telegramId: number): Promise<Response> {
  const subscription_count = await getSubscriptionCount(env.DB, telegramId)
  return json({ telegram_id: telegramId, subscription_count })
}

async function handleGetSubscriptions(env: Env, telegramId: number): Promise<Response> {
  const subs = await getSubscriptionsByUser(env.DB, telegramId)
  const subsWithKeywords = await Promise.all(
    subs.map(async (sub) => {
      const keywords = await getSubscriptionFilter(env.DB, sub.id)
      return { ...sub, keywords }
    })
  )
  return json(subsWithKeywords)
}

async function handleAddSubscription(
  request: Request,
  env: Env,
  telegramId: number
): Promise<Response> {
  const body = await request.json<{ board?: string; keywords?: unknown }>()
  const board = body.board?.trim()
  if (!board) return error('board is required')

  const keywords = Array.isArray(body.keywords)
    ? (body.keywords as unknown[]).map((k) => String(k).trim()).filter((k) => k.length > 0)
    : []
  if (keywords.length > CONFIG.MAX_KEYWORDS_PER_BOARD) return error('Too many keywords', 400)

  // Check if board exists on PTT; returns canonical name (correct casing) or null
  const canonicalBoard = await checkPttBoard(board)
  if (!canonicalBoard) {
    console.warn(`[api] handleAddSubscription: Board not found on PTT: ${board}`)
    return error('Board not found on PTT', 404)
  }

  // upsertBoard with is_verified = 1, using canonical casing from PTT
  await upsertBoard(env.DB, canonicalBoard, canonicalBoard, 1)

  await createSubscription(env.DB, telegramId, canonicalBoard)

  // Ensure subscription_filters row exists; save keywords if provided
  const sub = await getSubscriptionByUserAndBoard(env.DB, telegramId, canonicalBoard)
  if (sub) {
    if (keywords.length > 0) {
      await updateSubscriptionFilter(env.DB, sub.id, keywords)
    } else {
      await createSubscriptionFilter(env.DB, sub.id)
    }
  }

  console.log(`[api] handleAddSubscription: Successfully subscribed to ${canonicalBoard} for ${telegramId}`)

  // Return subscription with board_rank
  const allSubs = await getSubscriptionsByUser(env.DB, telegramId)
  const created = allSubs.find((s) => s.board === canonicalBoard)
  return json(created ?? sub, 201)
}

async function handleDeleteSubscription(
  env: Env,
  telegramId: number,
  board: string
): Promise<Response> {
  await deleteSubscription(env.DB, telegramId, board)
  return json({ ok: true })
}

async function handlePopularBoards(env: Env): Promise<Response> {
  console.log('[api] handlePopularBoards: Fetching all boards from D1...')
  try {
    const boards = await getAllBoards(env.DB)
    console.log(`[api] handlePopularBoards: Found ${boards.length} boards`)
    return json(boards)
  } catch (err) {
    console.error('[api] handlePopularBoards: Error querying D1:', err)
    return error('Database error while fetching boards', 500)
  }
}

async function handleSearchBoards(url: URL, env: Env): Promise<Response> {
  const q = url.searchParams.get('q')?.trim() ?? ''
  if (!q) return json([])

  console.log(`[api] handleSearchBoards: Searching boards with query "${q}"...`)
  try {
    const boards = await searchBoards(env.DB, q)

    const exactCaseIdx = boards.findIndex((b) => b.name === q)
    const caseInsensitiveIdx = boards.findIndex((b) => b.name.toLowerCase() === q.toLowerCase())
    const isValidName = /^[a-zA-Z0-9_-]{3,20}$/.test(q)

    // Call PTT if no exact-case match — catches both missing boards and wrong-cased DB entries
    if (exactCaseIdx === -1 && isValidName) {
      console.log(`[api] handleSearchBoards: Performing real-time PTT check for "${q}"...`)
      const canonicalName = await checkPttBoard(q)
      if (canonicalName) {
        console.log(`[api] handleSearchBoards: Canonical name from PTT: "${canonicalName}"`)
        await upsertBoard(env.DB, canonicalName, canonicalName, 1)
        if (caseInsensitiveIdx >= 0) {
          // Fix wrong-cased entry in result in-place
          boards[caseInsensitiveIdx] = {
            ...boards[caseInsensitiveIdx],
            name: canonicalName,
            display_name: canonicalName,
          }
        } else {
          boards.push({ name: canonicalName, display_name: canonicalName, is_verified: 1, is_popular: 0 })
        }
      }
    }

    console.log(`[api] handleSearchBoards: Found ${boards.length} matching boards`)
    return json(boards)
  } catch (err) {
    console.error(`[api] handleSearchBoards: Error searching boards for "${q}":`, err)
    return error(`Database error while searching for "${q}"`, 500)
  }
}

async function handleGetKeywords(env: Env, telegramId: number, board: string): Promise<Response> {
  const sub = await getSubscriptionByUserAndBoard(env.DB, telegramId, board)
  if (!sub) return error('Subscription not found', 404)
  const keywords = await getSubscriptionFilter(env.DB, sub.id)
  return json({ keywords })
}

async function handlePutKeywords(
  request: Request,
  env: Env,
  telegramId: number,
  board: string
): Promise<Response> {
  const body = await request.json<{ keywords?: unknown }>()
  if (!Array.isArray(body.keywords)) return error('keywords must be an array')

  const keywords = (body.keywords as unknown[])
    .map((k) => String(k).trim())
    .filter((k) => k.length > 0)

  if (keywords.length > CONFIG.MAX_KEYWORDS_PER_BOARD) return error('Too many keywords', 400)

  const sub = await getSubscriptionByUserAndBoard(env.DB, telegramId, board)
  if (!sub) return error('Subscription not found', 404)

  await updateSubscriptionFilter(env.DB, sub.id, keywords)
  return json({ keywords })
}

async function handleFeedback(request: Request, env: Env, telegramId: number): Promise<Response> {
  const body = await request.json<{ message?: string }>()
  const message = body.message?.trim()
  if (!message) return error('message is required', 400)
  if (message.length > 500) return error('message too long', 400)

  const text = `📩 意見回饋\n用戶 ID: ${telegramId}\n\n${message}`
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.ADMIN_TELEGRAM_ID, text }),
  })

  if (!res.ok) {
    console.error('[api] handleFeedback: Telegram sendMessage failed:', await res.text())
    return error('Failed to send feedback', 500)
  }

  return json({ ok: true })
}

// ─── Internal handlers ─────────────────────────────────────────────────────────

/**
 * Returns the next pending board from crawl_queue as a single-element array,
 * or an empty array when the queue is empty.
 * Atomically marks the job as 'running' so concurrent crawlers don't double-pick.
 */
async function handleActiveBoards(env: Env): Promise<Response> {
  const board = await fetchNextPendingCrawlBoard(env.DB)
  return json(board ? [board] : [])
}

async function handlePendingNotifications(env: Env): Promise<Response> {
  const notifications = await fetchPendingNotificationsWithUser(
    env.DB,
    CONFIG.NOTIFICATION_BATCH_SIZE
  )
  // All users receive full notifications (ad unlock feature removed).
  const FAR_FUTURE = 9_999_999_999
  return json(notifications.map((n) => ({ ...n, ad_unlocked_at: FAR_FUTURE })))
}

async function handleNotificationStatus(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{
    updates: Array<{ id: number; status: 'sent' | 'failed'; expiry_notified?: number }>
  }>()

  const statusUpdates = body.updates.map(({ id, status }) => ({ id, status }))
  await updateNotificationStatuses(env.DB, statusUpdates)

  // Batch update users.expiry_notified where provided
  const expiryUpdates = body.updates.filter((u) => u.expiry_notified !== undefined)
  if (expiryUpdates.length > 0) {
    const stmts = expiryUpdates.map((u) =>
      env.DB
        .prepare(
          `UPDATE users SET expiry_notified = ?
           WHERE telegram_id = (SELECT user_id FROM pending_notifications WHERE id = ?)`
        )
        .bind(u.expiry_notified, u.id)
    )
    await env.DB.batch(stmts)
  }

  return json({ ok: true })
}

async function handleBoardSnapshot(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ board: string; last_article_id?: string; mark_done?: boolean }>()
  if (!body.board) return error('board is required')

  if (body.last_article_id) {
    console.log(`[api/internal] handleBoardSnapshot: Updating ${body.board} to last_article_id=${body.last_article_id}`)
    await updateBoardSnapshot(env.DB, body.board, body.last_article_id)
  }
  if (body.mark_done) {
    console.log(`[api/internal] handleBoardSnapshot: Marking ${body.board} as done`)
    await markCrawlJobDone(env.DB, body.board)
  }
  return json({ ok: true })
}

async function handleQueue(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ notifications: PendingNotificationWithUser[] }>()
  if (!Array.isArray(body.notifications)) return error('notifications must be an array')

  const inserts: NotificationInsert[] = body.notifications.map((n) => ({
    user_id: n.user_id,
    board: n.board,
    article_id: n.article_id,
    article_title: n.article_title,
    article_url: n.article_url,
    article_replies: n.article_replies,
    board_rank: n.board_rank ?? 0,
  }))

  await enqueuePendingNotifications(env.DB, inserts)
  console.log(`[api/internal] handleQueue: Enqueued ${inserts.length} notifications`)
  return json({ ok: true, queued: inserts.length })
}

// ─── PTT board validation ──────────────────────────────────────────────────────

/**
 * Verifies a board exists on PTT and returns its canonical name (correct casing).
 * PTT serves the authoritative board name in the page title regardless of URL casing.
 * Returns null if the board doesn't exist or the request fails.
 */
async function checkPttBoard(board: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.ptt.cc/bbs/${encodeURIComponent(board)}/index.html`,
      { headers: { Cookie: 'over18=1' } }
    )
    if (res.status !== 200) return null

    // PTT title format: "看板 BoardName 文章列表 - 批踢踢實業坊"
    const html = await res.text()
    const titleMatch = html.match(/<title>看板\s+(\S+)\s+文章列表/)
    if (titleMatch) return titleMatch[1]

    // Fallback: return user input as-is
    return board
  } catch (err) {
    console.error(`[api] checkPttBoard: Error fetching PTT for board ${board}:`, err)
    return null
  }
}
