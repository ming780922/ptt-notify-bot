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
