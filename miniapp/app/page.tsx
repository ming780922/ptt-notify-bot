'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { setInitData, apiFetch, ApiError } from '@/lib/api'
import { haptic } from '@/lib/haptic'
import type { SubscriptionWithRank } from '@/lib/types'
import SubscriptionList from '@/components/SubscriptionList'
import AddBoardModal from '@/components/AddBoardModal'
import EditBoardModal from '@/components/EditBoardModal'
import Drawer from '@/components/Drawer'
import FeedbackScreen from '@/components/FeedbackScreen'
import Toast, { type ToastHandle } from '@/components/Toast'

declare global {
  interface Window {
    Telegram: { WebApp: TelegramWebApp }
  }
  interface TelegramWebApp {
    ready(): void
    expand(): void
    close(): void
    initData: string
    version: string
    BackButton: {
      show(): void
      hide(): void
      onClick(fn: () => void): void
      offClick(fn: () => void): void
    }
    HapticFeedback: {
      notificationOccurred(type: 'success' | 'warning' | 'error'): void
      impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
    }
  }
}

export default function Page() {
  type ModalState = { mode: 'create' } | { mode: 'edit'; board: string }

  const [subscriptions, setSubs]        = useState<SubscriptionWithRank[]>([])
  const [modal, setModal]               = useState<ModalState | null>(null)
  const [drawerOpen, setDrawerOpen]     = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [booted, setBooted]             = useState(false)

  const toastRef = useRef<ToastHandle>(null)
  const toast = useCallback((msg: string, type?: 'success' | 'error') => toastRef.current?.show(msg, type), [])

  // ── BackButton — close topmost layer on native back gesture ──────────────
  useEffect(() => {
    if (!booted) return
    const tg = window.Telegram?.WebApp
    if (!tg?.BackButton) return

    const anyOpen = !!modal || feedbackOpen || drawerOpen
    if (anyOpen) {
      tg.BackButton.show()
      const handler = () => {
        haptic.tap()
        if (drawerOpen)        setDrawerOpen(false)
        else if (feedbackOpen) setFeedbackOpen(false)
        else                   setModal(null)
      }
      tg.BackButton.onClick(handler)
      return () => {
        tg.BackButton.offClick(handler)
        tg.BackButton.hide()
      }
    } else {
      tg.BackButton.hide()
    }
  }, [booted, modal, feedbackOpen, drawerOpen])

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadSubscriptions = useCallback(async () => {
    try {
      const subs = await apiFetch<SubscriptionWithRank[]>('/api/subscriptions')
      setSubs(subs)
    } catch {
      setSubs([])
    }
  }, [])

  // ── Boot ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (!tg) return

    const initDataValue = tg.initData || 'user=%7B%22id%22%3A12345678%7D&hash=debug_mode'
    setInitData(initDataValue)

    if (!tg.initData && tg.version === '6.0') {
      try { Object.defineProperty(tg, 'version', { value: '8.0', configurable: true }) } catch { /* ignore */ }
    }

    tg.ready()
    tg.expand()

    loadSubscriptions().then(() => setBooted(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Add board ─────────────────────────────────────────────────────────────

  const handleAdd = useCallback(async (board: string, keywords: string[]) => {
    try {
      await apiFetch('/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ board, keywords }),
      })
      haptic.success()
      setModal(null)
      toast(`已訂閱 ${board}`)
      await loadSubscriptions()
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) toast(`找不到看板「${board}」`, 'error')
      else toast('新增失敗，請稍後再試', 'error')
    }
  }, [loadSubscriptions, toast])

  // ── Edit board (save callback) ────────────────────────────────────────────

  const handleEditSave = useCallback(async () => {
    setModal(null)
    toast('已儲存')
    await loadSubscriptions()
  }, [loadSubscriptions, toast])

  // ── Delete board ──────────────────────────────────────────────────────────

  const handleDeleteBoard = useCallback(async (board: string) => {
    const snapshot = subscriptions
    setSubs((prev) => prev.filter((s) => s.board !== board))
    setModal(null)
    try {
      await apiFetch(`/api/subscriptions/${encodeURIComponent(board)}`, { method: 'DELETE' })
      haptic.success()
      toast(`已取消訂閱 ${board}`)
    } catch {
      setSubs(snapshot)
      setModal({ mode: 'edit', board })
      toast('刪除失敗，請稍後再試', 'error')
    }
  }, [subscriptions, toast])

  // ── Render ────────────────────────────────────────────────────────────────

  if (!booted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-tg-bg">
        <div className="w-7 h-7 rounded-full border-[3px] border-tg-hint/30 border-t-tg-btn animate-spin" />
      </div>
    )
  }

  return (
    <div className="relative bg-tg-bg min-h-screen">
      {/* Hamburger button */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="absolute top-4 left-4 z-10 p-1 text-tg-hint active:opacity-60 transition-opacity"
        aria-label="選單"
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <line x1="2" y1="5"  x2="20" y2="5"  />
          <line x1="2" y1="11" x2="20" y2="11" />
          <line x1="2" y1="17" x2="20" y2="17" />
        </svg>
      </button>

      {/* Main content */}
      <div className="px-4 pt-4 pb-28">
        <SubscriptionList
          subscriptions={subscriptions}
          onEdit={(board) => { haptic.tap(); setModal({ mode: 'edit', board }) }}
          onAdd={() => setModal({ mode: 'create' })}
        />
      </div>

      {/* FAB — only when subscriptions exist */}
      {subscriptions.length > 0 && (
        <button
          onClick={() => setModal({ mode: 'create' })}
          className="fixed bottom-6 right-4 w-14 h-14 rounded-full bg-tg-btn text-tg-btn-text shadow-lg flex items-center justify-center text-3xl font-light active:opacity-75 transition-opacity z-10"
          style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          +
        </button>
      )}

      {/* Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onFeedback={() => { setDrawerOpen(false); setFeedbackOpen(true) }}
      />

      {/* Feedback screen */}
      {feedbackOpen && (
        <FeedbackScreen onClose={() => setFeedbackOpen(false)} toast={toast} />
      )}

      {/* Add modal */}
      {modal?.mode === 'create' && (
        <AddBoardModal
          key="create"
          subscriptions={subscriptions}
          onClose={() => setModal(null)}
          onAdd={handleAdd}
        />
      )}

      {/* Edit modal */}
      {modal?.mode === 'edit' && (
        <EditBoardModal
          key={`edit-${modal.board}`}
          board={modal.board}
          initialKeywords={subscriptions.find(s => s.board === modal.board)?.keywords ?? []}
          toast={toast}
          onClose={() => setModal(null)}
          onSave={handleEditSave}
          onDelete={handleDeleteBoard}
        />
      )}

      <Toast ref={toastRef} />
    </div>
  )
}
