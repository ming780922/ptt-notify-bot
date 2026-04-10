export interface AdFlags {
  add_board:   boolean
  add_keyword: boolean
  unlock:      boolean
}

export interface UserState {
  telegram_id:       number
  unlock_expires_at: number
  expiry_notified:   number
  is_unlocked:       boolean
  can_extend:        boolean
  subscription_count: number
  ad_flags:          AdFlags
}

export interface SubscriptionWithRank {
  id:         number
  user_id:    number
  board:      string
  created_at: number
  board_rank: number
}

export interface Board {
  name:         string
  display_name: string
  is_verified:  number
  is_popular:   number
}
