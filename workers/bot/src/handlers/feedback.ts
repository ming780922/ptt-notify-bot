import type { Context } from 'grammy'
import type { Env } from '../env'

export async function handleFeedback(ctx: Context, env: Env): Promise<void> {
  const user = ctx.from
  if (!user) return

  const content = ctx.match?.toString().trim()

  if (!content) {
    await ctx.reply(
      '💬 請直接輸入你的意見或建議，發送給我即可。\n\n' +
      '例如：/feedback 通知有時候會重複推送'
    )
    return
  }

  const username = user.username ? `@${user.username}` : '（無用戶名）'
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'

  const adminMessage =
    `📩 用戶反饋\n\n` +
    `來自：${username}（ID: ${user.id}）\n` +
    `內容：${content}\n` +
    `時間：${timestamp}`

  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.ADMIN_TELEGRAM_ID,
      text: adminMessage,
    }),
  })

  await ctx.reply('✅ 感謝你的回饋！我們會持續改善 @pttbell_bot。')
}
