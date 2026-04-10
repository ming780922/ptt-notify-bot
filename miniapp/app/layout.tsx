import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: 'PTT 通知訂閱',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <Script src="//libtl.com/sdk.js" data-zone="10832818" data-sdk="show_10832818" strategy="beforeInteractive" />
      </head>
      <body>{children}</body>
    </html>
  )
}
