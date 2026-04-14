'use client'

import { useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api'

interface Props {
  onClose():          void
  toast(msg: string): void
}

export default function FeedbackScreen({ onClose, toast }: Props) {
  const [text, setText]           = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = useCallback(async () => {
    if (!text.trim() || submitting) return
    setSubmitting(true)
    try {
      await apiFetch('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({ message: text.trim() }),
      })
      toast('感謝你的回饋！')
      setText('')
      onClose()
    } catch {
      toast('送出失敗，請稍後再試')
    } finally {
      setSubmitting(false)
    }
  }, [text, submitting, toast, onClose])

  return (
    <div className="fixed inset-0 bg-tg-bg z-[150] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-tg-hint/15 flex-shrink-0">
        <span className="font-bold text-[17px] text-tg-text">意見回饋</span>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-tg-secondary flex items-center justify-center text-tg-hint text-[13px] active:opacity-60"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-5 flex flex-col gap-4">
        <p className="text-tg-hint text-sm">有什麼想法或問題？歡迎告訴我們。</p>

        <div className="relative flex-1 min-h-0">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 500))}
            placeholder="請輸入你的意見…"
            className="w-full h-[200px] bg-tg-secondary rounded-xl px-4 py-3 text-tg-text placeholder:text-tg-hint text-sm outline-none resize-none"
          />
          <span className="absolute bottom-3 right-3 text-tg-hint text-xs pointer-events-none">
            {text.length}/500
          </span>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!text.trim() || submitting}
          className="w-full py-3.5 bg-tg-btn text-tg-btn-text font-semibold rounded-xl text-[15px] disabled:opacity-40 active:opacity-75 transition-opacity"
        >
          {submitting ? '送出中…' : '送出'}
        </button>
      </div>
    </div>
  )
}
