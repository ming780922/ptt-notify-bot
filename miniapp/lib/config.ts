// Empty string in local dev → relative URL, proxied by Next.js rewrites to API_PROXY_TARGET.
// In production builds NEXT_PUBLIC_API_BASE is unset, so the hardcoded URL is used as fallback.
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'https://ptt-notify-bot-api.ming780922.workers.dev'

export const MAX_KEYWORDS_PER_BOARD = 5
