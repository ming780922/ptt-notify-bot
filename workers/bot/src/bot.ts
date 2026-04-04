import { Bot } from 'grammy'
import type { Env } from './env'
import { handleStart } from './handlers/start'

export function createBot(env: Env): Bot {
  const bot = new Bot(env.BOT_TOKEN)

  bot.command('start', (ctx) => handleStart(ctx, env))

  bot.catch((err) => {
    console.error('[bot] unhandled error:', err.error, 'ctx:', err.ctx?.update)
  })

  return bot
}
