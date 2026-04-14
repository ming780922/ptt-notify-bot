'use client'

import type { SubscriptionWithRank } from '@/lib/types'

interface Props {
  subscriptions: SubscriptionWithRank[]
  onEdit(board: string): void
  onAdd(): void
}

export default function SubscriptionList({ subscriptions, onEdit, onAdd }: Props) {
  if (subscriptions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center pt-16 pb-8 px-6 gap-5">
        {/* Bell icon */}
        <div className="w-16 h-16 rounded-2xl bg-tg-secondary flex items-center justify-center flex-shrink-0">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2481cc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>

        {/* Title + subtitle */}
        <div className="flex flex-col gap-2">
          <p className="font-semibold text-[18px] text-tg-text">開始訂閱 PTT 看板</p>
          <p className="text-tg-hint text-sm max-w-[260px]">
            訂閱後，有新文章時會立即透過 Telegram 通知你
          </p>
        </div>

        {/* Steps */}
        <div className="flex flex-col gap-2.5 text-left w-full max-w-[260px]">
          {[
            '選擇想追蹤的看板',
            '設定關鍵字篩選（選填）',
            '有新文章時立即收到通知',
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-tg-btn/15 text-tg-btn text-xs font-semibold flex items-center justify-center flex-shrink-0">
                {i + 1}
              </span>
              <span className="text-tg-hint text-sm">{step}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={onAdd}
          className="w-full max-w-[260px] mt-2 py-3 bg-tg-btn text-tg-btn-text font-semibold rounded-xl text-[15px] active:opacity-75 transition-opacity"
        >
          新增第一個看板
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5 pt-12">
      {subscriptions.map((s) => (
        <SubscriptionCard key={s.board} sub={s} onClick={() => onEdit(s.board)} />
      ))}
    </div>
  )
}

function SubscriptionCard({ sub, onClick }: { sub: SubscriptionWithRank; onClick(): void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3.5 bg-tg-secondary rounded-2xl active:opacity-60 transition-opacity text-left"
    >
      <div className="min-w-0">
        <p className="font-semibold text-tg-text truncate">{sub.board}</p>
        <div className="flex flex-wrap gap-x-2 mt-1">
          {sub.keywords && sub.keywords.length > 0 ? (
            sub.keywords.map((kw) => (
              <span key={kw} className="text-xs text-tg-hint">#{kw}</span>
            ))
          ) : (
            <span className="text-xs text-tg-hint">「所有文章」</span>
          )}
        </div>
      </div>
      <span className="text-tg-hint text-lg ml-2 flex-shrink-0">›</span>
    </button>
  )
}
