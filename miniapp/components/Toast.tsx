'use client'

import { forwardRef, useImperativeHandle, useState } from 'react'

export interface ToastHandle {
  show(msg: string, duration?: number): void
}

const Toast = forwardRef<ToastHandle>(function Toast(_, ref) {
  const [messages, setMessages] = useState<{ id: number; text: string }[]>([])

  useImperativeHandle(ref, () => ({
    show(msg, duration = 2500) {
      const id = Date.now()
      setMessages((prev) => [...prev, { id, text: msg }])
      setTimeout(() => setMessages((prev) => prev.filter((m) => m.id !== id)), duration)
    },
  }))

  return (
    <>
      {messages.map((m) => (
        <div
          key={m.id}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/75 text-white px-[18px] py-2.5 rounded-full text-sm z-[200] whitespace-nowrap animate-toast-in pointer-events-none"
        >
          {m.text}
        </div>
      ))}
    </>
  )
})

export default Toast
