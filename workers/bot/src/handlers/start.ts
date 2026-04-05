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
    'PTT 通知機器人\n' +
    '訂閱看板，即時接收新文章消息。\n' ,
    { reply_markup: keyboard }
  )
}
