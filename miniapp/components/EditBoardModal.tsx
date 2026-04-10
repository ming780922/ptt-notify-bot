'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { apiFetch, ApiError } from '@/lib/api'
import { haptic } from '@/lib/haptic'
import type { UserState, AdFlags } from '@/lib/types'
import { FREE_KEYWORDS_PER_BOARD, MAX_KEYWORDS_PER_BOARD } from '@/lib/config'
import type { AdModalHandle } from './AdModal'
import ModalSheet from './ModalSheet'

interface Props {
  board:        string
  userState:    UserState | null
  isAdEnabled:  (f: keyof AdFlags) => boolean
  adRef:        RefObject<AdModalHandle | null>
  toast(msg: string): void
  onClose():    void
  onDelete(board: string): void
}

export default function EditBoardModal({ board, userState, isAdEnabled, adRef, toast, onClose, onDelete }: Props) {
  const [keywords, setKeywords] = useState<string[]>([])
  const [loading, setLoading]   = useState(true)
  const [input, setInput]       = useState('')
  const [saving, setSaving]     = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLoading(true)
    setKeywords([])
    setInput('')
    apiFetch<{ keywords: string[] }>(`/api/subscriptions/${encodeURIComponent(board)}/keywords`)
      .then((d) => setKeywords(d.keywords))
      .catch(() => setKeywords([]))
      .finally(() => setLoading(false))
  }, [board])

  const saveKeywords = useCallback(async (next: string[]) => {
    setSaving(true)
    try {
      const data = await apiFetch<{ keywords: string[] }>(
        `/api/subscriptions/${encodeURIComponent(board)}/keywords`,
        { method: 'PUT', body: JSON.stringify({ keywords: next }) }
      )
      setKeywords(data.keywords)
      return data.keywords
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) toast('請先解鎖進階功能')
      else toast('操作失敗，請稍後再試')
      return null
    } finally {
      setSaving(false)
    }
  }, [board, toast])

  const handleAdd = useCallback(async () => {
    const kw = input.trim()
    if (!kw) return
    if (keywords.includes(kw)) { toast('關鍵字已存在'); return }

    if (isAdEnabled('add_keyword') && keywords.length >= FREE_KEYWORDS_PER_BOARD) {
      const ok = await adRef.current?.show({ type: 'add-keyword' })
      if (!ok) return
    }

    const next = await saveKeywords([...keywords, kw])
    if (next) { haptic.success(); setInput('') }
  }, [input, keywords, isAdEnabled, adRef, saveKeywords, toast])

  const handleRemove = useCallback(async (index: number) => {
    const prev = keywords
    const next = keywords.filter((_, i) => i !== index)
    setKeywords(next)               // optimistic
    const saved = await saveKeywords(next)
    if (!saved) setKeywords(prev)   // rollback
  }, [keywords, saveKeywords])

  const atMax  = keywords.length >= MAX_KEYWORDS_PER_BOARD
  const adHint = isAdEnabled('add_keyword') && keywords.length >= FREE_KEYWORDS_PER_BOARD && !atMax

  return (
    <ModalSheet open title={board} onClose={onClose}>
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">
        {/* Keywords section */}
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-tg-hint mb-3">
            關鍵字過濾
          </p>

          {loading ? (
            <div className="flex justify-center py-4">
              <div className="w-5 h-5 rounded-full border-2 border-tg-hint/30 border-t-tg-btn animate-spin" />
            </div>
          ) : (
            <>
              {/* Tag list */}
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {keywords.map((kw, i) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 bg-tg-btn/10 text-tg-btn rounded-full text-[13px] font-medium"
                    >
                      {kw}
                      <button
                        onClick={() => handleRemove(i)}
                        disabled={saving}
                        className="w-4 h-4 rounded-full flex items-center justify-center text-tg-btn/60 hover:text-tg-btn text-xs font-bold leading-none disabled:opacity-40"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Add row */}
              {!atMax && (
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
                    placeholder="輸入關鍵字…"
                    maxLength={20}
                    className="flex-1 px-3.5 py-2 bg-tg-secondary text-tg-text placeholder:text-tg-hint rounded-xl text-sm outline-none"
                  />
                  <button
                    onClick={handleAdd}
                    disabled={!input.trim() || saving}
                    className="px-4 py-2 bg-tg-btn text-tg-btn-text rounded-xl font-semibold text-lg leading-none disabled:opacity-35 active:opacity-75 transition-opacity"
                  >
                    ＋
                  </button>
                </div>
              )}

              {/* Hint */}
              <p className="text-xs text-tg-hint mt-2">
                {atMax
                  ? `已達上限（${MAX_KEYWORDS_PER_BOARD} 個）`
                  : adHint
                    ? `${keywords.length} / ${MAX_KEYWORDS_PER_BOARD} 個關鍵字（新增需觀看廣告）`
                    : ''}
              </p>
            </>
          )}
        </section>

        {/* Delete */}
        <button
          onClick={() => onDelete(board)}
          className="w-full py-3 rounded-xl font-semibold text-[15px] text-danger bg-danger/10 active:opacity-75 transition-opacity mt-auto"
        >
          刪除訂閱
        </button>
      </div>
    </ModalSheet>
  )
}
