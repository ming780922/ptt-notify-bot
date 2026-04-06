import type { Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { upsertUser } from '../db/queries'
import type { Env } from '../env'

export async function handleStart(ctx: Context, env: Env): Promise<void> {
  const user = ctx.from
  if (!user) return

  await upsertUser(env.DB, user.id, user.username ?? null)

  const keyboard = new InlineKeyboard().webApp('📋 管理訂閱', env.MINIAPP_URL)

  await ctx.reply(
    'PTT通知機器人\n' +
    '訂閱看板，有新文章時會主動通知你。\n' +
    '點擊下方按鈕開啟管理介面\n\n' +
    '💬 有任何建議？輸入 /feedback 告訴我們',
    { reply_markup: keyboard }
  )
}
