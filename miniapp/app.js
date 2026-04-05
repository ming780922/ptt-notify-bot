/* globals Telegram */
'use strict'

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'https://ptt-notify-bot-api.ming780922.workers.dev' // 你也可以改成 http://localhost:8787 連向本地 API
  : 'https://ptt-notify-bot-api.ming780922.workers.dev'
const FREE_BOARDS_LIMIT = 2

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
async function showRealAd(shouldResetTimer = true) {
  const confirmed = await showMockAd(true) // 預備模式
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
      showMockAd(false, shouldResetTimer).then(resolve)
    }
  })
}

function showMockAd(isPreCheck = false, shouldResetTimer = true) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-ad-mock')
    const timer = document.getElementById('ad-countdown')
    const closeBtn = document.getElementById('ad-close-btn')
    const cancelBtn = document.getElementById('ad-cancel-btn')
    const label = modal.querySelector('.ad-label')
    
    modal.classList.remove('hidden')

    if (isPreCheck) {
      timer.classList.add('hidden')
      closeBtn.classList.remove('hidden')
      closeBtn.textContent = '確定，觀看廣告並解鎖'
      label.textContent = '進階功能確認'
      
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
    const success = await showRealAd(shouldResetTimer)
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
  document.getElementById('edit-board-name').textContent = board
  openModal('modal-edit')
}

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

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  await Promise.all([loadUser(), loadSubscriptions()])

  // 檢查是否有自動指令 (例如從 Telegram 到期通知點擊而來)
  const params = new URLSearchParams(window.location.search)
  if (params.get('action') === 'unlock') {
    // 延遲一下下確保 UI 載入完成
    setTimeout(async () => {
      const success = await showRealAd(true)
      if (success) {
        // 解鎖成功後清空網址參數，避免 reload 時重複觸發
        window.history.replaceState({}, document.title, window.location.pathname)
        renderSubscriptions()
      }
    }, 500)
  }
}

boot()
