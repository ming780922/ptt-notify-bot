'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { setInitData, apiFetch, ApiError } from '@/lib/api'
import type { UserState, SubscriptionWithRank } from '@/lib/types'
import SubscriptionList from '@/components/SubscriptionList'
import AddBoardModal from '@/components/AddBoardModal'
import EditBoardModal from '@/components/EditBoardModal'
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal'
import AdModal, { type AdContext, type AdModalHandle } from '@/components/AdModal'
import UnlockBar from '@/components/UnlockBar'
import Toast, { type ToastHandle } from '@/components/Toast'

declare global {
  interface Window {
    Telegram: { WebApp: TelegramWebApp }
    show_10832818?: () => Promise<void>
  }
  interface TelegramWebApp {
    ready(): void
    expand(): void
    close(): void
    initData: string
    showPopup(params: object, callback?: () => void): void
  }
}

export default function Page() {
  const [userState, setUserState]       = useState<UserState | null>(null)
  const [subscriptions, setSubs]        = useState<SubscriptionWithRank[]>([])
  const [addOpen, setAddOpen]           = useState(false)
  const [editBoard, setEditBoard]       = useState<string | null>(null)
  const [confirmBoard, setConfirmBoard] = useState<string | null>(null)
  const [booted, setBooted]             = useState(false)

  const adRef   = useRef<AdModalHandle>(null)
  const toastRef = useRef<ToastHandle>(null)

  const toast = useCallback((msg: string) => toastRef.current?.show(msg), [])

  const isAdEnabled = useCallback((feature: keyof UserState['ad_flags']) => {
    return userState?.ad_flags?.[feature] === true
  }, [userState])

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadUser = useCallback(async () => {
    try {
      const u = await apiFetch<UserState>('/api/user')
      setUserState(u)
      return u
    } catch {
      setUserState(null)
      return null
    }
  }, [])

  const loadSubscriptions = useCallback(async () => {
    try {
      const subs = await apiFetch<SubscriptionWithRank[]>('/api/subscriptions')
      setSubs(subs)
    } catch {
      setSubs([])
    }
  }, [])

  const refresh = useCallback(async () => {
    await Promise.all([loadUser(), loadSubscriptions()])
  }, [loadUser, loadSubscriptions])

  // ── Boot ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (!tg) return

    if (!tg.initData) {
      // Local dev mock
      Object.defineProperty(tg, 'initData', {
        value: 'user=%7B%22id%22%3A12345678%7D&hash=debug_mode',
        writable: true,
      })
    }

    setInitData(tg.initData)
    tg.ready()
    tg.expand()

    refresh().then(async () => {
      setBooted(true)
      const params = new URLSearchParams(window.location.search)
      if (params.get('action') === 'unlock') {
        const latestUser = await loadUser()
        if (latestUser?.ad_flags?.unlock) {
          setTimeout(() => {
            adRef.current?.show({ type: 'unlock' })
          }, 500)
        }
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Ad helpers ────────────────────────────────────────────────────────────

  const handleUnlockComplete = useCallback(async () => {
    await loadUser()
    window.history.replaceState({}, document.title, window.location.pathname)
  }, [loadUser])

  // ── Add board ─────────────────────────────────────────────────────────────

  const handleAddBoard = useCallback(async (board: string) => {
    const count = userState?.subscription_count ?? subscriptions.length

    if (isAdEnabled('add_board') && count >= (userState ? 2 : 2)) {
      const ok = await adRef.current?.show({ type: 'add-board', board })
      if (!ok) return
    }

    try {
      await apiFetch('/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ board }),
      })
      setAddOpen(false)
      toast(`✅ 已訂閱 ${board}`)
      await refresh()
    } catch (err) {
      setAddOpen(false)
      if (err instanceof ApiError && err.status === 402) toast('請先解鎖進階功能')
      else if (err instanceof ApiError && err.status === 404) toast(`找不到看板「${board}」`)
      else toast('新增失敗，請稍後再試')
    }
  }, [userState, subscriptions.length, isAdEnabled, refresh, toast])

  // ── Delete board ──────────────────────────────────────────────────────────

  const handleDeleteBoard = useCallback(async (board: string) => {
    try {
      await apiFetch(`/api/subscriptions/${encodeURIComponent(board)}`, { method: 'DELETE' })
      setConfirmBoard(null)
      setEditBoard(null)
      toast(`已取消訂閱 ${board}`)
      await refresh()
    } catch {
      toast('刪除失敗，請稍後再試')
    }
  }, [refresh, toast])

  if (!booted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-tg-bg">
        <div className="w-7 h-7 rounded-full border-[3px] border-tg-hint/30 border-t-tg-btn animate-spin" />
      </div>
    )
  }

  return (
    <div className="bg-tg-bg min-h-screen">
      {/* Scrollable content area */}
      <div
        className="px-4 pt-4"
        style={{ paddingBottom: `calc(var(--bar-height) + var(--unlock-bar-height) + 24px)` }}
      >
        <SubscriptionList
          subscriptions={subscriptions}
          userState={userState}
          onEdit={setEditBoard}
          onAdd={() => setAddOpen(true)}
        />
      </div>

      {/* Bottom bar */}
      {subscriptions.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-tg-bg border-t border-tg-hint/20 flex flex-col gap-2 px-4 pt-2.5 pb-safe">
          <UnlockBar
            userState={userState}
            isAdEnabled={isAdEnabled}
            adRef={adRef}
            onUnlockComplete={handleUnlockComplete}
          />
          <div className="flex gap-2.5">
            <button
              onClick={() => setAddOpen(true)}
              className="flex-1 py-3 bg-tg-btn text-tg-btn-text font-semibold rounded-xl text-[15px] active:opacity-75 transition-opacity"
            >
              ＋ 新增看板
            </button>
            <button
              onClick={() => {
                window.Telegram.WebApp.showPopup({
                  title: '意見回饋',
                  message: '關閉後請在對話框輸入 /feedback 加上你的建議',
                  buttons: [{ type: 'close', text: '知道了' }],
                }, () => window.Telegram.WebApp.close())
              }}
              className="px-4 py-3 border border-tg-hint/30 text-tg-hint rounded-xl text-sm whitespace-nowrap active:opacity-75 transition-opacity"
            >
              💬 意見回饋
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <AddBoardModal
        open={addOpen}
        subscriptions={subscriptions}
        onClose={() => setAddOpen(false)}
        onAdd={handleAddBoard}
      />

      {editBoard && (
        <EditBoardModal
          board={editBoard}
          userState={userState}
          isAdEnabled={isAdEnabled}
          adRef={adRef}
          toast={toast}
          onClose={() => setEditBoard(null)}
          onDelete={(board) => {
            setEditBoard(null)
            setConfirmBoard(board)
          }}
        />
      )}

      {confirmBoard && (
        <ConfirmDeleteModal
          board={confirmBoard}
          onCancel={() => setConfirmBoard(null)}
          onConfirm={handleDeleteBoard}
        />
      )}

      <AdModal ref={adRef} userState={userState} onComplete={handleUnlockComplete} />
      <Toast ref={toastRef} />
    </div>
  )
}
