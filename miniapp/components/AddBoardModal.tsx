'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api'
import { MAX_KEYWORDS_PER_BOARD } from '@/lib/config'
import type { Board, SubscriptionWithRank } from '@/lib/types'

interface Props {
  subscriptions: SubscriptionWithRank[]
  onClose():     void
  onAdd(board: string, keywords: string[]): Promise<void>
}

export default function AddBoardModal({ subscriptions, onClose, onAdd }: Props) {
  const [allBoards, setAllBoards]         = useState<Board[]>([])
  const [query, setQuery]                 = useState('')
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null)
  const [keywords, setKeywords]           = useState<string[]>([])
  const [kwInput, setKwInput]             = useState('')
  const [searching, setSearching]         = useState(false)
  const [notFound, setNotFound]           = useState(false)
  const [submitting, setSubmitting]       = useState(false)

  const searchRef  = useRef<HTMLInputElement>(null)
  const kwInputRef = useRef<HTMLInputElement>(null)

  const subSet = new Set(subscriptions.map((s) => s.board.toLowerCase()))

  useEffect(() => {
    apiFetch<Board[]>('/api/boards/popular').then(setAllBoards).catch(() => {})
    setTimeout(() => searchRef.current?.focus(), 100)
  }, [])

  // ── Board list ─────────────────────────────────────────────────────────────

  const filteredBoards = allBoards.filter(
    (b) =>
      !subSet.has(b.name.toLowerCase()) &&
      (query.trim().length === 0
        ? b.is_popular === 1
        : b.name.toLowerCase().includes(query.toLowerCase()))
  )
  const showNoResults = query.trim().length > 0 && filteredBoards.length === 0 && !selectedBoard

  // Reset not-found state whenever the query changes
  useEffect(() => { setNotFound(false) }, [query])

  const handleSelectBoard = useCallback((name: string) => {
    setSelectedBoard(name)
    setQuery('')
    setTimeout(() => kwInputRef.current?.focus(), 150)
  }, [])

  const handleDirectSearch = useCallback(async () => {
    const q = query.trim()
    if (!q || searching) return
    setSearching(true)
    try {
      const boards = await apiFetch<Board[]>(`/api/boards/search?q=${encodeURIComponent(q)}`)
      const match = boards.find((b) => b.name.toLowerCase() === q.toLowerCase())
      if (match) {
        handleSelectBoard(match.name)
      } else {
        setNotFound(true)
      }
    } catch {
      setNotFound(true)
    } finally {
      setSearching(false)
    }
  }, [query, searching, handleSelectBoard])

  // ── Keywords ───────────────────────────────────────────────────────────────

  const handleAddKeyword = useCallback(() => {
    const kw = kwInput.trim()
    if (!kw || keywords.includes(kw) || keywords.length >= MAX_KEYWORDS_PER_BOARD) return
    setKeywords((prev) => [...prev, kw])
    setKwInput('')
  }, [kwInput, keywords])

  const handleRemoveKeyword = useCallback((index: number) => {
    setKeywords((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!selectedBoard || submitting) return
    setSubmitting(true)
    await onAdd(selectedBoard, keywords)
    setSubmitting(false)
  }, [selectedBoard, keywords, submitting, onAdd])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-tg-bg z-[100] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-tg-hint/15 flex-shrink-0">
        <span className="font-bold text-[17px] text-tg-text">新增訂閱</span>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-tg-secondary flex items-center justify-center text-tg-hint text-[13px] active:opacity-60"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col">
        {/* Search / selected board */}
        <div className="px-4 pt-4 pb-3 flex-shrink-0">
          {selectedBoard ? (
            /* Locked board field */
            <div className="flex items-center justify-between px-4 py-3 bg-tg-secondary rounded-xl border border-tg-btn/40">
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-tg-hint mb-0.5">看板名稱</span>
                <span className="text-tg-text text-[15px] font-medium">{selectedBoard}</span>
              </div>
              <button
                onClick={() => { setSelectedBoard(null); setKeywords([]); setTimeout(() => searchRef.current?.focus(), 100) }}
                className="text-tg-hint hover:text-tg-text active:opacity-60 text-lg leading-none ml-3"
              >
                ✕
              </button>
            </div>
          ) : (
            /* Search input */
            <div className="relative">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-tg-hint" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜尋看板名稱…"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-tg-secondary text-tg-text placeholder:text-tg-hint text-[15px] outline-none border border-transparent focus:border-tg-btn/40 transition-colors"
              />
            </div>
          )}
        </div>

        {/* Board list — hidden once board selected */}
        {!selectedBoard && (
          <div className="px-4 pb-3 flex-shrink-0">
            {!query && (
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tg-hint mb-2">熱門看板</p>
            )}

            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
              {filteredBoards.map((b) => (
                <button
                  key={b.name}
                  onClick={() => handleSelectBoard(b.name)}
                  className="flex items-center justify-between px-4 py-3 bg-tg-secondary rounded-xl active:opacity-60 transition-opacity text-left"
                >
                  <span className="font-medium text-tg-text text-[15px]">{b.name}</span>
                  <span className="text-tg-hint text-lg">›</span>
                </button>
              ))}

              {showNoResults && (
                notFound ? (
                  <div className="flex items-center gap-3 px-4 py-3 bg-tg-secondary rounded-xl">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-tg-hint flex-shrink-0">
                      <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                    </svg>
                    <span className="text-tg-hint text-[15px]">找不到看板「{query}」</span>
                  </div>
                ) : (
                  <button
                    onClick={handleDirectSearch}
                    disabled={searching}
                    className="flex items-center justify-between px-4 py-3 bg-tg-secondary rounded-xl active:opacity-60 transition-opacity text-left disabled:opacity-50"
                  >
                    <span className="text-tg-text text-[15px]">
                      {searching ? '搜尋中…' : `直接搜尋「${query}」`}
                    </span>
                    {searching ? (
                      <div className="w-4 h-4 rounded-full border-2 border-tg-hint/30 border-t-tg-btn animate-spin" />
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-tg-hint">
                        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                      </svg>
                    )}
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-tg-hint/15 flex-shrink-0" />

        {/* Keywords section */}
        <div className="px-4 py-4 flex flex-col gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-tg-hint mb-1">
              關鍵字篩選 <span className="normal-case font-normal">（選填）</span>
            </p>
            <p className="text-xs text-tg-hint">
              留空則接收所有新文章；設定後只通知標題含關鍵字的文章
            </p>
          </div>

          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {keywords.map((kw, i) => (
                <span key={kw} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 bg-tg-btn text-tg-btn-text rounded-full text-[13px] font-semibold">
                  {kw}
                  <button
                    onClick={() => handleRemoveKeyword(i)}
                    className="w-4 h-4 rounded-full flex items-center justify-center text-tg-btn-text/80 hover:text-tg-btn-text text-xs font-bold leading-none"
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
                ref={kwInputRef}
                value={kwInput}
                onChange={(e) => setKwInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddKeyword() } }}
                placeholder="輸入關鍵字…"
                maxLength={20}
                disabled={!selectedBoard}
                className="flex-1 px-3.5 py-2 bg-tg-secondary text-tg-text placeholder:text-tg-hint rounded-xl text-sm outline-none disabled:opacity-40"
              />
              <button
                onClick={handleAddKeyword}
                disabled={!kwInput.trim() || !selectedBoard}
                className="px-4 py-2 bg-tg-btn text-tg-btn-text rounded-xl font-semibold text-lg leading-none disabled:opacity-35 active:opacity-75 transition-opacity"
              >
                ＋
              </button>
            </div>
          )}

          {keywords.length >= MAX_KEYWORDS_PER_BOARD && (
            <p className="text-xs text-tg-hint">已達上限（{MAX_KEYWORDS_PER_BOARD} 個）</p>
          )}
        </div>
      </div>

      {/* Subscribe button */}
      <div className="px-4 pt-3 pb-safe border-t border-tg-hint/15 flex-shrink-0" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}>
        <button
          onClick={handleSubmit}
          disabled={!selectedBoard || submitting}
          className="w-full py-3.5 bg-tg-btn text-tg-btn-text font-semibold rounded-xl text-[15px] active:opacity-75 transition-opacity disabled:opacity-40"
        >
          {submitting
            ? '訂閱中…'
            : selectedBoard
              ? `訂閱 ${selectedBoard}`
              : '請先選擇看板'
          }
        </button>
      </div>
    </div>
  )
}
