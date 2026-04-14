'use client'

import pkg from '../package.json'

interface Props {
  open:          boolean
  onClose():     void
  onFeedback():  void
}

export default function Drawer({ open, onClose, onFeedback }: Props) {
  return (
    <div className={`fixed inset-0 z-[200] ${open ? '' : 'pointer-events-none'}`}>
      {/* Dark overlay */}
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={`absolute inset-y-0 left-0 w-[75vw] max-w-[300px] bg-tg-bg flex flex-col shadow-2xl transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Title */}
        <p className="text-tg-text font-semibold text-[17px] px-5 pt-12 pb-5">選單</p>

        {/* Menu items */}
        <div className="px-3 flex flex-col gap-2">
          <button
            onClick={onFeedback}
            className="flex items-center justify-between px-4 py-3.5 bg-tg-secondary rounded-xl active:opacity-60 transition-opacity"
          >
            <div className="flex items-center gap-3">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-tg-hint flex-shrink-0">
                <path d="M17 10c0 3.87-3.13 7-7 7a7.07 7.07 0 0 1-3.07-.7L3 17l.7-3.93A6.96 6.96 0 0 1 3 10c0-3.87 3.13-7 7-7s7 3.13 7 7Z" />
              </svg>
              <span className="text-tg-text text-[15px]">意見回饋</span>
            </div>
            <span className="text-tg-hint text-lg">›</span>
          </button>
        </div>

        {/* Version */}
        <p className="text-tg-hint text-xs px-5 mt-auto pb-8">v{pkg.version}</p>
      </div>
    </div>
  )
}
