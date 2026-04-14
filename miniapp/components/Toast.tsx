'use client'

import { forwardRef, useImperativeHandle, useState } from 'react'

export interface ToastHandle {
  show(msg: string, type?: 'success' | 'error', duration?: number): void
}

type ToastItem = { id: number; text: string; type: 'success' | 'error' }

const Toast = forwardRef<ToastHandle>(function Toast(_, ref) {
  const [messages, setMessages] = useState<ToastItem[]>([])

  useImperativeHandle(ref, () => ({
    show(msg, type = 'success', duration = 2500) {
      const id = Date.now()
      setMessages((prev) => [...prev, { id, text: msg, type }])
      setTimeout(() => setMessages((prev) => prev.filter((m) => m.id !== id)), duration)
    },
  }))

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 flex flex-col-reverse gap-2 z-[200] pointer-events-none"
      style={{ bottom: 'max(env(safe-area-inset-bottom, 0px), 24px)' }}
    >
      {messages.map((m) => (
        <div
          key={m.id}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm whitespace-nowrap animate-toast-in ${
            m.type === 'error'
              ? 'bg-red-500/90 text-white'
              : 'bg-black/80 text-white'
          }`}
        >
          {m.type === 'error'
            ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          }
          {m.text}
        </div>
      ))}
    </div>
  )
})

export default Toast
