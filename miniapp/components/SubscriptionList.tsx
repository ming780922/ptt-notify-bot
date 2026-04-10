'use client'

import type { UserState, SubscriptionWithRank } from '@/lib/types'
import { FREE_BOARDS_LIMIT } from '@/lib/config'

interface Props {
  subscriptions: SubscriptionWithRank[]
  userState: UserState | null
  onEdit(board: string): void
  onAdd(): void
}

export default function SubscriptionList({ subscriptions, userState, onEdit, onAdd }: Props) {
  if (subscriptions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center pt-20 pb-8 px-6 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-tg-secondary flex items-center justify-center text-3xl">
          📋
        </div>
        <div>
          <p className="font-semibold text-lg text-tg-text">開始訂閱 PTT 看板</p>
          <p className="text-tg-hint text-sm mt-1.5 max-w-[240px]">
            訂閱後，有新文章時會立即透過 Telegram 通知你
          </p>
        </div>
        <button
          onClick={onAdd}
          className="mt-2 px-7 py-3 bg-tg-btn text-tg-btn-text font-semibold rounded-xl text-[15px] active:opacity-75 transition-opacity"
        >
          ＋ 新增第一個看板
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      {subscriptions.map((s) => (
        <SubscriptionCard
          key={s.board}
          sub={s}
          userState={userState}
          onClick={() => onEdit(s.board)}
        />
      ))}
    </div>
  )
}

function SubscriptionCard({
  sub,
  userState,
  onClick,
}: {
  sub: SubscriptionWithRank
  userState: UserState | null
  onClick(): void
}) {
  const isFree     = sub.board_rank <= FREE_BOARDS_LIMIT
  const isUnlocked = userState?.is_unlocked ?? false
  const unlockEnabled = userState?.ad_flags?.unlock ?? false

  let badge: { label: string; className: string } | null = null

  if (!isFree && unlockEnabled) {
    if (isUnlocked) {
      badge = { label: '🔓 已解鎖', className: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' }
    } else {
      badge = { label: '🔒 需解鎖', className: 'text-tg-hint bg-tg-secondary' }
    }
  }

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3.5 bg-tg-secondary rounded-2xl active:opacity-60 transition-opacity text-left"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-tg-btn/10 flex items-center justify-center flex-shrink-0">
          <span className="text-tg-btn font-bold text-sm">{sub.board.slice(0, 2).toUpperCase()}</span>
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-tg-text truncate">{sub.board}</p>
          {badge && (
            <span className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded-md mt-0.5 ${badge.className}`}>
              {badge.label}
            </span>
          )}
        </div>
      </div>
      <span className="text-tg-hint text-lg ml-2 flex-shrink-0">›</span>
    </button>
  )
}
