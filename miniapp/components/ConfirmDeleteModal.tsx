'use client'

import { useState } from 'react'
import { haptic } from '@/lib/haptic'

interface Props {
  board:                    string
  onCancel():               void
  onConfirm(b: string):     Promise<void>
}

export default function ConfirmDeleteModal({ board, onCancel, onConfirm }: Props) {
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    haptic.warning()
    setLoading(true)
    await onConfirm(board)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] px-6">
      <div className="bg-tg-secondary rounded-2xl w-full max-w-[300px] p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-2 text-center">
          <p className="font-semibold text-[17px] text-tg-text">取消訂閱</p>
          <p className="text-tg-hint text-sm">
            確定要取消訂閱「<span className="text-tg-text font-medium">{board}</span>」嗎？
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="w-full py-3 bg-danger text-white rounded-xl font-semibold text-[15px] active:opacity-75 disabled:opacity-60 transition-opacity"
          >
            {loading ? '刪除中…' : '確認刪除'}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="w-full py-3 bg-tg-hint/20 text-tg-text rounded-xl font-semibold text-[15px] active:opacity-75 disabled:opacity-40 transition-opacity"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
