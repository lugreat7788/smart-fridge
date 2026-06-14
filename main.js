// Smart Fridge & Grocery Manager v1.1

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
const HISTORY_KEY = 'fridge_purchases_v1';
const API_KEY_STORAGE = 'anthropic_api_key';

const state = {
  items: [],
  filter: 'all',
  viewMode: 'grid',
  currentView: 'inventory',
  editingId: null,
  scanImage: null,
  scanImageType: null,
  extractedItems: [],
  recipes: null,
  shoppingList: null,
};

// ── Storage ──────────────────────────────────────
function loadItems() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}
function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
}

function loadPurchaseHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}
function recordPurchase(items) {
  const history = loadPurchaseHistory();
  const today = todayStr();
  items.forEach(item => {
    history.push({ name: item.name, category: item.category, date: today, price: item.price || 0 });
  });
  const cutoff = addDays(todayStr(), -90);
  const trimmed = history.filter(h => h.date >= cutoff);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
}

function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE) || '';
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
  recordPurchase([item]);
  state.recipes = null; // invalidate recipe cache when inventory changes
  return item;
}
function updateItem(id, data) {
  const idx = state.items.findIndex(i => i.id === id);
  if (idx < 0) return;
  state.items[idx] = buildItem({ ...state.items[idx], ...data });
  saveItems();
  state.recipes = null;
}
function deleteItem(id) {
  state.items = state.items.filter(i => i.id !== id);
  saveItems();
  state.recipes = null;
}

// ── Rendering: Inventory ──────────────────────────
function catIcon(category) {
  return (CATEGORIES[category] || CATEGORIES['其他']).icon;
}
function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function getFiltered() {
  return state.items.filter(item =>
    state.filter === 'all' || getFreshness(item.expiryDate).status === state.filter
  );
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
    counts[getFreshness(item.expiryDate).status]++;
  });
  document.getElementById('badge-all').textContent = counts.all;
  document.getElementById('badge-fresh').textContent = counts.fresh || 0;
  document.getElementById('badge-soon').textContent = counts.soon || 0;
  document.getElementById('badge-expired').textContent = counts.expired || 0;
}

// ── View Switching ────────────────────────────────
function switchView(view) {
  state.currentView = view;
  document.getElementById('app').dataset.view = view;

  document.querySelectorAll('.nav-tab').forEach(tab =>
    tab.classList.toggle('active', tab.dataset.view === view)
  );

  document.getElementById('view-inventory').classList.toggle('hidden', view !== 'inventory');
  document.getElementById('view-recipes').classList.toggle('hidden', view !== 'recipes');
  document.getElementById('view-shopping').classList.toggle('hidden', view !== 'shopping');

  // Auto-render cached results when navigating back to AI views
  if (view === 'recipes' && state.recipes) renderRecipes(state.recipes);
  if (view === 'shopping' && state.shoppingList) renderShoppingList(state.shoppingList);
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
    const anyOpen = ['sheet-item','sheet-scan','sheet-settings']
      .some(s => !document.getElementById(s).classList.contains('hidden'));
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
  document.getElementById('form-item').reset();
  document.getElementById('input-id').value = '';
  document.getElementById('input-purchase-date').value = todayStr();
  document.getElementById('input-category').value = '蔬菜';
  document.getElementById('input-expiry-date').value = addDays(todayStr(), CATEGORIES['蔬菜'].expiry);
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
  if (!state.editingId || !confirm('确定删除这个食材？')) return;
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
      <p class="hint">claude-sonnet-4-6 分析中，请稍候</p>
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
  const apiKey = getApiKey();
  if (!apiKey) {
    closeSheet('sheet-scan');
    setTimeout(() => openSheet('sheet-settings'), 350);
    showToast('请先配置 API Key ⚙️');
    return;
  }
  if (!state.scanImage) return;
  showScanStep('loading');
  try {
    const items = await callAnthropicOCR(state.scanImage, state.scanImageType, apiKey);
    if (!Array.isArray(items) || items.length === 0) {
      showScanError('未识别到商品，请确认图片是超市小票');
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
  document.getElementById('scan-count').textContent = state.extractedItems.length;
  document.getElementById('scan-items-list').innerHTML = state.extractedItems.map(item => {
    const daysLeft = CATEGORIES[item.category]?.expiry ?? 14;
    const expiryDate = addDays(todayStr(), daysLeft);
    return `<div class="scan-item">
      <input type="checkbox" class="scan-item-check" data-i="${item._i}" checked>
      <div class="scan-item-body">
        <div class="scan-item-name">${catIcon(item.category)} ${escHtml(item.name)}</div>
        <div class="scan-item-meta">${escHtml(item.category)} · ${escHtml(item.quantity || '1个')} · ${item.price > 0 ? '¥' + parseFloat(item.price).toFixed(2) : '价格未知'}</div>
        <div class="scan-item-expiry">预计 ${daysLeft} 天后到期（${expiryDate}）</div>
      </div>
    </div>`;
  }).join('');
}
function confirmImport() {
  document.querySelectorAll('.scan-item-check').forEach(cb => {
    const item = state.extractedItems.find(i => i._i === parseInt(cb.dataset.i));
    if (item) item.selected = cb.checked;
  });
  const selected = state.extractedItems.filter(i => i.selected);
  if (selected.length === 0) { showToast('请至少选择一个商品'); return; }
  const added = selected.map(item => addItem({
    name: item.name, category: item.category || '其他',
    quantity: item.quantity || '', price: item.price || 0,
    purchaseDate: todayStr(),
    expiryDate: addDays(todayStr(), CATEGORIES[item.category]?.expiry ?? 14),
  }));
  // Note: addItem already calls recordPurchase per item, but we want to batch record the scan
  // Remove the individual records and do one batch (already handled in addItem)
  closeSheet('sheet-scan');
  renderInventory();
  showToast(`已导入 ${added.length} 个商品 ✅`);
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
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: `你是超市小票解析助手。从这张小票图片提取所有食品和杂货商品，返回 JSON 数组。

字段：
- name: 商品名称（保留中文原文）
- price: 价格（数字，无法识别则为 0）
- quantity: 数量字符串（如 "1个" "500g" "2包"，默认 "1个"）
- category: 必须是以下之一：蔬菜、水果、肉类、乳制品、调料、主食、其他

规则：只返回 JSON 数组，无任何说明文字或 Markdown；排除非食品（购物袋、积分等）；不是小票则返回 []` },
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
  return parseJsonArray((data.content?.[0]?.text || '').trim());
}

// ── Recipe Recommendations ────────────────────────
function buildInventoryForPrompt() {
  return state.items.map(item => {
    const { status, daysLeft } = getFreshness(item.expiryDate);
    const freshnessLabel = status === 'expired' ? '已过期（建议丢弃）'
      : status === 'soon' ? `快过期（还剩${daysLeft}天，优先使用）`
      : `新鲜（还剩${daysLeft}天）`;
    return { name: item.name, category: item.category, quantity: item.quantity || '适量', freshness: freshnessLabel };
  });
}

let recipesLoading = false;
async function getRecipes(force = false) {
  if (recipesLoading) return;
  const apiKey = getApiKey();
  if (!apiKey) {
    openSheet('sheet-settings');
    showToast('请先配置 API Key ⚙️');
    return;
  }
  if (!force && state.recipes) { showRecipesState('result'); renderRecipes(state.recipes); return; }
  if (state.items.length === 0) { showToast('冰箱是空的，请先添加一些食材'); return; }

  recipesLoading = true;
  showRecipesState('loading');

  try {
    const inventory = buildInventoryForPrompt();
    const expiringNames = inventory.filter(i => i.freshness.includes('快过期')).map(i => i.name);
    const expiringNote = expiringNames.length > 0
      ? `\n\n⚠️ 以下食材即将过期，优先推荐使用它们的菜谱：${expiringNames.join('、')}`
      : '';

    const prompt = `你是专业中餐家常菜厨师助手。根据以下冰箱库存，推荐 3-5 道今天可以烹饪的菜肴。${expiringNote}

【当前冰箱库存】
${JSON.stringify(inventory, null, 2)}

要求：
• 优先使用标注"快过期"的食材，减少浪费
• 推荐适合中国家庭的家常菜，难度以简单/中等为主
• missingIngredients 只列关键食材（盐/油/酱油等基础调味不算）
• steps 提供 4-8 个简洁中文步骤，每步不超过 30 字
• difficulty 必须是：简单、中等、复杂 之一

只返回以下格式的 JSON 数组，不要任何其他文字或 Markdown：
[{"dishName":"菜名","ingredientsUsed":["食材1","食材2"],"missingIngredients":["缺失食材"],"steps":["步骤1...","步骤2..."],"cookTime":"X分钟","difficulty":"简单"}]`;

    const result = await callAnthropicChat(prompt, apiKey);
    if (!Array.isArray(result) || result.length === 0) throw new Error('未能获取食谱建议，请重试');
    state.recipes = result;
    showRecipesState('result');
    renderRecipes(result);
  } catch (err) {
    showRecipesState('error', err.message || '获取食谱失败，请重试');
  } finally {
    recipesLoading = false;
  }
}

function showRecipesState(s, errorMsg) {
  ['intro', 'loading', 'result', 'error'].forEach(n =>
    document.getElementById(`recipes-${n}`)?.classList.toggle('hidden', n !== s)
  );
  if (s === 'error' && errorMsg) document.getElementById('recipes-error-msg').textContent = errorMsg;
}

function renderRecipes(recipes) {
  document.getElementById('recipes-result-label').textContent = `${recipes.length} 道菜谱`;
  const inventoryNames = state.items.map(i => i.name);
  const expiringNames = state.items
    .filter(i => getFreshness(i.expiryDate).status === 'soon')
    .map(i => i.name);

  document.getElementById('recipes-list').innerHTML = recipes.map((r, idx) => {
    const total = (r.ingredientsUsed?.length || 0) + (r.missingIngredients?.length || 0);
    const have = r.ingredientsUsed?.length || 0;
    const matchClass = have === total ? 'full' : '';
    const diffClass = { '简单': 'easy', '中等': 'medium', '复杂': 'hard' }[r.difficulty] || 'easy';

    const haveChips = (r.ingredientsUsed || []).map(ing => {
      const expiring = expiringNames.some(n => ing.includes(n) || n.includes(ing));
      return `<span class="ingredient-chip have${expiring ? ' expiring' : ''}">✅ ${escHtml(ing)}${expiring ? ' ⚡' : ''}</span>`;
    }).join('');

    const missingChips = (r.missingIngredients || []).map(ing =>
      `<span class="ingredient-chip missing">🛒 ${escHtml(ing)}</span>`
    ).join('');

    const steps = (r.steps || []).map((step, i) =>
      `<div class="recipe-step"><span class="step-num">${i + 1}</span><span>${escHtml(step)}</span></div>`
    ).join('');

    return `<div class="recipe-card" data-idx="${idx}" data-expanded="false">
      <button class="recipe-header" data-toggle="${idx}">
        <div class="recipe-header-left">
          <div class="recipe-name">${escHtml(r.dishName)}</div>
          <div class="recipe-meta">
            <span class="recipe-cook-time">⏱ ${escHtml(r.cookTime || '?分钟')}</span>
            <span class="recipe-difficulty ${diffClass}">${escHtml(r.difficulty || '简单')}</span>
            <span class="recipe-match ${matchClass}">${have === total ? '✅' : '🧩'} ${have}/${total} 种食材已有</span>
          </div>
        </div>
        <svg class="recipe-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="recipe-body">
        <div class="recipe-section">
          <p class="recipe-section-label">所需食材</p>
          <div class="ingredient-chips">${haveChips}${missingChips}</div>
        </div>
        <div class="recipe-section">
          <p class="recipe-section-label">烹饪步骤</p>
          <div class="recipe-steps">${steps}</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── Shopping Recommendations ──────────────────────
function buildHistoryForPrompt() {
  const history = loadPurchaseHistory();
  const grouped = {};
  history.forEach(h => {
    if (!grouped[h.name]) grouped[h.name] = { name: h.name, category: h.category, count: 0, lastDate: h.date };
    grouped[h.name].count++;
    if (h.date > grouped[h.name].lastDate) grouped[h.name].lastDate = h.date;
  });
  return Object.values(grouped).sort((a, b) => b.count - a.count).slice(0, 25);
}

let shoppingLoading = false;
async function getShopping(force = false) {
  if (shoppingLoading) return;
  const apiKey = getApiKey();
  if (!apiKey) {
    openSheet('sheet-settings');
    showToast('请先配置 API Key ⚙️');
    return;
  }
  if (!force && state.shoppingList) { showShoppingState('result'); renderShoppingList(state.shoppingList); return; }

  shoppingLoading = true;
  showShoppingState('loading');

  try {
    const inventory = buildInventoryForPrompt();
    const history = buildHistoryForPrompt();

    const prompt = `你是营养师兼家庭采购顾问。根据以下信息生成 6-10 条个性化购物建议。

【当前冰箱库存】${inventory.length === 0 ? '（空）' : ''}
${JSON.stringify(inventory, null, 2)}

【近期购买记录摘要（按频次排序）】${history.length === 0 ? '（暂无记录）' : ''}
${JSON.stringify(history, null, 2)}

推荐原则：
1. 常买食品若库存不足或已耗尽，建议补充
2. 营养均衡：考虑近期蛋白质（肉类/乳制品）、蔬菜、水果摄入是否充足
3. 若某类食物长期缺失，建议补充
4. 避免推荐库存充足的食材

reason 字段简洁，15字内，如"常买，已用完"、"近期缺乏蛋白质"、"蔬菜种类单一"

只返回以下格式 JSON 数组，不要其他文字：
[{"item":"商品名","reason":"推荐原因","category":"蔬菜/水果/肉类/乳制品/调料/主食/其他"}]`;

    const result = await callAnthropicChat(prompt, apiKey);
    if (!Array.isArray(result) || result.length === 0) throw new Error('未能获取购物建议，请重试');
    state.shoppingList = result;
    showShoppingState('result');
    renderShoppingList(result);
  } catch (err) {
    showShoppingState('error', err.message || '获取购物建议失败，请重试');
  } finally {
    shoppingLoading = false;
  }
}

function showShoppingState(s, errorMsg) {
  ['intro', 'loading', 'result', 'error'].forEach(n =>
    document.getElementById(`shopping-${n}`)?.classList.toggle('hidden', n !== s)
  );
  if (s === 'error' && errorMsg) document.getElementById('shopping-error-msg').textContent = errorMsg;
}

function renderShoppingList(list) {
  document.getElementById('shopping-result-label').textContent = `${list.length} 条购物建议`;
  document.getElementById('shopping-list').innerHTML = list.map(item => {
    const cat = item.category || '其他';
    const icon = catIcon(cat);
    return `<div class="shop-item">
      <span class="shop-icon">${icon}</span>
      <div class="shop-info">
        <div class="shop-name">${escHtml(item.item)}</div>
        <div class="shop-reason">${escHtml(item.reason)}</div>
      </div>
      <span class="shop-badge ${escHtml(cat)}">${escHtml(cat)}</span>
    </div>`;
  }).join('');
}

// ── Shared Anthropic API ──────────────────────────
async function callAnthropicChat(prompt, apiKey) {
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
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!resp.ok) {
    let msg = `API 错误 ${resp.status}`;
    try { const e = await resp.json(); msg = e.error?.message || msg; } catch {}
    throw new Error(msg);
  }
  const data = await resp.json();
  return parseJsonArray((data.content?.[0]?.text || '').trim());
}

function parseJsonArray(text) {
  try { const r = JSON.parse(text); if (Array.isArray(r)) return r; } catch {}
  const m = text.match(/\[[\s\S]*?\]/s);
  if (m) { try { const r = JSON.parse(m[0]); if (Array.isArray(r)) return r; } catch {} }
  // Try to find last complete JSON array (handles leading text)
  const lastBracket = text.lastIndexOf(']');
  if (lastBracket > 0) {
    const firstBracket = text.lastIndexOf('[', lastBracket);
    if (firstBracket >= 0) {
      try { const r = JSON.parse(text.slice(firstBracket, lastBracket + 1)); if (Array.isArray(r)) return r; } catch {}
    }
  }
  throw new Error('无法解析 AI 返回结果，请重试');
}

// ── File Handling ─────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ base64: reader.result.split(',')[1], mediaType: file.type || 'image/jpeg' });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Toast ─────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.style.display = 'block';
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { if (el) el.style.display = 'none'; }, 2400);
}

// ── Settings ──────────────────────────────────────
function exportData() {
  const blob = new Blob([JSON.stringify(state.items, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `fridge-${todayStr()}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Event Delegation: inventory ───────────────────
function handleContainerClick(e) {
  const card = e.target.closest('[data-id]');
  if (card) openEditForm(card.dataset.id);
}

// ── Event Delegation: recipe list ────────────────
function handleRecipesListClick(e) {
  const btn = e.target.closest('[data-toggle]');
  if (!btn) return;
  const card = document.querySelector(`.recipe-card[data-idx="${btn.dataset.toggle}"]`);
  if (card) card.dataset.expanded = card.dataset.expanded === 'true' ? 'false' : 'true';
}

// ── Event Delegation: scan body ──────────────────
function handleScanBodyClick(e) {
  const t = e.target;
  if (t.closest('#upload-zone')) { document.getElementById('file-input').value = ''; document.getElementById('file-input').click(); return; }
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

  // Nav tabs (view switching)
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });

  // Filter tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.filter = tab.dataset.filter;
      renderInventory();
    });
  });

  // View toggle (grid/list)
  document.getElementById('btn-toggle-view').addEventListener('click', () => {
    state.viewMode = state.viewMode === 'grid' ? 'list' : 'grid';
    document.getElementById('icon-grid').classList.toggle('hidden', state.viewMode === 'list');
    document.getElementById('icon-list').classList.toggle('hidden', state.viewMode === 'grid');
    renderInventory();
  });

  // Item container (delegated click → edit)
  document.getElementById('item-container').addEventListener('click', handleContainerClick);

  // FAB: Add item
  document.getElementById('btn-add-item').addEventListener('click', openAddForm);

  // Item form
  document.getElementById('form-item').addEventListener('submit', handleFormSubmit);
  document.getElementById('btn-close-item').addEventListener('click', () => closeSheet('sheet-item'));
  document.getElementById('btn-delete-item').addEventListener('click', handleDeleteItem);
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
      if (img) img.src = `data:${mediaType};base64,${base64}`;
      document.getElementById('upload-zone')?.classList.add('hidden');
      document.getElementById('receipt-preview')?.classList.remove('hidden');
    } catch { showToast('图片读取失败，请重试'); }
  });

  // Recipes view
  document.getElementById('btn-get-recipes').addEventListener('click', () => getRecipes(true));
  document.getElementById('btn-refresh-recipes').addEventListener('click', () => getRecipes(true));
  document.getElementById('btn-retry-recipes').addEventListener('click', () => getRecipes(true));
  document.getElementById('recipes-list').addEventListener('click', handleRecipesListClick);

  // Shopping view
  document.getElementById('btn-get-shopping').addEventListener('click', () => getShopping(true));
  document.getElementById('btn-refresh-shopping').addEventListener('click', () => getShopping(true));
  document.getElementById('btn-retry-shopping').addEventListener('click', () => getShopping(true));

  // Settings
  document.getElementById('btn-open-settings').addEventListener('click', () => {
    document.getElementById('input-api-key').value = getApiKey();
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
    state.recipes = null;
    state.shoppingList = null;
    saveItems();
    localStorage.removeItem(HISTORY_KEY);
    renderInventory();
    showRecipesState('intro');
    showShoppingState('intro');
    closeSheet('sheet-settings');
    showToast('数据已清空');
  });

  // Backdrop
  document.getElementById('modal-backdrop').addEventListener('click', () => {
    ['sheet-item', 'sheet-scan', 'sheet-settings'].forEach(closeSheet);
  });
}

document.addEventListener('DOMContentLoaded', init);
