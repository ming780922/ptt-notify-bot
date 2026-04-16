// Legal content mirrors landing/privacy.html — update both when changing legal text
'use client'

import TelegramBackButton from '@/components/TelegramBackButton'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-tg-bg text-tg-text">
      <TelegramBackButton />
      {/* Header */}
      <div className="sticky top-0 bg-tg-bg border-b border-tg-hint/15 relative flex items-center justify-center px-4 py-4 z-10">
        <span className="font-bold text-[17px]">隱私權政策</span>
        <button
          onClick={() => history.back()}
          className="absolute right-4 w-7 h-7 rounded-full bg-tg-secondary flex items-center justify-center text-tg-hint text-[13px] active:opacity-60"
          aria-label="關閉"
        >
          ✕
        </button>
      </div>

      <div className="px-5 py-6 flex flex-col gap-6 max-w-2xl mx-auto pb-12">
        <p className="text-xs text-tg-hint">最後更新日期：2026 年 4 月 14 日</p>

        <Section title="一、前言">
          <p>歡迎使用 PTT貝爾（以下簡稱「本服務」）。本隱私權政策說明我們如何收集、使用及保護您的個人資料。使用本服務即表示您同意本政策的內容。</p>
        </Section>

        <Section title="二、收集的資料">
          <p className="mb-2 font-medium text-tg-text">自動收集</p>
          <List items={[
            'Telegram 用戶識別碼（User ID）',
            'Telegram 用戶名稱（Username，若有設定）',
            '訂閱的 PTT 看板清單',
            '各看板設定的關鍵字過濾條件',
            '服務使用時間',
          ]} />
          <p className="mt-3 mb-2 font-medium text-tg-text">您主動提供</p>
          <List items={[
            '透過 /feedback 指令提交的意見內容',
          ]} />
        </Section>

        <Section title="三、資料用途">
          <p className="mb-2">收集的資料僅用於以下目的：</p>
          <List items={[
            '提供 PTT 看板新文章通知服務',
            '記錄訂閱設定及關鍵字條件以便持續提供服務',
            '改善服務品質（根據用戶反饋）',
          ]} />
          <p className="mt-2">我們不會將您的資料用於上述目的以外的任何用途。</p>
        </Section>

        <Section title="四、資料儲存">
          <p>您的資料儲存於 Cloudflare 提供的資料庫服務（D1），伺服器位於 Cloudflare 全球資料中心。</p>
        </Section>

        <Section title="五、資料分享">
          <p className="mb-2">我們不會出售、出租或交換您的個人資料給任何第三方，但以下情況除外：</p>
          <List items={[
            '法律要求或政府機關依法要求提供',
            '保護本服務、用戶或公眾安全之必要',
          ]} />
        </Section>

        <Section title="六、資料保留期限">
          <List items={[
            '訂閱資料及關鍵字設定：帳號存續期間持續保留',
            '通知記錄：7 天後自動刪除',
            '反饋內容：服務改善使用完畢後刪除',
          ]} />
        </Section>

        <Section title="七、您的權利">
          <p className="mb-2">您有權：</p>
          <List items={[
            '查詢：了解我們儲存的您的個人資料內容',
            '更正：要求更正不正確的資料',
            '刪除：要求刪除您的所有資料',
          ]} />
          <p className="mt-2">如需行使上述權利，請透過 /feedback 指令聯絡我們，我們將於 30 日內回覆處理。</p>
        </Section>

        <Section title="八、未成年人">
          <p>本服務不針對未滿 18 歲的未成年人提供服務。若您未滿 18 歲，請勿使用本服務。</p>
        </Section>

        <Section title="九、隱私權政策變更">
          <p>我們保留隨時修改本政策的權利。重大變更時將透過 Bot 通知用戶，繼續使用本服務即視為同意修改後的政策。</p>
        </Section>

        <Section title="十、聯絡我們">
          <p>如有任何隱私權相關問題，請透過 Telegram Bot 的 /feedback 指令聯絡我們。</p>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-semibold text-[15px] text-tg-text">{title}</h2>
      <div className="text-sm text-tg-hint leading-relaxed">{children}</div>
    </div>
  )
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span className="mt-1.5 w-1 h-1 rounded-full bg-tg-hint flex-shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}
