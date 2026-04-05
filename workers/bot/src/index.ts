import { webhookCallback } from 'grammy'
import type { Env } from './env'
import { createBot } from './bot'
import {
  getActiveBoardsWithSubscribers,
  enqueueCrawlBoards,
  cleanupOldNotifications,
} from './db/queries'
import { dispatchCrawler, dispatchNotifier, getActiveCrawlRunCount } from './utils/dispatch'
import { CONFIG } from '../../shared/config'

// ─── Cron identifiers ─────────────────────────────────────────────────────────
const CRON_CRAWL = '*/5 * * * *'
const CRON_NOTIFY = '2-57/5 * * * *'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/webhook' && request.method === 'POST') {
      const bot = createBot(env)
      return webhookCallback(bot, 'cloudflare-mod')(request)
    }

    return new Response('OK', { status: 200 })
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === CRON_CRAWL) {
      ctx.waitUntil(runCrawlCron(env))
    } else if (event.cron === CRON_NOTIFY) {
      ctx.waitUntil(runNotifyCron(env))
    }
  },
}

// ─── Cron: */5 — enqueue boards & dispatch crawler ───────────────────────────

async function runCrawlCron(env: Env): Promise<void> {
  const activeBoards = await getActiveBoardsWithSubscribers(env.DB)
  console.log(`[cron:crawl] Start: Found ${activeBoards.length} active boards to check`)
  if (activeBoards.length === 0) return

  const boardNames = activeBoards.map((b) => b.board)
  await enqueueCrawlBoards(env.DB, boardNames)
  console.log(`[cron:crawl] Enqueued ${boardNames.length} boards to crawl_queue`)

  // How many crawl.yml runs are currently in_progress?
  const runningCount = await getActiveCrawlRunCount(env)

  if (runningCount < CONFIG.MAX_CRAWL_WORKERS) {
    try {
      await dispatchCrawler(env)
      console.log(`[cron:crawl] Dispatched crawler (GitHub Action) | current in_progress: ${runningCount}`)
    } catch (err) {
      console.error('[cron:crawl] dispatchCrawler failed:', err)
    }
  }

  // Re-dispatch stale pending jobs (dispatched_at older than 90s and still pending)
  await redispatchStalePendingJobs(env)
}

async function redispatchStalePendingJobs(env: Env): Promise<void> {
  const cutoff = Math.floor(Date.now() / 1000) - 90
  const result = await env.DB
    .prepare(
      `SELECT board FROM crawl_queue WHERE status = 'pending' AND dispatched_at < ?`
    )
    .bind(cutoff)
    .all<{ board: string }>()

  if (result.results.length === 0) return

  console.log(`[cron:crawl] Redispatching ${result.results.length} stale pending jobs`)

  const runningCount = await getActiveCrawlRunCount(env)
  if (runningCount >= CONFIG.MAX_CRAWL_WORKERS) return

  try {
    await dispatchCrawler(env)
  } catch (err) {
    console.error('[cron:crawl] redispatch failed:', err)
  }
}

// ─── Cron: 2-57/5 — dispatch notifier & cleanup ──────────────────────────────

async function runNotifyCron(env: Env): Promise<void> {
  console.log('[cron:notify] Start: Dispatching notifier via GitHub Actions')
  try {
    await dispatchNotifier(env)
    console.log('[cron:notify] Dispatched notifier (GitHub Action)')
  } catch (err) {
    console.error('[cron:notify] dispatchNotifier failed:', err)
  }
  await cleanupOldNotifications(env.DB, CONFIG.CLEANUP_DAYS)
}
