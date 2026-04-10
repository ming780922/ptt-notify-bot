'use client'

interface Props {
  open:     boolean
  onClose():void
  title:    string
  children: React.ReactNode
  small?:   boolean
}

export default function ModalSheet({ open, onClose, title, children, small }: Props) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/45 flex items-end z-[100] animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={`w-full bg-tg-bg flex flex-col animate-slide-up overflow-hidden
          ${small ? 'max-h-[55vh] rounded-t-sheet' : 'max-h-[88vh] rounded-t-sheet'}
        `}
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom,0px),8px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-tg-hint/15 flex-shrink-0">
          <span className="font-bold text-[17px] text-tg-text">{title}</span>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-tg-secondary flex items-center justify-center text-tg-hint text-[13px] active:opacity-60"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
