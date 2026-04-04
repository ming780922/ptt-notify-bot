/* globals Telegram */
'use strict'

const API_BASE = 'https://ptt-notify-bot-api.ming780922.workers.dev'
const FREE_BOARDS_LIMIT = 2

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
  const adBtn = document.getElementById('ad-btn')

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

  // Ad button label
  if (userState?.is_unlocked) {
    adBtn.textContent = '🔓 進階解鎖中'
    adBtn.classList.add('unlocked')
    adBtn.onclick = null
  } else {
    adBtn.textContent = '🔒 解鎖進階功能'
    adBtn.classList.remove('unlocked')
    adBtn.onclick = handleAdClick
  }

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
function showMockAd() {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-ad-mock')
    const timer = document.getElementById('ad-countdown')
    const closeBtn = document.getElementById('ad-close-btn')
    
    let count = 5
    timer.textContent = count
    closeBtn.classList.add('hidden')
    modal.classList.remove('hidden')
    
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
      try {
        const adResult = await apiFetch('/api/ad/complete', { method: 'POST' })
        userState = { ...userState, is_unlocked: true, ad_unlocked_at: adResult.ad_unlocked_at }
        modal.classList.add('hidden')
        timer.classList.remove('hidden') // Reset for next time
        resolve(true)
      } catch {
        showToast('解鎖失敗，請稍後再試')
        modal.classList.add('hidden')
        resolve(false)
      }
    }
  })
}

async function handleAddBoard(board) {
  const willExceedLimit =
    (userState?.subscription_count ?? subscriptions.length) >= FREE_BOARDS_LIMIT

  if (willExceedLimit && !userState?.is_unlocked) {
    const success = await showMockAd()
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
}

boot()
��────────
async function boot() {
  await Promise.all([loadUser(), loadSubscriptions()])
}

boot()
