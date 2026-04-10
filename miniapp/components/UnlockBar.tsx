'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import type { UserState, AdFlags } from '@/lib/types'
import type { AdModalHandle } from './AdModal'

interface Props {
  userState:    UserState | null
  isAdEnabled:  (f: keyof AdFlags) => boolean
  adRef:        RefObject<AdModalHandle | null>
  onUnlockComplete(): void
}

export default function UnlockBar({ userState, isAdEnabled, adRef, onUnlockComplete }: Props) {
  const [tooltipOpen, setTooltipOpen] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const needsUnlock = userState && userState.subscription_count > 2
  const unlockEnabled = isAdEnabled('unlock')

  // Update CSS var for bottom bar offset
  useEffect(() => {
    const h = needsUnlock && unlockEnabled ? '38px' : '0px'
    document.documentElement.style.setProperty('--unlock-bar-height', h)
  }, [needsUnlock, unlockEnabled])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setTooltipOpen(false)
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  if (!needsUnlock || !unlockEnabled) return null

  const { is_unlocked, can_extend, unlock_expires_at } = userState
  const remaining = unlock_expires_at - Math.floor(Date.now() / 1000)
  const hours     = Math.max(1, Math.ceil(remaining / 3600))

  const handleUnlock = async () => {
    const ok = await adRef.current?.show({ type: 'unlock' })
    if (ok) onUnlockComplete()
  }

  return (
    <div className="flex items-center justify-between w-full py-0.5">
      {/* Label + tooltip */}
      <div className="relative flex items-center gap-1.5" ref={tooltipRef}>
        <span className="text-[13px] text-tg-text">
          {is_unlocked ? `🔓 完整通知剩 ${hours}h` : '🔒 完整通知已暫停'}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); setTooltipOpen((v) => !v) }}
          className="w-4 h-4 rounded-full border border-tg-hint/50 text-tg-hint text-[10px] flex items-center justify-center flex-shrink-0"
        >
          ？
        </button>
        {tooltipOpen && (
          <div className="absolute bottom-[calc(100%+8px)] left-0 bg-tg-secondary text-tg-text text-xs leading-relaxed px-3 py-2 rounded-xl shadow-lg z-50 max-w-[240px] w-max">
            前 2 個看板免費完整通知，其他看板需解鎖才能收到完整通知
          </div>
        )}
      </div>

      {/* Action button */}
      {(!is_unlocked || can_extend) && (
        <button
          onClick={handleUnlock}
          className="px-3.5 py-1 bg-tg-btn text-tg-btn-text text-[13px] font-semibold rounded-full active:opacity-75 transition-opacity"
        >
          {is_unlocked ? '延長 24h' : '解鎖'}
        </button>
      )}
    </div>
  )
}
