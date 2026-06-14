// Smart Fridge & Grocery Manager

const CATEGORIES = {
  '蔬菜': { icon: '🥦', expiry: 5 },
  '水果': { icon: '🍎', expiry: 5 },
  '肉类': { icon: '🥩', expiry: 4 },
  '乳制品': { icon: '🥛', expiry: 7 },
  '调料': { icon: '🧂', expiry: 90 },
  '主食': { icon: '🍚', expiry: 180 },
  '其他': { icon: '📦', expiry: 14 },
};

const STORAGE_KEY = 'fridge_items_v1';
const API_KEY_STORAGE = 'anthropic_api_key';

const state = {
  items: [],
  filter: 'all',
  viewMode: 'grid',
  editingId: null,
  scanImage: null,
  scanImageType: null,
  extractedItems: [],
};

// ── Storage ──────────────────────────────────────
function loadItems() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
}

// ── Date Utils ───────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function getFreshness(expiryDate) {
  if (!expiryDate) return { status: 'fresh', label: '未设置', daysLeft: 999 };
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDate + 'T00:00:00');
  const daysLeft = Math.round((exp - now) / 86400000);
  if (daysLeft < 0) return { status: 'expired', label: `过期${Math.abs(daysLeft)}天`, daysLeft };
  if (daysLeft === 0) return { status: 'expired', label: '今天过期', daysLeft };
  if (daysLeft <= 3) return { status: 'soon', label: `还剩${daysLeft}天`, daysLeft };
  return { status: 'fresh', label: `还剩${daysLeft}天`, daysLeft };
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── Item CRUD ─────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function buildItem(data) {
  const category = data.category || '其他';
  const purchaseDate = data.purchaseDate || todayStr();
  return {
    id: data.id || uid(),
    name: (data.name || '未命名').trim(),
    category,
    quantity: (data.quantity || '').trim(),
    purchaseDate,
    expiryDate: data.expiryDate || addDays(purchaseDate, CATEGORIES[category]?.expiry ?? 14),
    price: Math.max(0, parseFloat(data.price) || 0),
    createdAt: data.createdAt || Date.now(),
  };
}

function addItem(data) {
  const item = buildItem(data);
  state.items.unshift(item);
  saveItems();
  return item;
}

function updateItem(id, data) {
  const idx = state.items.findIndex(i => i.id === id);
  if (idx < 0) return;
  state.items[idx] = buildItem({ ...state.items[idx], ...data });
  saveItems();
}

function deleteItem(id) {
  state.items = state.items.filter(i => i.id !== id);
  saveItems();
}

// ── Rendering ─────────────────────────────────────
function getFiltered() {
  return state.items.filter(item => {
    if (state.filter === 'all') return true;
    return getFreshness(item.expiryDate).status === state.filter;
  });
}

function catIcon(category) {
  return (CATEGORIES[category] || CATEGORIES['其他']).icon;
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderCard(item) {
  const f = getFreshness(item.expiryDate);
  const meta = [item.quantity, item.price > 0 ? `¥${item.price.toFixed(2)}` : ''].filter(Boolean).join(' · ');
  return `<div class="item-card ${f.status}" data-id="${item.id}">
    <span class="card-icon">${catIcon(item.category)}</span>
    <div class="card-name">${escHtml(item.name)}</div>
    <div class="card-meta">${escHtml(meta) || '&nbsp;'}</div>
    <span class="freshness-pill ${f.status}">${f.label}</span>
  </div>`;
}

function renderRow(item) {
  const f = getFreshness(item.expiryDate);
  const meta = [item.quantity, item.price > 0 ? `¥${item.price.toFixed(2)}` : '', item.category].filter(Boolean).join(' · ');
  return `<div class="item-row ${f.status}" data-id="${item.id}">
    <span class="row-icon">${catIcon(item.category)}</span>
    <div class="row-info">
      <div class="row-name">${escHtml(item.name)}</div>
      <div class="row-meta">${escHtml(meta)}</div>
    </div>
    <div class="row-end"><span class="freshness-pill ${f.status}">${f.label}</span></div>
  </div>`;
}

function renderInventory() {
  const container = document.getElementById('item-container');
  const empty = document.getElementById('empty-state');
  const items = getFiltered();

  container.className = state.viewMode === 'grid' ? 'item-grid' : 'item-list';

  if (items.length === 0) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
    container.innerHTML = items.map(state.viewMode === 'grid' ? renderCard : renderRow).join('');
  }

  updateBadges();
}

function updateBadges() {
  const counts = { all: 0, fresh: 0, soon: 0, expired: 0 };
  state.items.forEach(item => {
    counts.all++;
    const s = getFreshness(item.expiryDate).status;
    counts[s] = (counts[s] || 0) + 1;
  });
  document.getElementById('badge-all').textContent = counts.all;
  document.getElementById('badge-fresh').textContent = counts.fresh || 0;
  document.getElementById('badge-soon').textContent = counts.soon || 0;
  document.getElementById('badge-expired').textContent = counts.expired || 0;
}

// ── Sheet Management ──────────────────────────────
function openSheet(id) {
  document.getElementById('modal-backdrop').classList.remove('hidden');
  const sheet = document.getElementById(id);
  sheet.classList.remove('hidden');
  requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('open')));
  document.body.style.overflow = 'hidden';
}

function closeSheet(id) {
  const sheet = document.getElementById(id);
  sheet.classList.remove('open');
  setTimeout(() => {
    sheet.classList.add('hidden');
    const anyOpen = ['sheet-item','sheet-scan','sheet-settings'].some(
      s => !document.getElementById(s).classList.contains('hidden')
    );
    if (!anyOpen) {
      document.getElementById('modal-backdrop').classList.add('hidden');
      document.body.style.overflow = '';
    }
  }, 330);
}

// ── Item Form ─────────────────────────────────────
function openAddForm() {
  state.editingId = null;
  document.getElementById('sheet-item-title').textContent = '添加食材';
  document.getElementById('btn-delete-item').classList.add('hidden');

  const form = document.getElementById('form-item');
  form.reset();
  document.getElementById('input-id').value = '';
  document.getElementById('input-purchase-date').value = todayStr();
  document.getElementById('input-expiry-date').value = addDays(todayStr(), CATEGORIES['蔬菜'].expiry);
  document.getElementById('input-category').value = '蔬菜';

  openSheet('sheet-item');
  setTimeout(() => document.getElementById('input-name').focus(), 380);
}

function openEditForm(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  state.editingId = id;
  document.getElementById('sheet-item-title').textContent = '编辑食材';
  document.getElementById('btn-delete-item').classList.remove('hidden');

  document.getElementById('input-id').value = item.id;
  document.getElementById('input-name').value = item.name;
  document.getElementById('input-category').value = item.category;
  document.getElementById('input-quantity').value = item.quantity;
  document.getElementById('input-purchase-date').value = item.purchaseDate || todayStr();
  document.getElementById('input-expiry-date').value = item.expiryDate || '';
  document.getElementById('input-price').value = item.price > 0 ? item.price : '';

  openSheet('sheet-item');
}

function handleFormSubmit(e) {
  e.preventDefault();
  const data = {
    name: document.getElementById('input-name').value,
    category: document.getElementById('input-category').value,
    quantity: document.getElementById('input-quantity').value,
    purchaseDate: document.getElementById('input-purchase-date').value,
    expiryDate: document.getElementById('input-expiry-date').value,
    price: document.getElementById('input-price').value,
  };
  if (!data.name.trim()) return;

  if (state.editingId) {
    updateItem(state.editingId, data);
    showToast('已更新 ✅');
  } else {
    addItem(data);
    showToast('已添加 ✅');
  }
  closeSheet('sheet-item');
  renderInventory();
}

function handleDeleteItem() {
  if (!state.editingId) return;
  if (!confirm('确定删除这个食材？')) return;
  deleteItem(state.editingId);
  closeSheet('sheet-item');
  renderInventory();
  showToast('已删除');
}

// ── Scan Receipt ──────────────────────────────────
function scanHtml() {
  return `
  <div id="scan-step-upload" class="scan-step active">
    <div class="upload-zone" id="upload-zone">
      <div class="upload-icon">🧾</div>
      <p><strong>点击上传小票照片</strong></p>
      <p class="hint">支持 JPG、PNG，也可直接拍照</p>
    </div>
    <div id="receipt-preview" class="receipt-preview hidden">
      <img id="preview-img" src="" alt="小票预览">
      <button class="btn btn-primary w-full" id="btn-do-scan">✨ 开始 AI 识别</button>
    </div>
  </div>

  <div id="scan-step-loading" class="scan-step">
    <div class="scan-loading">
      <div class="spinner"></div>
      <p>AI 正在识别小票...</p>
      <p class="hint">Claude claude-sonnet-4-6 分析中，请稍候</p>
    </div>
  </div>

  <div id="scan-step-review" class="scan-step">
    <p class="review-header">识别到 <strong id="scan-count">0</strong> 个商品，确认后导入：</p>
    <div id="scan-items-list"></div>
    <div class="form-actions" style="padding-top:8px">
      <button class="btn btn-ghost" id="btn-rescan">重新上传</button>
      <button class="btn btn-primary flex-1" id="btn-confirm-import">确认导入</button>
    </div>
  </div>

  <div id="scan-step-error" class="scan-step">
    <div class="scan-error">
      <div class="scan-error-icon">⚠️</div>
      <p id="scan-error-msg" class="scan-error-msg"></p>
      <button class="btn btn-primary" id="btn-scan-retry">重试</button>
    </div>
  </div>`;
}

function showScanStep(step) {
  document.querySelectorAll('.scan-step').forEach(el => el.classList.remove('active'));
  document.getElementById(`scan-step-${step}`)?.classList.add('active');
}

function openScan() {
  document.getElementById('scan-body').innerHTML = scanHtml();
  state.scanImage = null;
  state.scanImageType = null;
  showScanStep('upload');
  openSheet('sheet-scan');
}

async function performScan() {
  const apiKey = localStorage.getItem(API_KEY_STORAGE);
  if (!apiKey) {
    closeSheet('sheet-scan');
    setTimeout(() => {
      document.getElementById('input-api-key').value = '';
      openSheet('sheet-settings');
    }, 350);
    showToast('请先配置 API Key ⚙️');
    return;
  }
  if (!state.scanImage) return;

  showScanStep('loading');
  try {
    const items = await callAnthropicOCR(state.scanImage, state.scanImageType, apiKey);
    if (!Array.isArray(items) || items.length === 0) {
      showScanError('未识别到商品，请确认图片是超市小票，或尝试重拍');
      return;
    }
    state.extractedItems = items.map((item, i) => ({ ...item, _i: i, selected: true }));
    renderScanReview();
    showScanStep('review');
  } catch (err) {
    showScanError(err.message || '识别失败，请重试');
  }
}

function showScanError(msg) {
  document.getElementById('scan-error-msg').textContent = msg;
  showScanStep('error');
}

function renderScanReview() {
  const items = state.extractedItems;
  document.getElementById('scan-count').textContent = items.length;
  document.getElementById('scan-items-list').innerHTML = items.map(item => {
    const expiryDate = addDays(todayStr(), CATEGORIES[item.category]?.expiry ?? 14);
    const daysLeft = CATEGORIES[item.category]?.expiry ?? 14;
    return `<div class="scan-item">
      <input type="checkbox" class="scan-item-check" data-i="${item._i}" ${item.selected ? 'checked' : ''}>
      <div class="scan-item-body">
        <div class="scan-item-name">${catIcon(item.category)} ${escHtml(item.name)}</div>
        <div class="scan-item-meta">${escHtml(item.category)} · ${escHtml(item.quantity || '1个')} · ${item.price > 0 ? '¥' + parseFloat(item.price).toFixed(2) : '价格未知'}</div>
        <div class="scan-item-expiry">预计 ${daysLeft} 天后到期（${expiryDate}）</div>
      </div>
    </div>`;
  }).join('');
}

function confirmImport() {
  // Sync checkbox state
  document.querySelectorAll('.scan-item-check').forEach(cb => {
    const item = state.extractedItems.find(i => i._i === parseInt(cb.dataset.i));
    if (item) item.selected = cb.checked;
  });
  const selected = state.extractedItems.filter(i => i.selected);
  if (selected.length === 0) { showToast('请至少选择一个商品'); return; }

  selected.forEach(item => addItem({
    name: item.name,
    category: item.category || '其他',
    quantity: item.quantity || '',
    price: item.price || 0,
    purchaseDate: todayStr(),
    expiryDate: addDays(todayStr(), CATEGORIES[item.category]?.expiry ?? 14),
  }));

  closeSheet('sheet-scan');
  renderInventory();
  showToast(`已导入 ${selected.length} 个商品 ✅`);
}

async function callAnthropicOCR(base64, mediaType, apiKey) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: `你是超市小票解析助手。从这张小票图片提取所有食品和杂货商品，返回 JSON 数组。

字段：
- name: 商品名称（保留中文原文）
- price: 价格（数字，无法识别则为 0）
- quantity: 数量字符串（如 "1个" "500g" "2包"，默认 "1个"）
- category: 必须是以下之一：蔬菜、水果、肉类、乳制品、调料、主食、其他

规则：
1. 只返回 JSON 数组，无任何说明文字或 Markdown
2. 排除非食品（购物袋、积分、优惠券等）
3. 不是小票图片则返回 []`,
          },
        ],
      }],
    }),
  });

  if (!resp.ok) {
    let msg = `API 错误 ${resp.status}`;
    try { const e = await resp.json(); msg = e.error?.message || msg; } catch {}
    throw new Error(msg);
  }

  const data = await resp.json();
  const text = (data.content?.[0]?.text || '').trim();

  try { const r = JSON.parse(text); if (Array.isArray(r)) return r; } catch {}
  const m = text.match(/\[[\s\S]*\]/);
  if (m) { try { const r = JSON.parse(m[0]); if (Array.isArray(r)) return r; } catch {} }

  throw new Error('无法解析识别结果，请重试');
}

// ── File Handling ─────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result.split(',')[1];
      resolve({ base64: b64, mediaType: file.type || 'image/jpeg' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Toast ─────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = 'block';
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { if (el) el.style.display = 'none'; }, 2400);
}

// ── Settings ──────────────────────────────────────
function loadApiKey() {
  document.getElementById('input-api-key').value = localStorage.getItem(API_KEY_STORAGE) || '';
}

function exportData() {
  const blob = new Blob([JSON.stringify(state.items, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `fridge-${todayStr()}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Event Delegation for item-container ───────────
function handleContainerClick(e) {
  const card = e.target.closest('[data-id]');
  if (card) openEditForm(card.dataset.id);
}

// ── Event Delegation for scan-body ────────────────
function handleScanBodyClick(e) {
  const t = e.target;
  if (t.closest('#upload-zone')) {
    document.getElementById('file-input').value = '';
    document.getElementById('file-input').click();
    return;
  }
  if (t.closest('#btn-do-scan')) { performScan(); return; }
  if (t.closest('#btn-rescan')) {
    state.scanImage = null;
    showScanStep('upload');
    document.getElementById('receipt-preview')?.classList.add('hidden');
    document.getElementById('upload-zone')?.classList.remove('hidden');
    return;
  }
  if (t.closest('#btn-confirm-import')) { confirmImport(); return; }
  if (t.closest('#btn-scan-retry')) { showScanStep('upload'); return; }
}

// ── Init ──────────────────────────────────────────
function init() {
  state.items = loadItems();
  renderInventory();

  // Filter tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.filter = tab.dataset.filter;
      renderInventory();
    });
  });

  // View toggle
  document.getElementById('btn-toggle-view').addEventListener('click', () => {
    state.viewMode = state.viewMode === 'grid' ? 'list' : 'grid';
    document.getElementById('icon-grid').classList.toggle('hidden', state.viewMode === 'list');
    document.getElementById('icon-list').classList.toggle('hidden', state.viewMode === 'grid');
    renderInventory();
  });

  // Item container (delegated)
  document.getElementById('item-container').addEventListener('click', handleContainerClick);

  // Add button (FAB)
  document.getElementById('btn-add-item').addEventListener('click', openAddForm);

  // Item form
  document.getElementById('form-item').addEventListener('submit', handleFormSubmit);
  document.getElementById('btn-close-item').addEventListener('click', () => closeSheet('sheet-item'));
  document.getElementById('btn-delete-item').addEventListener('click', handleDeleteItem);

  // Auto-update expiry when category changes
  document.getElementById('input-category').addEventListener('change', e => {
    const purchase = document.getElementById('input-purchase-date').value || todayStr();
    document.getElementById('input-expiry-date').value = addDays(purchase, CATEGORIES[e.target.value]?.expiry ?? 14);
  });

  // Scan
  document.getElementById('btn-open-scan').addEventListener('click', openScan);
  document.getElementById('btn-close-scan').addEventListener('click', () => closeSheet('sheet-scan'));
  document.getElementById('scan-body').addEventListener('click', handleScanBodyClick);

  // File input
  document.getElementById('file-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const { base64, mediaType } = await fileToBase64(file);
      state.scanImage = base64;
      state.scanImageType = mediaType;
      const img = document.getElementById('preview-img');
      if (img) { img.src = `data:${mediaType};base64,${base64}`; }
      document.getElementById('upload-zone')?.classList.add('hidden');
      document.getElementById('receipt-preview')?.classList.remove('hidden');
    } catch { showToast('图片读取失败，请重试'); }
  });

  // Settings
  document.getElementById('btn-open-settings').addEventListener('click', () => {
    loadApiKey();
    openSheet('sheet-settings');
  });
  document.getElementById('btn-close-settings').addEventListener('click', () => closeSheet('sheet-settings'));
  document.getElementById('btn-toggle-key').addEventListener('click', () => {
    const inp = document.getElementById('input-api-key');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });
  document.getElementById('btn-save-key').addEventListener('click', () => {
    localStorage.setItem(API_KEY_STORAGE, document.getElementById('input-api-key').value.trim());
    showToast('API Key 已保存 ✅');
  });
  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('btn-clear-all').addEventListener('click', () => {
    if (!confirm('确认清空所有数据？此操作不可撤销！')) return;
    state.items = [];
    saveItems();
    renderInventory();
    closeSheet('sheet-settings');
    showToast('数据已清空');
  });

  // Backdrop click
  document.getElementById('modal-backdrop').addEventListener('click', () => {
    ['sheet-item', 'sheet-scan', 'sheet-settings'].forEach(closeSheet);
  });
}

document.addEventListener('DOMContentLoaded', init);
