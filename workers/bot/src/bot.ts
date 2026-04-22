import { Bot } from 'grammy'
import type { Env } from './env'
import { handleStart } from './handlers/start'
import { handleFeedback } from './handlers/feedback'
import { handleWatchCallback, handleUnwatchCallback } from './handlers/postwatch'

export function createBot(env: Env): Bot {
  const bot = new Bot(env.BOT_TOKEN)

  bot.command('start', (ctx) => handleStart(ctx, env))
  bot.command('feedback', (ctx) => handleFeedback(ctx, env))

  bot.callbackQuery(/^watch:/, (ctx) => handleWatchCallback(ctx, env))
  bot.callbackQuery(/^unwatch:/, (ctx) => handleUnwatchCallback(ctx, env))

  bot.catch((err) => {
    console.error('[bot] unhandled error:', err.error, 'ctx:', err.ctx?.update)
  })

  return bot
}
