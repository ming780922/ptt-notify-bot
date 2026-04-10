'use client'

import { useState } from 'react'
import ModalSheet from './ModalSheet'

interface Props {
  board:              string
  onCancel():         void
  onConfirm(b: string): Promise<void>
}

export default function ConfirmDeleteModal({ board, onCancel, onConfirm }: Props) {
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    await onConfirm(board)
    setLoading(false)
  }

  return (
    <ModalSheet open title="確認刪除" onClose={onCancel} small>
      <div className="px-4 py-5 flex flex-col gap-5">
        <p className="text-tg-hint text-[14px] text-center">
          確定要取消訂閱「<strong className="text-tg-text">{board}</strong>」嗎？
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-3 bg-tg-secondary text-tg-text rounded-xl font-semibold text-[15px] active:opacity-75 disabled:opacity-40 transition-opacity"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-3 bg-danger text-white rounded-xl font-semibold text-[15px] active:opacity-75 disabled:opacity-60 transition-opacity"
          >
            {loading ? '刪除中…' : '刪除'}
          </button>
        </div>
      </div>
    </ModalSheet>
  )
}
