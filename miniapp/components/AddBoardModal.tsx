'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api'
import type { Board, SubscriptionWithRank } from '@/lib/types'
import ModalSheet from './ModalSheet'

interface Props {
  open:          boolean
  subscriptions: SubscriptionWithRank[]
  onClose():     void
  onAdd(board: string): void
}

export default function AddBoardModal({ open, subscriptions, onClose, onAdd }: Props) {
  const [query, setQuery]           = useState('')
  const [popular, setPopular]       = useState<Board[]>([])
  const [results, setResults]       = useState<Board[] | null>(null)
  const [searching, setSearching]   = useState(false)
  const [loadingBoard, setLoadingBoard] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)

  const subSet = new Set(subscriptions.map((s) => s.board.toLowerCase()))

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults(null)
      setTimeout(() => inputRef.current?.focus(), 100)
      if (popular.length === 0) {
        apiFetch<Board[]>('/api/boards/popular').then(setPopular).catch(() => {})
      }
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = useCallback((q: string) => {
    setQuery(q)
    clearTimeout(timerRef.current)
    if (!q.trim()) { setResults(null); return }
    setSearching(true)
    timerRef.current = setTimeout(async () => {
      try {
        const boards = await apiFetch<Board[]>(`/api/boards/search?q=${encodeURIComponent(q.trim())}`)
        setResults(boards)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 350)
  }, [])

  const handleAdd = useCallback(async (board: string) => {
    setLoadingBoard(board)
    await onAdd(board)
    setLoadingBoard(null)
  }, [onAdd])

  const displayBoards = (results ?? popular).filter((b) => !subSet.has(b.name.toLowerCase()))

  return (
    <ModalSheet open={open} onClose={onClose} title="新增看板">
      {/* Search input */}
      <div className="px-4 pb-3 flex-shrink-0">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="搜尋看板名稱…"
          className="w-full px-4 py-2.5 rounded-xl bg-tg-secondary text-tg-text placeholder:text-tg-hint text-[15px] outline-none border border-transparent focus:border-tg-btn/40 transition-colors"
        />
      </div>

      {/* Board grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {!query && !results && (
          <p className="text-[11px] font-semibold uppercase tracking-wide text-tg-hint mb-3">熱門看板</p>
        )}

        {searching ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 rounded-full border-2 border-tg-hint/30 border-t-tg-btn animate-spin" />
          </div>
        ) : displayBoards.length === 0 && (query || results) ? (
          <p className="text-tg-hint text-sm py-4 text-center">
            {results?.length === 0 ? `找不到看板「${query}」` : '所有相關看板皆已訂閱'}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {displayBoards.map((b) => (
              <button
                key={b.name}
                onClick={() => handleAdd(b.name)}
                disabled={loadingBoard === b.name}
                className="flex flex-col items-start px-3.5 py-3 bg-tg-secondary rounded-xl active:opacity-60 transition-opacity disabled:opacity-40 text-left"
              >
                <span className="font-semibold text-[13px] text-tg-text">{b.name}</span>
                {b.display_name && b.display_name !== b.name && (
                  <span className="text-tg-hint text-xs mt-0.5 truncate w-full">{b.display_name}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </ModalSheet>
  )
}
