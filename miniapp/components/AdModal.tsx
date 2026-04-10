'use client'

import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { apiFetch, ApiError } from '@/lib/api'
import type { UserState } from '@/lib/types'

export type AdContext =
  | { type: 'unlock' }
  | { type: 'add-board'; board: string }
  | { type: 'add-keyword' }

export interface AdModalHandle {
  show(ctx: AdContext): Promise<boolean>
}

interface Props {
  userState:   UserState | null
  onComplete(): void
}

const AdModal = forwardRef<AdModalHandle, Props>(function AdModal({ userState, onComplete }, ref) {
  const [ctx, setCtx]         = useState<AdContext | null>(null)
  const [phase, setPhase]     = useState<'confirm' | 'ad'>('confirm')
  const [countdown, setCountdown] = useState(5)
  const [canClose, setCanClose]   = useState(false)
  const resolveRef = useRef<((v: boolean) => void) | null>(null)

  useImperativeHandle(ref, () => ({
    show(context) {
      return new Promise((resolve) => {
        resolveRef.current = resolve
        setCtx(context)
        setPhase('confirm')
        setCanClose(false)
        setCountdown(5)
      })
    },
  }))

  const resolve = (val: boolean) => {
    resolveRef.current?.(val)
    resolveRef.current = null
    setCtx(null)
  }

  const handleConfirmed = () => {
    setPhase('ad')
    // Try real Monetag ad first
    if (typeof window.show_10832818 === 'function') {
      window.show_10832818().then(async () => {
        const needsApi = ctx?.type === 'unlock' || (ctx?.type === 'add-board' && !userState?.is_unlocked)
        if (needsApi) {
          const ok = await callAdComplete()
          if (ok) onComplete()
          resolve(ok)
        } else {
          resolve(true)
        }
      })
      return
    }
    // Fallback: countdown mock
    let n = 5
    setCountdown(n)
    const iv = setInterval(() => {
      n--
      setCountdown(n)
      if (n <= 0) { clearInterval(iv); setCanClose(true) }
    }, 1000)
  }

  const handleMockClose = async () => {
    const needsApi = ctx?.type === 'unlock' || (ctx?.type === 'add-board' && !userState?.is_unlocked)
    if (needsApi) {
      const ok = await callAdComplete()
      if (ok) onComplete()
      resolve(ok)
    } else {
      resolve(true)
    }
  }

  const callAdComplete = async () => {
    try {
      await apiFetch('/api/ad/complete', { method: 'POST' })
      return true
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // silently ok — still resolved as success
        return true
      }
      return false
    }
  }

  if (!ctx) return null

  // ── Confirm phase ──────────────────────────────────────────────────────────
  if (phase === 'confirm') {
    const { icon, title, desc } = confirmContent(ctx)
    return (
      <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-[100] animate-fade-in px-6">
        <div className="w-full max-w-xs bg-tg-bg rounded-2xl overflow-hidden shadow-2xl animate-ad-pop">
          <div className="px-6 pt-7 pb-5 flex flex-col items-center text-center gap-3">
            <div className="text-5xl leading-none">{icon}</div>
            <p className="font-bold text-[17px] text-tg-text">{title}</p>
            <p className="text-tg-hint text-sm leading-relaxed">{desc}</p>
          </div>
          <div className="flex flex-col">
            <button
              onClick={handleConfirmed}
              className="py-4 bg-tg-btn text-tg-btn-text font-bold text-[15px] active:opacity-80 transition-opacity"
            >
              {ctx.type === 'add-board' || ctx.type === 'add-keyword' ? '觀看廣告並新增' : '觀看廣告並解鎖'}
            </button>
            <button
              onClick={() => resolve(false)}
              className="py-3.5 text-tg-hint text-sm active:opacity-60 transition-opacity"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Ad phase ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-[100] animate-fade-in px-6">
      <div className="w-full max-w-xs bg-tg-bg rounded-2xl overflow-hidden shadow-2xl animate-ad-pop">
        <div className="px-4 py-2.5 bg-tg-secondary flex justify-between items-center text-[11px] font-semibold uppercase tracking-wide text-tg-hint">
          <span>贊助商廣告</span>
          {!canClose && (
            <span className="bg-tg-bg text-tg-text px-2 py-0.5 rounded-lg font-mono">{countdown}</span>
          )}
        </div>
        <div className="px-6 py-8 flex flex-col items-center text-center gap-3">
          <div className="text-5xl leading-none">🎁</div>
          <p className="font-bold text-[18px] text-tg-btn">解鎖進階功能</p>
          <p className="text-tg-hint text-sm leading-relaxed">
            {canClose
              ? '① 等倒數結束 → 點擊完成\n② 或點擊廣告 → 立即完成'
              : '觀看廣告，解鎖 24 小時完整通知'}
          </p>
        </div>
        <div className="flex flex-col">
          {canClose && (
            <button
              onClick={handleMockClose}
              className="py-4 bg-tg-btn text-tg-btn-text font-bold text-[15px] active:opacity-80 transition-opacity"
            >
              關閉廣告並完成
            </button>
          )}
          <button
            onClick={() => resolve(false)}
            className="py-3.5 text-tg-hint text-sm active:opacity-60 transition-opacity"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
})

export default AdModal

function confirmContent(ctx: AdContext) {
  if (ctx.type === 'add-board') return {
    icon: '📋',
    title: `新增 ${ctx.board}`,
    desc: '第 3 個以上的看板需觀看廣告才能新增',
  }
  if (ctx.type === 'add-keyword') return {
    icon: '🔑',
    title: '新增關鍵字',
    desc: '每板免費 1 個關鍵字，超出需觀看廣告',
  }
  return {
    icon: '🔔',
    title: '解鎖完整通知',
    desc: '觀看廣告解鎖 24 小時完整通知功能',
  }
}
