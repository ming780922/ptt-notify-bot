export interface Env {
  DB: D1Database
  BOT_TOKEN: string
  ADMIN_TELEGRAM_ID: string
  INTERNAL_SECRET: string
  AD_ENABLED_ADD_BOARD: string
  AD_ENABLED_ADD_KEYWORD: string
  AD_ENABLED_UNLOCK: string
  /** Set to "true" only in local dev — allows hash=debug_mode bypass in initData verification */
  DEBUG_MODE: string
}
