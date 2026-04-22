export interface SubscriptionWithRank {
  id:         number
  user_id:    number
  board:      string
  created_at: number
  board_rank: number
  keywords:   string[]
}

export interface Board {
  name:         string
  display_name: string
  is_verified:  number
  is_popular:   number
}

export interface UserState {
  telegram_id:       number
  subscription_count: number
  ad_enabled_unlock: boolean
}

export interface PostWatch {
  id:               number
  board:            string
  article_id:       string
  article_url:      string
  article_title:    string | null
  last_reply_count: number
  created_at:       number
}
