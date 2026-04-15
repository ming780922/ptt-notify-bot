'use client'

import { useEffect } from 'react'

/**
 * Registers Telegram's native BackButton for the current page.
 * On click / back gesture → history.back().
 * Cleans up on unmount.
 */
export default function TelegramBackButton() {
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp
    if (!tg?.BackButton) return
    tg.BackButton.show()
    const handler = () => history.back()
    tg.BackButton.onClick(handler)
    return () => {
      tg.BackButton.offClick(handler)
      tg.BackButton.hide()
    }
  }, [])

  return null
}
