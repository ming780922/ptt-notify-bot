import type { Context } from 'grammy'
import type { Env } from '../env'
import {
  createPostWatch,
  deletePostWatch,
  getPostWatchByUserAndArticle,
  getPostWatchCount,
} from '../db/queries'
import { CONFIG } from '../../../shared/config'

export async function handleWatchCallback(ctx: Context, env: Env): Promise<void> {
  const callbackData = ctx.callbackQuery?.data ?? ''
  const articleId = callbackData.replace('watch:', '')
  const userId = ctx.from?.id

  if (!userId || !articleId) {
    await ctx.answerCallbackQuery({ text: '無效的請求' })
    return
  }

  const [existing, count] = await Promise.all([
    getPostWatchByUserAndArticle(env.DB, userId, articleId),
    getPostWatchCount(env.DB, userId),
  ])

  if (existing) {
    await ctx.answerCallbackQuery({ text: '已在追蹤中。', show_alert: false })
    return
  }

  if (count >= CONFIG.MAX_POST_WATCHES) {
    await ctx.answerCallbackQuery({
      text: `已達追蹤上限（${CONFIG.MAX_POST_WATCHES} 篇），請先從管理介面移除舊的追蹤。`,
      show_alert: true,
    })
    return
  }

  // Extract article metadata from the message that triggered the callback
  const msg = ctx.callbackQuery?.message
  const text = msg && 'text' in msg ? msg.text ?? '' : ''
  const lines = text.split('\n')
  const articleTitle = lines[1] ?? ''
  const articleUrl = lines.find((l) => l.startsWith('https://www.ptt.cc')) ?? ''
  const boardMatch = lines[0]?.match(/^\[(.+)\]$/)
  const board = boardMatch?.[1] ?? ''

  await createPostWatch(env.DB, {
    user_id: userId,
    board,
    article_id: articleId,
    article_url: articleUrl,
    article_title: articleTitle || null,
    last_reply_count: 0,
  })

  await ctx.answerCallbackQuery({ text: '✅ 已追蹤，有新推文時通知你。', show_alert: false })
}

export async function handleUnwatchCallback(ctx: Context, env: Env): Promise<void> {
  const callbackData = ctx.callbackQuery?.data ?? ''
  const articleId = callbackData.replace('unwatch:', '')
  const userId = ctx.from?.id

  if (!userId || !articleId) {
    await ctx.answerCallbackQuery({ text: '無效的請求' })
    return
  }

  await deletePostWatch(env.DB, userId, articleId)
  await ctx.answerCallbackQuery({ text: '✅ 已取消追蹤。', show_alert: false })
}
