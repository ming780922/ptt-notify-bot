import type { Env } from '../env'
import type { PendingNotification } from '../../../shared/types'
import { updateNotificationStatuses } from '../db/queries'

// ─── GitHub Actions ───────────────────────────────────────────────────────────

async function dispatchGitHubAction(env: Env, eventType: string): Promise<void> {
  const [owner, repo] = env.GH_REPO.split('/')
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/dispatches`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${env.GH_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ptt-notify-bot',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: eventType,
        client_payload: { ref: 'main' },
      }),
    }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`dispatchGitHubAction(${eventType}) failed (${res.status}): ${text}`)
  }
}

export const dispatchCrawler      = (env: Env) => dispatchGitHubAction(env, 'crawl')
export const dispatchNotifier     = (env: Env) => dispatchGitHubAction(env, 'notify')
export const dispatchWatchCrawler = (env: Env) => dispatchGitHubAction(env, 'watch')

export async function getActiveCrawlRunCount(env: Env): Promise<number> {
  const [owner, repo] = env.GH_REPO.split('/')
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/crawl.yml/runs?status=in_progress&per_page=10`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${env.GH_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ptt-notify-bot',
      },
    }
  )
  if (!res.ok) return 0
  const data = await res.json<{ total_count: number }>()
  return data.total_count
}

// ─── Telegram notifications ───────────────────────────────────────────────────

export async function dispatchNotifications(
  db: D1Database,
  notifications: PendingNotification[],
  botToken: string
): Promise<void> {
  const results = await Promise.allSettled(
    notifications.map((n) => sendNotification(n, botToken))
  )

  const updates = results.map((result, i) => ({
    id: notifications[i].id,
    status: (result.status === 'fulfilled' && result.value ? 'sent' : 'failed') as 'sent' | 'failed',
  }))

  await updateNotificationStatuses(db, updates)
}

async function sendNotification(notification: PendingNotification, botToken: string): Promise<boolean> {
  const title = notification.article_title ?? ''
  const url = notification.article_url ?? ''
  const text =
    `📋 *${escapeMarkdown(notification.board)}* 有新文章\n` +
    `*${escapeMarkdown(title)}*\n` +
    `${escapeMarkdown(url)}`

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: notification.user_id,
      text,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: false,
    }),
  })

  if (!res.ok) {
    const errorBody = await res.text()
    console.error(`[dispatch] sendNotification failed for user ${notification.user_id} (${res.status}): ${errorBody}`)
    return false
  }

  return true
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&')
}
