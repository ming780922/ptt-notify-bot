type NotificationType = 'success' | 'warning' | 'error'
type ImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'

function hf() {
  return (typeof window !== 'undefined' ? window.Telegram?.WebApp?.HapticFeedback : null) ?? null
}

export const haptic = {
  success: () => hf()?.notificationOccurred('success' as NotificationType),
  warning: () => hf()?.notificationOccurred('warning' as NotificationType),
  error:   () => hf()?.notificationOccurred('error' as NotificationType),
  tap:     () => hf()?.impactOccurred('light' as ImpactStyle),
}
