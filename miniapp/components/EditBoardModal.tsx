'use client'

import { useCallback, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { haptic } from '@/lib/haptic'
import { MAX_KEYWORDS_PER_BOARD } from '@/lib/config'

interface Props {
  board:                string
  initialKeywords:      string[]
  toast(msg: string):   void
  onClose():            void
  onSave():             void
  onDelete(b: string):  void
}

export default function EditBoardModal({ board, initialKeywords, toast, onClose, onSave, onDelete }: Props) {
  const [keywords, setKeywords]             = useState<string[]>(initialKeywords)
  const [input, setInput]                   = useState('')
  const [saving, setSaving]                 = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  const isDirty = JSON.stringify(keywords) !== JSON.stringify(initialKeywords)

  // ── Keywords ───────────────────────────────────────────────────────────────

  const handleAdd = useCallback(() => {
    const kw = input.trim()
    if (!kw) return
    if (keywords.includes(kw)) { toast('關鍵字已存在'); return }
    if (keywords.length >= MAX_KEYWORDS_PER_BOARD) return
    setKeywords((prev) => [...prev, kw])
    setInput('')
  }, [input, keywords, toast])

  const handleRemove = useCallback((index: number) => {
    setKeywords((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!isDirty || saving) return
    setSaving(true)
    try {
      await apiFetch(`/api/subscriptions/${encodeURIComponent(board)}/keywords`, {
        method: 'PUT',
        body: JSON.stringify({ keywords }),
      })
      haptic.success()
      onSave()
    } catch {
      toast('儲存失敗，請稍後再試')
    } finally {
      setSaving(false)
    }
  }, [board, keywords, isDirty, saving, toast, onSave])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-tg-bg z-[100] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-tg-hint/15 flex-shrink-0">
        <span className="font-bold text-[17px] text-tg-text">編輯訂閱</span>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-tg-secondary flex items-center justify-center text-tg-hint text-[13px] active:opacity-60"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">
        {/* Locked board field */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-tg-hint mb-2">看板名稱</p>
          <div className="flex items-center justify-between px-4 py-3 bg-tg-secondary rounded-xl">
            <span className="text-tg-text text-[15px] font-medium">{board}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-tg-hint flex-shrink-0">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
        </div>

        {/* Keywords */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-tg-hint mb-1">
            關鍵字篩選 <span className="normal-case font-normal">（選填）</span>
          </p>
          <p className="text-xs text-tg-hint mb-3">
            留空則接收所有新文章；設定後只通知標題含關鍵字的文章
          </p>

          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {keywords.map((kw, i) => (
                <span key={kw} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 bg-tg-btn/20 text-tg-btn rounded-full text-[13px] font-semibold border border-tg-btn/25">
                  {kw}
                  <button
                    onClick={() => handleRemove(i)}
                    className="w-4 h-4 rounded-full flex items-center justify-center text-tg-btn/80 hover:text-tg-btn text-xs font-bold leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {keywords.length < MAX_KEYWORDS_PER_BOARD && (
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
                disabled={!input.trim()}
                className="px-4 py-2 bg-tg-btn text-tg-btn-text rounded-xl font-semibold text-lg leading-none disabled:opacity-35 active:opacity-75 transition-opacity"
              >
                ＋
              </button>
            </div>
          )}

          {keywords.length >= MAX_KEYWORDS_PER_BOARD && (
            <p className="text-xs text-tg-hint mt-1">已達上限（{MAX_KEYWORDS_PER_BOARD} 個）</p>
          )}
        </div>

        {/* System hint */}
        <div className="flex gap-2.5 bg-tg-secondary/60 rounded-xl p-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-tg-hint flex-shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          <div>
            <p className="text-xs font-semibold text-tg-hint mb-0.5">系統策略</p>
            <p className="text-xs text-tg-hint leading-relaxed">
              關鍵字過濾採用「聯集」邏輯，也就是說多個關鍵字，只要文章標題含有其中之一，即會通知你。
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2.5 mt-auto">
          {confirmingDelete ? (
            <>
              <p className="text-sm text-tg-hint text-center">確定要取消訂閱「{board}」？</p>
              <button
                onClick={() => onDelete(board)}
                className="w-full py-3.5 bg-danger text-white font-semibold rounded-xl text-[15px] active:opacity-75 transition-opacity"
              >
                確認刪除
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="w-full py-3 bg-tg-hint/20 text-tg-text font-semibold rounded-xl text-[15px] active:opacity-75 transition-opacity"
              >
                取消
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleSave}
                disabled={!isDirty || saving}
                className="w-full py-3.5 bg-tg-btn text-tg-btn-text font-semibold rounded-xl text-[15px] active:opacity-75 transition-opacity disabled:opacity-40"
              >
                {saving ? '儲存中…' : '儲存變更'}
              </button>
              <button
                onClick={() => setConfirmingDelete(true)}
                className="w-full py-3 rounded-xl font-semibold text-[15px] text-danger bg-danger/10 active:opacity-75 transition-opacity"
              >
                刪除訂閱
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
