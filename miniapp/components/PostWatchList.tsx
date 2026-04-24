'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api'
import { haptic } from '@/lib/haptic'
import type { PostWatch } from '@/lib/types'

interface Props {
  toast(msg: string, type?: 'success' | 'error'): void
  onCountChange?(n: number): void
}

export default function PostWatchList({ toast, onCountChange }: Props) {
  const [watches, setWatches] = useState<PostWatch[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<PostWatch[]>('/api/post-watches')
      .then((data) => { setWatches(data); onCountChange?.(data.length) })
      .catch(() => { setWatches([]); onCountChange?.(0) })
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = useCallback(async (articleId: string) => {
    haptic.tap()
    let snapshot: PostWatch[] = []
    setWatches((prev) => {
      snapshot = prev
      const next = prev.filter((w) => w.article_id !== articleId)
      onCountChange?.(next.length)
      return next
    })
    try {
      await apiFetch(`/api/post-watches/${encodeURIComponent(articleId)}`, { method: 'DELETE' })
      haptic.success()
      toast('已取消追蹤')
    } catch {
      setWatches(snapshot)
      onCountChange?.(snapshot.length)
      toast('取消失敗，請稍後再試', 'error')
    }
  }, [toast, onCountChange])

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-6 h-6 rounded-full border-[3px] border-tg-hint/30 border-t-tg-btn animate-spin" />
      </div>
    )
  }

  if (watches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
        <span className="text-4xl">🔔</span>
        <p className="text-tg-text font-medium text-[15px]">尚無追蹤文章</p>
        <p className="text-tg-hint text-[13px]">收到新文章通知時，點擊「追蹤留言 🔔」即可訂閱</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {watches.map((w) => (
        <div
          key={w.article_id}
          className="flex items-start justify-between gap-3 px-4 py-3 bg-tg-secondary rounded-xl"
        >
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-tg-btn">{w.board}</span>
            <a
              href={w.article_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-tg-text text-[14px] font-medium leading-snug line-clamp-2 active:opacity-60"
            >
              {w.article_title || w.article_id}
            </a>
            {w.last_reply_count > 0 && (
              <span className="text-tg-hint text-[12px]">💬 {w.last_reply_count} 則推文</span>
            )}
          </div>
          <button
            onClick={() => handleDelete(w.article_id)}
            className="flex-shrink-0 w-7 h-7 rounded-full bg-tg-bg flex items-center justify-center text-tg-hint text-[13px] active:opacity-60 mt-0.5"
            aria-label="取消追蹤"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
