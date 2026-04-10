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

// Returns true only when the ad gate for this feature is explicitly enabled by the server.
// Defaults to false (ad disabled) when userState or ad_flags is not yet loaded.
function isAdEnabled(feature) {
  return userState?.ad_flags?.[feature] === true
}

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

// ── Unlock status bar ──────────────────────────────────────────────────────────
function renderUnlockStatus() {
  const bar       = document.getElementById('unlock-bar')
  const label     = document.getElementById('unlock-label')
  const actionBtn = document.getElementById('unlock-action-btn')
  const hintBtn   = document.getElementById('unlock-hint-btn')
  const tooltip   = document.getElementById('unlock-hint-tooltip')

  const needsUnlock = userState && userState.subscription_count > FREE_BOARDS_LIMIT
  if (!needsUnlock || !isAdEnabled('unlock')) {
    bar.classList.add('hidden')
    document.documentElement.style.setProperty('--unlock-bar-height', '0px')
    return
  }

  bar.classList.remove('hidden')
  document.documentElement.style.setProperty('--unlock-bar-height', '36px')

  tooltip.textContent = `前 ${FREE_BOARDS_LIMIT} 個看板免費完整通知，其他看板需解鎖才能收到完整通知`
  hintBtn.classList.remove('hidden')
  hintBtn.onclick = (e) => {
    e.stopPropagation()
    tooltip.classList.toggle('hidden')
  }

  if (!userState.is_unlocked) {
    label.textContent = `🔒 完整通知已暫停`
    actionBtn.textContent = '解鎖'
    actionBtn.classList.remove('hidden')
    actionBtn.onclick = async () => {
      const success = await showRealAd({ type: 'unlock' })
      if (success) renderUnlockStatus()
    }
  } else if (userState.can_extend) {
    const remaining = userState.unlock_expires_at - Math.floor(Date.now() / 1000)
    const hours = Math.ceil(remaining / 3600)
    label.textContent = `🔓 完整通知剩 ${hours}h`
    actionBtn.textContent = '延長 24h'
    actionBtn.classList.remove('hidden')
    actionBtn.onclick = async () => {
      const success = await showRealAd({ type: 'unlock' })
      if (success) renderUnlockStatus()
    }
  } else {
    const remaining = userState.unlock_expires_at - Math.floor(Date.now() / 1000)
    const hours = Math.ceil(remaining / 3600)
    label.textContent = `🔓 完整通知剩 ${hours}h`
    actionBtn.classList.add('hidden')
  }
}

document.addEventListener('click', () => {
  document.getElementById('unlock-hint-tooltip')?.classList.add('hidden')
})

// ── Render ─────────────────────────────────────────────────────────────────────
function renderSubscriptions() {
  const list = document.getElementById('subscription-list')
  const bar  = document.getElementById('bottom-bar')

  if (subscriptions.length === 0) {
    bar.classList.add('hidden')
    list.innerHTML = `
      <div class="onboarding">
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
  document.getElementById('modal-add-loading').classList.add('hidden')
  document.getElementById('modal-add-ui').classList.remove('hidden')

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
// context: { type: 'add-board', board: string } | { type: 'add-keyword' } | { type: 'unlock' }

async function callAdComplete() {
  try {
    const adResult = await apiFetch('/api/ad/complete', { method: 'POST' })
    userState = { ...userState, is_unlocked: true, unlock_expires_at: adResult.unlock_expires_at, can_extend: false }
    return true
  } catch (err) {
    if (err?.status === 409) showToast('本次解鎖期間已延長過一次')
    else showToast('解鎖失敗，請稍後再試')
    return false
  }
}

async function showRealAd(context = { type: 'unlock' }) {
  const confirmed = await showMockAd(true, context)
  if (!confirmed) return false

  document.getElementById('modal-ad-mock').classList.add('hidden')

  const needsApiCall = context.type === 'unlock' || (context.type === 'add-board' && !userState?.is_unlocked)

  return new Promise((resolve) => {
    if (typeof show_10832818 === 'function') {
      show_10832818().then(async () => {
        resolve(needsApiCall ? await callAdComplete() : true)
      })
    } else {
      console.warn('Monetag not ready, starting countdown fallback')
      showMockAd(false, context).then(async (ok) => {
        resolve(ok && needsApiCall ? await callAdComplete() : ok)
      })
    }
  })
}

function showMockAd(isPreCheck = false, context = { type: 'unlock' }) {
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
    const isAddBoard   = context.type === 'add-board'
    const isAddKeyword = context.type === 'add-keyword'
    const adHeader = modal.querySelector('.ad-header')
    const steps = '① 等倒數結束 → 點 ✕ 關閉<br>② 或點擊廣告 → 立即完成'

    if (isAddBoard) {
      adIcon.textContent  = '📋'
      adTitle.textContent = `新增 ${context.board}`
      adDesc.innerHTML    = isPreCheck ? `第 ${FREE_BOARDS_LIMIT + 1} 個以上的看板需觀看廣告` : steps
    } else if (isAddKeyword) {
      adIcon.textContent  = '🔑'
      adTitle.textContent = '新增關鍵字'
      adDesc.innerHTML    = isPreCheck ? `每板免費 ${FREE_KEYWORDS_PER_BOARD} 個關鍵字，超出需觀看廣告` : steps
    } else {
      adIcon.textContent  = '🔔'
      adTitle.textContent = '解鎖完整通知'
      adDesc.innerHTML    = isPreCheck ? `觀看廣告解鎖 24 小時完整通知` : steps
    }

    modal.classList.remove('hidden')

    if (isPreCheck) {
      adHeader.classList.add('hidden')
      timer.classList.add('hidden')
      closeBtn.classList.remove('hidden')
      closeBtn.disabled = false
      closeBtn.textContent = isAddBoard || isAddKeyword ? '觀看廣告並新增' : '觀看廣告並解鎖'

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

    adHeader.classList.remove('hidden')
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

    closeBtn.onclick = () => {
      modal.classList.add('hidden')
      resolve(true)
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

  // 超過免費額度且 add_board 廣告功能啟用時才跳廣告
  if (isAdEnabled('add_board') && count >= FREE_BOARDS_LIMIT) {
    const success = await showRealAd({ type: 'add-board', board })
    if (!success) return
  }

  // 廣告結束後進入 API 階段，進入載入狀態
  document.getElementById('modal-add-loading').classList.remove('hidden')
  document.getElementById('modal-add-ui').classList.add('hidden')

  try {
    await apiFetch('/api/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ board }),
    })
    closeModal('modal-add')
    showToast(`✅ 已訂閱 ${board}`)
    await Promise.all([loadUser(), loadSubscriptions()])
  } catch (err) {
    closeModal('modal-add')
    if (err.status === 402) showToast('請先解鎖進階功能')
    else if (err.status === 404) showToast(`找不到看板「${board}」`)
    else showToast('新增失敗，請稍後再試')
  }
}

// ── Edit board modal ──────────────────────────────────────────────────────────
function openEditModal(board) {
  editingBoard = board
  editingKeywords = []
  document.getElementById('edit-board-name').textContent = board
  document.getElementById('keyword-input').value = ''
  document.getElementById('keyword-add-btn').disabled = true
  renderKeywords()
  openModal('modal-edit')
  loadKeywords(board)
}

async function loadKeywords(board) {
  document.getElementById('keyword-tags').innerHTML = '<div class="spinner spinner--sm"></div>'
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
    limitInfo.textContent = (count >= FREE_KEYWORDS_PER_BOARD && isAdEnabled('add_keyword'))
      ? `${count} / ${MAX_KEYWORDS_PER_BOARD} 個關鍵字（新增需觀看廣告）`
      : ''
  }
}

async function addKeyword() {
  const input = document.getElementById('keyword-input')
  const kw = input.value.trim()
  if (!kw) return
  if (editingKeywords.includes(kw)) { showToast('關鍵字已存在'); return }

  // 超出免費數量且 add_keyword 廣告功能啟用時才跳廣告
  if (isAdEnabled('add_keyword') && editingKeywords.length >= FREE_KEYWORDS_PER_BOARD) {
    const success = await showRealAd({ type: 'add-keyword' })
    if (!success) return
  }

  const addBtn    = document.getElementById('keyword-add-btn')
  addBtn.disabled = true
  input.disabled  = true

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
  } finally {
    addBtn.disabled = false
    input.disabled  = false
  }
}

async function removeKeyword(index) {
  const previous = [...editingKeywords]
  editingKeywords = editingKeywords.filter((_, i) => i !== index)
  renderKeywords()  // 樂觀更新：立即移除 tag
  try {
    const data = await apiFetch(`/api/subscriptions/${encodeURIComponent(editingBoard)}/keywords`, {
      method: 'PUT',
      body: JSON.stringify({ keywords: editingKeywords }),
    })
    editingKeywords = data.keywords
    renderKeywords()
  } catch {
    editingKeywords = previous  // 復原
    renderKeywords()
    showToast('刪除失敗，請稍後再試')
  }
}

document.getElementById('keyword-add-btn').addEventListener('click', addKeyword)
document.getElementById('keyword-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); addKeyword() }
})
document.getElementById('keyword-input').addEventListener('input', e => {
  document.getElementById('keyword-add-btn').disabled = !e.target.value.trim()
})

document.getElementById('delete-btn').addEventListener('click', () => {
  if (!editingBoard) return
  document.getElementById('confirm-text').textContent =
    `確定要取消訂閱「${editingBoard}」嗎？`

  // 重置按鈕狀態，避免前一次刪除殘留位元
  const okBtn     = document.getElementById('confirm-ok')
  const cancelBtn = document.getElementById('confirm-cancel')
  okBtn.disabled     = false
  okBtn.textContent  = '刪除'
  cancelBtn.disabled = false

  closeModal('modal-edit')
  openModal('modal-confirm')
})

document.getElementById('confirm-cancel').addEventListener('click', () => {
  closeModal('modal-confirm')
})

document.getElementById('confirm-ok').addEventListener('click', async () => {
  if (!editingBoard) return
  const okBtn     = document.getElementById('confirm-ok')
  const cancelBtn = document.getElementById('confirm-cancel')
  okBtn.disabled     = true
  okBtn.textContent  = '刪除中…'
  cancelBtn.disabled = true
  try {
    await apiFetch(`/api/subscriptions/${encodeURIComponent(editingBoard)}`, { method: 'DELETE' })
    closeModal('modal-confirm')
    showToast(`已取消訂閱 ${editingBoard}`)
    editingBoard = null
    await Promise.all([loadUser(), loadSubscriptions()])
    renderUnlockStatus()
  } catch {
    showToast('刪除失敗，請稍後再試')
  } finally {
    okBtn.disabled     = false
    okBtn.textContent  = '刪除'
    cancelBtn.disabled = false
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
  renderUnlockStatus()

  // 檢查是否有自動指令 (例如從 Telegram 到期通知點擊而來)
  const params = new URLSearchParams(window.location.search)
  if (params.get('action') === 'unlock' && isAdEnabled('unlock')) {
    setTimeout(async () => {
      const success = await showRealAd({ type: 'unlock' })
      if (success) {
        window.history.replaceState({}, document.title, window.location.pathname)
        renderUnlockStatus()
      }
    }, 500)
  }
}

boot()
