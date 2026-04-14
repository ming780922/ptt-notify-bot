import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tg: {
          bg:        'var(--tg-theme-bg-color,           #ffffff)',
          text:      'var(--tg-theme-text-color,         #000000)',
          hint:      'var(--tg-theme-hint-color,         #999999)',
          btn:       'var(--tg-theme-button-color,       #2481cc)',
          'btn-text':'var(--tg-theme-button-text-color,  #ffffff)',
          secondary: 'var(--tg-theme-secondary-bg-color, #f4f4f5)',
          link:      'var(--tg-theme-link-color,         #2481cc)',
        },
        danger: '#e53935',
      },
      borderRadius: {
        sheet: '16px',
      },
      keyframes: {
        'fade-in':  { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'ad-pop':   { from: { transform: 'scale(0.92)', opacity: '0' }, to: { transform: 'scale(1)', opacity: '1' } },
        spin:       { to: { transform: 'rotate(360deg)' } },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in':  'fade-in 0.2s ease',
        'slide-up': 'slide-up 0.28s cubic-bezier(0.32,0.72,0,1)',
        'ad-pop':   'ad-pop 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        spin:       'spin 0.7s linear infinite',
        'toast-in': 'toast-in 0.2s ease',
      },
    },
  },
  plugins: [],
}

export default config
