import type { Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { upsertUser } from '../db/queries'
import type { Env } from '../env'

export async function handleStart(ctx: Context, env: Env): Promise<void> {
  const user = ctx.from
  if (!user) return

  await upsertUser(env.DB, user.id, user.username ?? null)

  const keyboard = new InlineKeyboard().webApp('📋 開啟管理介面', env.MINIAPP_URL)

  await ctx.reply(
    '🐧 PTT 通知 Bot\n' +
    '訂閱看板，有新文章時會主動通知你。\n' +
    '點擊下方按鈕開啟管理介面',
    { reply_markup: keyboard }
  )
}
