export interface User {
  telegram_id: number
  username: string | null
  ad_unlocked_at: number
  expiry_notified: number
  created_at: number
}

export interface Subscription {
  id: number
  user_id: number
  board: string
  created_at: number
}

export interface BoardSnapshot {
  board: string
  last_article_id: string | null
  last_crawled_at: number
}

export interface Board {
  name: string
  display_name: string | null
  is_popular: number
  is_verified: number
}

export interface CrawlJob {
  board: string
  status: 'pending' | 'running' | 'done' | 'failed'
  locked_at: number | null
  dispatched_at: number | null
}

export interface PendingNotification {
  id: number
  user_id: number
  board: string
  article_id: string
  article_title: string | null
  article_url: string | null
  article_replies: number
  board_rank: number | null
  status: 'pending' | 'processing' | 'sent' | 'failed'
  created_at: number
  processed_at: number | null
  retry_count: number
}

export interface ActiveBoard {
  board: string
  last_article_id: string | null
  subscribers: Array<{
    user_id: number
    chat_id: number
    board_rank: number
  }>
}

export interface Article {
  id: string
  title: string
  url: string
  replies: number
}
