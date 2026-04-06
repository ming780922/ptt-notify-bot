/* globals Telegram */
'use strict'

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'https://ptt-notify-bot-api.ming780922.workers.dev' // 你也可以改成 http://localhost:8787 連向本地 API
  : 'https://ptt-notify-bot-api.ming780922.workers.dev'
const FREE_BOARDS_LIMIT = 2
const FREE_KEYWORDS_PER_BOARD = 1
const MAX_KEYWORDS_PER_BOARD = 5

// ── Mock Telegram for local dev ──────────────────────────────────────────────
if (!window.Telegram.WebApp.initData) {
  console.log('🛠️ Running in Local Debug Mode')
  window.Telegram.WebApp.initData = 'user=%7B%22id%22%3A12345678%2C%22first_name%22%3A%22Local%22%2C%22last_name%22%3A%22Dev%22%2C%22username%22%3A%22local_dev%22%2C%22language_code%22%3A%22en%22%7D&hash=debug_mode'
}

const tg = window.Telegram.WebApp
tg.ready()
tg.expand()

// ── State ────────────────────────────────────────────────────────────────────
let userState = null        // { is_unlocked, subscription_count, ... }
let subscriptions = []      // SubscriptionWithRank[]
let popularBoards = []      // Board[]
let editingBoard = null     // board name string
let searchTimer = null
let editingKeywords = []         // string[] for the board currently open in edit modal

// ── API ──────────────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const url = API_BASE + path
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'tma ' + tg.initData,
        ...options.headers,
      },
    })
    const data = await res.json()
    if (!res.ok) throw Object.assign(new Error(data.error || 'API error'), { status: res.status, data })
    return data
  } catch (err) {
    console.error(`[API Error] Fetch to ${url} failed:`, err)
    throw err
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, duration = 2500) {
  const el = document.createElement('div')
  el.className = 'toast'
  el.textContent = msg
  document.body.appendChild(el)
  setTimeout(() => el.remove(), duration)
}

// ── Modal helpers ─────────────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.remove('hidden')
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden')
}

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close))
})

// Close on backdrop click
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', e => {
    if (e.target === modal) closeModal(modal.id)
  })
})

// ── Render ─────────────────────────────────────────────────────────────────────
function renderSubscriptions() {
  const list = document.getElementById('subscription-list')
  const bar  = document.getElementById('bottom-bar')

  if (subscriptions.length === 0) {
    bar.classList.add('hidden')
    list.innerHTML = `
      <div class="onboarding">
        <div class="onboarding-icon">🐧</div>
        <div class="onboarding-title">開始訂閱 PTT 看板</div>
        <div class="onboarding-desc">訂閱後，有新文章時會立即透過 Telegram 通知你</div>
        <button class="onboarding-cta" id="onboarding-add">＋ 新增第一個看板</button>
      </div>`
    document.getElementById('onboarding-add').addEventListener('click', openAddModal)
    return
  }

  bar.classList.remove('hidden')

  list.innerHTML = `
    <div class="sub-list">
      ${subscriptions.map(s => `
        <div class="sub-card" data-board="${esc(s.board)}">
          <div class="sub-card-left">
            <span class="sub-card-name">${esc(s.board)}</span>
          </div>
          <span class="sub-card-chevron">›</span>
        </div>`).join('')}
    </div>`

  list.querySelectorAll('.sub-card').forEach(card => {
    card.addEventListener('click', () => openEditModal(card.dataset.board))
  })
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  )
}

// ── Load data ─────────────────────────────────────────────────────────────────
async function loadUser() {
  try {
    userState = await apiFetch('/api/user')
  } catch {
    userState = null
  }
}

async function loadSubscriptions() {
  document.getElementById('subscription-list').innerHTML = '<div class="spinner"></div>'
  try {
    subscriptions = await apiFetch('/api/subscriptions')
  } catch {
    subscriptions = []
  }
  renderSubscriptions()
}

async function loadPopularBoards() {
  try {
    popularBoards = await apiFetch('/api/boards/popular')
    renderBoardGrid(document.getElementById('popular-boards'), popularBoards)
  } catch {
    popularBoards = []
  }
}

// ── Add board modal ───────────────────────────────────────────────────────────
function renderBoardGrid(container, boards) {
  const subNames = new Set(subscriptions.map(s => s.board.toLowerCase()))
  const filtered = boards.filter(b => !subNames.has(b.name.toLowerCase()))

  if (filtered.length === 0 && boards.length > 0) {
    container.innerHTML = '<p style="color:var(--hint);font-size:14px;padding:8px 0">所有相關看板皆已訂閱</p>'
    return
  }

  container.innerHTML = filtered.map(b => `
    <button class="board-chip" data-board="${esc(b.name)}">
      <span class="board-chip-name">${esc(b.name)}</span>
      ${b.display_name ? `<span class="board-chip-display">${esc(b.display_name)}</span>` : ''}
    </button>`).join('')

  container.querySelectorAll('.board-chip').forEach(chip => {
    chip.addEventListener('click', () => handleAddBoard(chip.dataset.board))
  })
}

async function openAddModal() {
  document.getElementById('board-search').value = ''
  document.getElementById('search-results').classList.add('hidden')
  openModal('modal-add')
  if (popularBoards.length === 0) await loadPopularBoards()
}

document.getElementById('add-btn').addEventListener('click', openAddModal)

// Combobox search
document.getElementById('board-search').addEventListener('input', e => {
  clearTimeout(searchTimer)
  const q = e.target.value.trim()
  const resultsEl = document.getElementById('search-results')
  const popularLabel = document.querySelector('#modal-add .section-label')
  const popularEl = document.getElementById('popular-boards')

  if (!q) {
    resultsEl.classList.add('hidden')
    popularLabel.style.display = ''
    popularEl.style.display = ''
    return
  }

  popularLabel.style.display = 'none'
  popularEl.style.display = 'none'
  resultsEl.classList.remove('hidden')
  resultsEl.innerHTML = '<div class="spinner"></div>'

  searchTimer = setTimeout(async () => {
    try {
      const boards = await apiFetch(`/api/boards/search?q=${encodeURIComponent(q)}`)
      if (boards.length === 0) {
        resultsEl.innerHTML = `<p style="color:var(--hint);font-size:14px;padding:8px 0">找不到看板「${esc(q)}」</p>`
      } else {
        renderBoardGrid(resultsEl, boards)
      }
    } catch {
      resultsEl.innerHTML = '<p style="color:var(--hint);font-size:14px">搜尋失敗，請稍後再試</p>'
    }
  }, 350)
})

// ── Ad modal logic ──────────────────────────────────────────────────────────
// context: { type: 'add-board', board: string } | { type: 'unlock' }

async function showRealAd(shouldResetTimer = true, context = { type: 'unlock' }) {
  const confirmed = await showMockAd(true, shouldResetTimer, context) // 預備模式
  if (!confirmed) return false

  // 使用者點選確定後，先關閉確認視窗
  document.getElementById('modal-ad-mock').classList.add('hidden')

  return new Promise((resolve) => {
    if (typeof show_10832818 === 'function') {
      show_10832818().then(async () => {
        try {
          const adResult = await apiFetch(`/api/ad/complete?reset=${shouldResetTimer}`, { method: 'POST' })
          if (shouldResetTimer) {
            // 首次從 locked → unlocked，更新本機解鎖狀態與到期時間
            userState = { ...userState, is_unlocked: true, ad_unlocked_at: adResult.ad_unlocked_at }
          }
          // shouldResetTimer=false：已在 24h 解鎖期內追加看板，本機 userState 不動
          resolve(true)
        } catch {
          showToast('解鎖失敗，請稍後再試')
          resolve(false)
        }
      })
    } else {
      console.warn('Monetag not ready, starting countdown fallback')
      showMockAd(false, shouldResetTimer, context).then(resolve)
    }
  })
}

function showMockAd(isPreCheck = false, shouldResetTimer = true, context = { type: 'unlock' }) {
  return new Promise((resolve) => {
    const modal    = document.getElementById('modal-ad-mock')
    const timer    = document.getElementById('ad-countdown')
    const closeBtn = document.getElementById('ad-close-btn')
    const cancelBtn = document.getElementById('ad-cancel-btn')
    const label    = modal.querySelector('.ad-label')
    const adIcon   = modal.querySelector('.ad-icon')
    const adTitle  = modal.querySelector('.ad-title')
    const adDesc   = modal.querySelector('.ad-body p')

    // 依情境設定彈窗內容
    const isAddBoard    = context.type === 'add-board'
    const isAddKeyword  = context.type === 'add-keyword'
    const steps = '<div style="display:inline-block;text-align:left">① 等倒數結束 → 點 ✕ 關閉<br>② 或點擊廣告 → 立即完成，返回 Bot 即可</div>'
    if (isAddBoard) {
      adIcon.textContent  = '📋'
      adTitle.textContent = `新增 ${context.board}`
      adDesc.innerHTML    = `超過免費上限的看板需觀看廣告才能訂閱<br><br>${steps}`
    } else if (isAddKeyword) {
      adIcon.textContent  = '🔑'
      adTitle.textContent = '新增更多關鍵字'
      adDesc.innerHTML    = `免費版每個看板限 ${FREE_KEYWORDS_PER_BOARD} 個關鍵字<br>觀看廣告即可在 24 小時內新增更多（最多 ${MAX_KEYWORDS_PER_BOARD} 個）<br><br>${steps}`
    } else {
      const freeBoards = subscriptions
        .filter(s => s.board_rank <= FREE_BOARDS_LIMIT)
        .sort((a, b) => a.board_rank - b.board_rank)
        .map(s => s.board)
      const paidBoards = subscriptions
        .filter(s => s.board_rank > FREE_BOARDS_LIMIT)
        .sort((a, b) => a.board_rank - b.board_rank)
        .map(s => s.board)
      const paidStr = paidBoards.length <= 2
        ? paidBoards.join('、')
        : paidBoards.slice(0, 2).join('、') + ` 及 ${paidBoards.length - 2} 個看板`
      const freeStr = freeBoards.slice(0, 2).join('、')
      adIcon.textContent  = '🔔'
      adTitle.textContent = '完整通知功能已暫停'
      adDesc.innerHTML    = `${esc(paidStr)} 完整通知已暫停<br>${esc(freeStr)} 不受影響<br><br>觀看一則廣告即可解鎖完整通知功能 24 小時<br><br>${steps}`
    }

    modal.classList.remove('hidden')

    if (isPreCheck) {
      timer.classList.add('hidden')
      closeBtn.classList.remove('hidden')
      closeBtn.disabled = false
      closeBtn.textContent = isAddBoard || isAddKeyword ? '觀看廣告並新增' : '觀看廣告並解鎖'
      label.textContent    = ''

      closeBtn.onclick = () => {
        closeBtn.classList.add('hidden')
        resolve(true)
      }
      cancelBtn.onclick = () => {
        modal.classList.add('hidden')
        resolve(false)
      }
      return
    }

    label.textContent = '贊助商廣告'
    let count = 5
    timer.classList.remove('hidden')
    timer.textContent = count
    closeBtn.classList.add('hidden')
    closeBtn.disabled = false
    closeBtn.textContent = '關閉廣告並完成'

    const interval = setInterval(() => {
      count--
      timer.textContent = count
      if (count <= 0) {
        clearInterval(interval)
        timer.classList.add('hidden')
        closeBtn.classList.remove('hidden')
      }
    }, 1000)

    closeBtn.onclick = async () => {
      closeBtn.disabled = true
      closeBtn.textContent = '處理中…'
      cancelBtn.disabled = true
      try {
        const adResult = await apiFetch(`/api/ad/complete?reset=${shouldResetTimer}`, { method: 'POST' })
        if (shouldResetTimer) {
          // 首次從 locked → unlocked，更新本機解鎖狀態與到期時間
          userState = { ...userState, is_unlocked: true, ad_unlocked_at: adResult.ad_unlocked_at }
        }
        // shouldResetTimer=false：已在 24h 解鎖期內追加看板，本機 userState 不動
        modal.classList.add('hidden')
        resolve(true)
      } catch {
        showToast('解鎖失敗，請稍後再試')
        closeBtn.disabled = false
        closeBtn.textContent = '關閉廣告並完成'
        cancelBtn.disabled = false
        modal.classList.add('hidden')
        resolve(false)
      }
    }

    cancelBtn.onclick = () => {
      clearInterval(interval)
      modal.classList.add('hidden')
      resolve(false)
    }
  })
}

async function handleAddBoard(board) {
  const count = userState?.subscription_count ?? subscriptions.length

  // 超過免費額度（例如 >= 2）則跳廣告
  if (count >= FREE_BOARDS_LIMIT) {
    // 未解鎖時才需重置 24h 計時器；已解鎖期間追加看板不重置到期時間
    const shouldResetTimer = !userState?.is_unlocked
    const success = await showRealAd(shouldResetTimer, { type: 'add-board', board })
    if (!success) return
  }

  try {
    await apiFetch('/api/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ board }),
    })
    closeModal('modal-add')
    showToast(`✅ 已訂閱 ${board}`)
    await Promise.all([loadUser(), loadSubscriptions()])
  } catch (err) {
    if (err.status === 402) {
      showToast('請先解鎖進階功能')
    } else if (err.status === 404) {
      showToast(`找不到看板「${board}」`)
    } else {
      showToast('新增失敗，請稍後再試')
    }
  }
}

// ── Edit board modal ──────────────────────────────────────────────────────────
function openEditModal(board) {
  editingBoard = board
  editingKeywords = []
  document.getElementById('edit-board-name').textContent = board
  document.getElementById('keyword-input').value = ''
  renderKeywords()
  openModal('modal-edit')
  loadKeywords(board)
}

async function loadKeywords(board) {
  try {
    const data = await apiFetch(`/api/subscriptions/${encodeURIComponent(board)}/keywords`)
    editingKeywords = data.keywords || []
  } catch {
    editingKeywords = []
  }
  renderKeywords()
}

function renderKeywords() {
  const tagsEl    = document.getElementById('keyword-tags')
  const addRow    = document.getElementById('keyword-add-row')
  const limitInfo = document.getElementById('keyword-limit-info')
  if (!tagsEl) return

  const count = editingKeywords.length

  // Render keyword tags
  tagsEl.innerHTML = editingKeywords.map((kw, i) => `
    <span class="keyword-tag">
      ${esc(kw)}<button class="keyword-tag-remove" data-index="${i}" aria-label="刪除">×</button>
    </span>`).join('')

  tagsEl.querySelectorAll('.keyword-tag-remove').forEach(btn => {
    btn.addEventListener('click', () => removeKeyword(parseInt(btn.dataset.index)))
  })

  // Show add row / limit info
  if (count >= MAX_KEYWORDS_PER_BOARD) {
    addRow.classList.add('hidden')
    limitInfo.textContent = `已達上限（${MAX_KEYWORDS_PER_BOARD} 個）`
  } else {
    addRow.classList.remove('hidden')
    limitInfo.textContent = count >= FREE_KEYWORDS_PER_BOARD
      ? `${count} / ${MAX_KEYWORDS_PER_BOARD} 個關鍵字（新增需觀看廣告）`
      : ''
  }
}

async function addKeyword() {
  const input = document.getElementById('keyword-input')
  const kw = input.value.trim()
  if (!kw) return
  if (editingKeywords.includes(kw)) { showToast('關鍵字已存在'); return }

  // 超出免費數量時，每個關鍵字都需觀看一則廣告（與 is_unlocked 無關）
  if (editingKeywords.length >= FREE_KEYWORDS_PER_BOARD) {
    const success = await showRealAd(false, { type: 'add-keyword' })
    if (!success) return
  }

  const newKeywords = [...editingKeywords, kw]
  try {
    const data = await apiFetch(`/api/subscriptions/${encodeURIComponent(editingBoard)}/keywords`, {
      method: 'PUT',
      body: JSON.stringify({ keywords: newKeywords }),
    })
    editingKeywords = data.keywords
    input.value = ''
    renderKeywords()
  } catch (err) {
    if (err.status === 402) showToast('請先解鎖進階功能')
    else showToast('新增失敗，請稍後再試')
  }
}

async function removeKeyword(index) {
  const newKeywords = editingKeywords.filter((_, i) => i !== index)
  try {
    const data = await apiFetch(`/api/subscriptions/${encodeURIComponent(editingBoard)}/keywords`, {
      method: 'PUT',
      body: JSON.stringify({ keywords: newKeywords }),
    })
    editingKeywords = data.keywords
    renderKeywords()
  } catch {
    showToast('刪除失敗，請稍後再試')
  }
}

document.getElementById('keyword-add-btn').addEventListener('click', addKeyword)
document.getElementById('keyword-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); addKeyword() }
})

document.getElementById('delete-btn').addEventListener('click', () => {
  if (!editingBoard) return
  document.getElementById('confirm-text').textContent =
    `確定要取消訂閱「${editingBoard}」嗎？`
  closeModal('modal-edit')
  openModal('modal-confirm')
})

document.getElementById('confirm-cancel').addEventListener('click', () => {
  closeModal('modal-confirm')
})

document.getElementById('confirm-ok').addEventListener('click', async () => {
  if (!editingBoard) return
  try {
    await apiFetch(`/api/subscriptions/${encodeURIComponent(editingBoard)}`, { method: 'DELETE' })
    closeModal('modal-confirm')
    showToast(`已取消訂閱 ${editingBoard}`)
    editingBoard = null
    await Promise.all([loadUser(), loadSubscriptions()])
  } catch {
    showToast('刪除失敗，請稍後再試')
  }
})

// ── Feedback ──────────────────────────────────────────────────────────────────
document.getElementById('feedback-btn').addEventListener('click', () => {
  tg.showPopup({
    title: '意見回饋',
    message: '關閉後請在對話框輸入 /feedback 加上你的建議',
    buttons: [{ type: 'close', text: '知道了' }],
  }, () => tg.close())
})

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  await Promise.all([loadUser(), loadSubscriptions()])

  // 檢查是否有自動指令 (例如從 Telegram 到期通知點擊而來)
  const params = new URLSearchParams(window.location.search)
  if (params.get('action') === 'unlock') {
    // 延遲一下下確保 UI 載入完成
    setTimeout(async () => {
      const success = await showRealAd(true, { type: 'unlock' })
      if (success) {
        // 解鎖成功後清空網址參數，避免 reload 時重複觸發
        window.history.replaceState({}, document.title, window.location.pathname)
        renderSubscriptions()
      }
    }, 500)
  }
}

boot()
