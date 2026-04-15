'use client'

import TelegramBackButton from '@/components/TelegramBackButton'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-tg-bg text-tg-text">
      <TelegramBackButton />
      {/* Header */}
      <div className="sticky top-0 bg-tg-bg border-b border-tg-hint/15 relative flex items-center justify-center px-4 py-4 z-10">
        <span className="font-bold text-[17px]">使用條款</span>
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

        <Section title="一、服務說明">
          <p>PTT 通知 Bot 是一款 Telegram Bot 服務，提供 PTT 看板新文章即時通知功能。用戶可訂閱指定看板並設定關鍵字過濾條件，當有符合條件的新文章發布時透過 Telegram 接收通知。</p>
        </Section>

        <Section title="二、服務條件">
          <p className="mb-2">使用本服務須符合以下條件：</p>
          <List items={[
            '擁有有效的 Telegram 帳號',
            '年滿 18 歲，或在父母／監護人同意下使用',
            '同意本使用條款及隱私權政策',
          ]} />
        </Section>

        <Section title="三、服務功能">
          <p className="mb-2">本服務提供以下功能，目前完全免費使用：</p>
          <List items={[
            '訂閱 PTT 看板，接收新文章通知',
            '每個看板可設定關鍵字過濾，僅接收包含指定關鍵字的文章通知',
            '透過 Mini App 管理訂閱設定',
          ]} />
          <p className="mt-2">本服務保留未來調整功能範圍或收費方式的權利，並將提前通知用戶。</p>
        </Section>

        <Section title="四、用戶行為規範">
          <p className="mb-2">使用本服務時，您同意不得：</p>
          <List items={[
            '以自動化程式或機器人方式大量使用本服務',
            '嘗試破解、反向工程或干擾本服務的正常運作',
            '利用本服務從事任何違法行為',
            '散布垃圾訊息或騷擾其他用戶',
          ]} />
          <p className="mt-2">違反上述規範者，本服務有權暫停或終止其使用資格，恕不另行通知。</p>
        </Section>

        <Section title="五、服務可用性">
          <p className="mb-2">本服務以「現況」提供，我們將盡力維持服務穩定，但不保證：</p>
          <List items={[
            '服務 24 小時不中斷',
            '通知即時送達（受 PTT 爬蟲頻率及 Telegram 傳送限制影響）',
            '服務永久持續提供',
          ]} />
          <p className="mt-2">本服務可能因系統維護、升級或不可抗力因素暫停，我們將視情況提前通知。</p>
        </Section>

        <Section title="六、PTT 內容聲明">
          <p>本服務提供的文章通知內容來源為 PTT（批踢踢實業坊），本服務僅提供文章標題及連結，不對 PTT 上的文章內容負責。PTT 內容的著作權歸原作者所有。</p>
        </Section>

        <Section title="七、免責聲明">
          <p className="mb-2">在法律允許的最大範圍內，本服務對以下情況不承擔責任：</p>
          <List items={[
            '因服務中斷或延遲造成的損失',
            'PTT 看板內容的正確性或合法性',
            '因不可抗力因素導致的服務異常',
          ]} />
        </Section>

        <Section title="八、服務終止">
          <p>您可以隨時停止使用本服務，並透過 /feedback 要求刪除您的所有資料。</p>
          <p className="mt-2">本服務保留在未事先通知的情況下，對違反本條款的用戶暫停或終止服務的權利。</p>
        </Section>

        <Section title="九、條款變更">
          <p>本服務保留隨時修改本條款的權利。修改後將透過 Bot 通知用戶，繼續使用本服務即視為同意修改後的條款。</p>
        </Section>

        <Section title="十、準據法">
          <p>本條款依中華民國法律解釋及執行。如有爭議，雙方同意以台灣台北地方法院為第一審管轄法院。</p>
        </Section>

        <Section title="十一、聯絡我們">
          <p>如有任何使用條款相關問題，請透過 Telegram Bot 的 /feedback 指令聯絡我們。</p>
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
