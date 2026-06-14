// Smart Fridge & Grocery Manager — Supabase edition

// ══ Constants ═══════════════════════════════════════
const CATEGORIES = {
  '蔬菜':  { icon: '🥦', expiry: 5 },
  '水果':  { icon: '🍎', expiry: 5 },
  '肉类':  { icon: '🥩', expiry: 4 },
  '乳制品':{ icon: '🥛', expiry: 7 },
  '调料':  { icon: '🧂', expiry: 90 },
  '主食':  { icon: '🍚', expiry: 180 },
  '其他':  { icon: '📦', expiry: 14 },
};

// ══ App State ═════════════════════════════════════════
const state = {
  items:        [],
  filter:       'all',
  viewMode:     'grid',
  currentView:  'inventory',
  editingId:    null,
  scanImage:    null,
  scanMime:     null,
  extractedItems: [],
  recipes:      null,
  shoppingList: null,
};

// ══ Supabase DB Layer ═════════════════════════════════
let sb; // supabase client (initialized in init)

const db = {
  async fetchItems() {
    const { data, error } = await sb.from('food_items').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async insertItem(payload) {
    const { data, error } = await sb.from('food_items').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },
  async updateItem(id, payload) {
    const { data, error } = await sb.from('food_items').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async deleteItem(id) {
    const { error } = await sb.from('food_items').delete().eq('id', id);
    if (error) throw error;
  },
  async insertHistory(records) {
    const { error } = await sb.from('purchase_history').insert(records);
    if (error) throw error;
  },
  async fetchHistory(days = 90) {
    const cutoff = addDays(todayStr(), -days);
    const { data, error } = await sb.from('purchase_history').select('*').gte('date', cutoff).order('date', { ascending: false });
    if (error) throw error;
    return data || [];
  },
};

// ══ Date / Freshness Utils ════════════════════════════
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function getFreshness(expiry) {
  if (!expiry) return { status: 'fresh', label: '未设置', daysLeft: 999 };
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const exp = new Date(expiry + 'T00:00:00');
  const days = Math.round((exp - now) / 86400000);
  if (days < 0)  return { status: 'expired', label: `过期${Math.abs(days)}天`, daysLeft: days };
  if (days === 0) return { status: 'expired', label: '今天到期', daysLeft: 0 };
  if (days <= 3)  return { status: 'soon',    label: `还剩${days}天`,   daysLeft: days };
  return            { status: 'fresh',   label: `还剩${days}天`,   daysLeft: days };
}
function computeStatus(expiry) { return getFreshness(expiry).status; }
function catIcon(cat) { return (CATEGORIES[cat] || CATEGORIES['其他']).icon; }
function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══ Item Payload Builder ══════════════════════════════
function buildPayload(data) {
  const category     = data.category || '其他';
  const purchase_date = data.purchase_date || data.purchaseDate || todayStr();
  const expiry_date  = data.expiry_date || data.expiryDate ||
    addDays(purchase_date, CATEGORIES[category]?.expiry ?? 14);
  return {
    name:          (data.name || '').trim(),
    category,
    quantity:      (data.quantity || '').trim(),
    price:         Math.max(0, parseFloat(data.price) || 0),
    purchase_date,
    expiry_date,
    status:        computeStatus(expiry_date),
  };
}

// ══ Inventory Rendering ═══════════════════════════════
function getFiltered() {
  return state.items.filter(item =>
    state.filter === 'all' || computeStatus(item.expiry_date) === state.filter
  );
}

function renderCard(item) {
  const f = getFreshness(item.expiry_date);
  const qty = item.quantity ? `<span class="card-qty">${escHtml(item.quantity)}</span>` : '';
  return `<div class="item-card ${f.status}" data-id="${item.id}">
    <span class="card-emoji">${catIcon(item.category)}</span>
    <div class="card-name">${escHtml(item.name)}</div>
    <div class="card-cat">${escHtml(item.category)}</div>
    <div class="card-foot">
      ${qty}
      <span class="fresh-pill ${f.status}">${f.label}</span>
    </div>
  </div>`;
}

function renderRow(item) {
  const f = getFreshness(item.expiry_date);
  const meta = [item.quantity, item.price > 0 ? `¥${item.price.toFixed(2)}` : '', item.category]
    .filter(Boolean).join(' · ');
  return `<div class="item-row ${f.status}" data-id="${item.id}">
    <span class="row-emoji">${catIcon(item.category)}</span>
    <div class="row-info">
      <div class="row-name">${escHtml(item.name)}</div>
      <div class="row-meta">${escHtml(meta)}</div>
    </div>
    <div class="row-end"><span class="fresh-pill ${f.status}">${f.label}</span></div>
  </div>`;
}

function renderInventory() {
  const container = document.getElementById('item-container');
  const empty     = document.getElementById('empty-state');
  const skeleton  = document.getElementById('inv-skeleton');

  skeleton.classList.add('hidden');
  container.className = state.viewMode === 'grid' ? 'item-grid' : 'item-list';

  const items = getFiltered();
  if (items.length === 0) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
    container.innerHTML = items.map(state.viewMode === 'grid' ? renderCard : renderRow).join('');
  }
  updateCounts();
}

function updateCounts() {
  const c = { all: 0, fresh: 0, soon: 0, expired: 0 };
  state.items.forEach(item => {
    c.all++;
    c[computeStatus(item.expiry_date)]++;
  });
  document.getElementById('cnt-all').textContent     = c.all;
  document.getElementById('cnt-fresh').textContent   = c.fresh || 0;
  document.getElementById('cnt-soon').textContent    = c.soon  || 0;
  document.getElementById('cnt-expired').textContent = c.expired || 0;
}

async function loadInventory() {
  document.getElementById('inv-skeleton').classList.remove('hidden');
  document.getElementById('item-container').innerHTML = '';
  document.getElementById('empty-state').classList.add('hidden');
  try {
    state.items = await db.fetchItems();
    renderInventory();
  } catch (err) {
    document.getElementById('inv-skeleton').classList.add('hidden');
    showToast('加载失败：' + err.message);
  }
}

// ══ View Switching ════════════════════════════════════
const VIEW_TITLES = {
  inventory: '冰箱管家',
  scan:      '扫描小票',
  recipes:   '今天吃什么',
  shopping:  '购物清单',
};

function switchView(view) {
  state.currentView = view;
  document.getElementById('screen-main').dataset.view = view;
  document.getElementById('header-title').textContent = VIEW_TITLES[view];

  document.querySelectorAll('.nav-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.view === view)
  );
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('hidden', v.id !== 'view-' + view);
  });

  // Re-render cached AI results when switching back
  if (view === 'recipes'  && state.recipes)      showRecipesState('result');
  if (view === 'shopping' && state.shoppingList) showShoppingState('result');

  // Reset scan view to upload step each time
  if (view === 'scan') {
    showScanStep('upload');
    resetScanUpload();
  }
}

// ══ Sheet Management ══════════════════════════════════
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
    document.getElementById('modal-backdrop').classList.add('hidden');
    document.body.style.overflow = '';
  }, 340);
}

// ══ Item Form ═════════════════════════════════════════
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
  document.getElementById('input-id').value           = item.id;
  document.getElementById('input-name').value         = item.name;
  document.getElementById('input-category').value     = item.category;
  document.getElementById('input-quantity').value     = item.quantity || '';
  document.getElementById('input-purchase-date').value = item.purchase_date || todayStr();
  document.getElementById('input-expiry-date').value  = item.expiry_date || '';
  document.getElementById('input-price').value        = item.price > 0 ? item.price : '';
  openSheet('sheet-item');
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const saveBtn = document.getElementById('btn-save-item');
  saveBtn.textContent = '保存中...'; saveBtn.disabled = true;

  const payload = buildPayload({
    name:          document.getElementById('input-name').value,
    category:      document.getElementById('input-category').value,
    quantity:      document.getElementById('input-quantity').value,
    purchase_date: document.getElementById('input-purchase-date').value,
    expiry_date:   document.getElementById('input-expiry-date').value,
    price:         document.getElementById('input-price').value,
  });
  if (!payload.name) { saveBtn.textContent = '保存'; saveBtn.disabled = false; return; }

  try {
    if (state.editingId) {
      const updated = await db.updateItem(state.editingId, payload);
      const idx = state.items.findIndex(i => i.id === state.editingId);
      if (idx >= 0) state.items[idx] = updated;
      state.recipes = null;
      showToast('已更新 ✅');
    } else {
      const saved = await db.insertItem(payload);
      state.items.unshift(saved);
      state.recipes = null;
      db.insertHistory([{ name: saved.name, category: saved.category, date: saved.purchase_date, price: saved.price }])
        .catch(console.error);
      showToast('已添加 ✅');
    }
    closeSheet('sheet-item');
    renderInventory();
  } catch (err) {
    showToast('保存失败：' + err.message);
  } finally {
    saveBtn.textContent = '保存'; saveBtn.disabled = false;
  }
}

async function handleDeleteItem() {
  if (!state.editingId || !confirm('确定删除这个食材？')) return;
  const btn = document.getElementById('btn-delete-item');
  btn.textContent = '删除中...'; btn.disabled = true;
  try {
    await db.deleteItem(state.editingId);
    state.items = state.items.filter(i => i.id !== state.editingId);
    state.recipes = null;
    closeSheet('sheet-item');
    renderInventory();
    showToast('已删除');
  } catch (err) {
    showToast('删除失败：' + err.message);
    btn.textContent = '删除'; btn.disabled = false;
  }
}

// ══ Scan Flow ═════════════════════════════════════════
function showScanStep(step) {
  ['upload', 'loading', 'review', 'error'].forEach(s => {
    const el = document.getElementById('scan-step-' + s);
    if (el) el.classList.toggle('active', s === step);
  });
}
function resetScanUpload() {
  state.scanImage = null; state.scanMime = null;
  document.getElementById('scan-preview-wrap').classList.add('hidden');
  document.getElementById('upload-zone').classList.remove('hidden');
  document.getElementById('file-input').value = '';
}

async function performScan() {
  if (!state.scanImage) return;
  const apiKey = CONFIG?.anthropic?.apiKey;
  if (!apiKey || apiKey.includes('YOUR_')) { showToast('请先在 config.js 中配置 Anthropic API Key'); return; }

  showScanStep('loading');
  try {
    const items = await callOCR(state.scanImage, state.scanMime, apiKey);
    if (!Array.isArray(items) || items.length === 0) {
      setScanError('未识别到商品，请确认图片为超市小票');
      return;
    }
    state.extractedItems = items.map((it, i) => ({ ...it, _i: i, selected: true }));
    renderScanReview();
    showScanStep('review');
  } catch (err) {
    setScanError(err.message || '识别失败，请重试');
  }
}

function setScanError(msg) {
  document.getElementById('scan-error-msg').textContent = msg;
  showScanStep('error');
}

function renderScanReview() {
  document.getElementById('scan-count').textContent = state.extractedItems.length;
  document.getElementById('scan-review-list').innerHTML = state.extractedItems.map(item => {
    const daysLeft   = CATEGORIES[item.category]?.expiry ?? 14;
    const expiryDate = addDays(todayStr(), daysLeft);
    return `<div class="scan-review-item">
      <input type="checkbox" class="scan-check" data-i="${item._i}" checked>
      <div class="scan-item-info">
        <div class="scan-item-name">${catIcon(item.category)} ${escHtml(item.name)}</div>
        <div class="scan-item-meta">${escHtml(item.category)} · ${escHtml(item.quantity || '1个')} · ${item.price > 0 ? '¥' + parseFloat(item.price).toFixed(2) : '价格未知'}</div>
        <div class="scan-item-expiry">预计 ${daysLeft} 天后到期（${expiryDate}）</div>
      </div>
    </div>`;
  }).join('');
}

async function confirmImport() {
  document.querySelectorAll('.scan-check').forEach(cb => {
    const it = state.extractedItems.find(x => x._i === parseInt(cb.dataset.i));
    if (it) it.selected = cb.checked;
  });
  const selected = state.extractedItems.filter(i => i.selected);
  if (selected.length === 0) { showToast('请至少勾选一件商品'); return; }

  const btn = document.getElementById('btn-confirm-import');
  btn.textContent = '导入中...'; btn.disabled = true;

  try {
    const payloads = selected.map(it => buildPayload({
      name: it.name, category: it.category || '其他',
      quantity: it.quantity || '', price: it.price || 0,
      purchase_date: todayStr(),
    }));
    // Insert all items in batch
    const { data: inserted, error } = await sb.from('food_items').insert(payloads).select();
    if (error) throw error;
    state.items.unshift(...inserted);
    state.recipes = null;

    // Record purchase history (fire and forget)
    db.insertHistory(inserted.map(it => ({
      name: it.name, category: it.category,
      date: it.purchase_date, price: it.price,
    }))).catch(console.error);

    switchView('inventory');
    renderInventory();
    showToast(`已导入 ${inserted.length} 件商品 ✅`);
  } catch (err) {
    showToast('导入失败：' + err.message);
    btn.textContent = '确认导入'; btn.disabled = false;
  }
}

// ══ Anthropic OCR ══════════════════════════════════════
async function callOCR(base64, mime, apiKey) {
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
          { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
          { type: 'text', text: `解析超市小票，提取所有食品和日用杂货商品，返回 JSON 数组。
字段：name（中文原文）、price（数字）、quantity（如"1个"）、category（蔬菜/水果/肉类/乳制品/调料/主食/其他）。
只返回 JSON 数组，无其他文字；排除非商品（购物袋、积分等）；非小票图片返回 []。` },
        ],
      }],
    }),
  });
  if (!resp.ok) {
    let msg = `API ${resp.status}`;
    try { const e = await resp.json(); msg = e.error?.message || msg; } catch {}
    throw new Error(msg);
  }
  return parseJsonArray((await resp.json()).content?.[0]?.text || '');
}

// ══ Recipe Recommendations ════════════════════════════
function buildInventoryPromptData() {
  return state.items.map(item => {
    const { status, daysLeft } = getFreshness(item.expiry_date);
    return {
      name:     item.name,
      category: item.category,
      quantity: item.quantity || '适量',
      freshness: status === 'expired' ? '已过期（勿用）'
        : status === 'soon' ? `快过期（还剩${daysLeft}天，优先用）`
        : `新鲜（还剩${daysLeft}天）`,
    };
  });
}

let recipesLoading = false;
async function getRecipes(force = false) {
  if (recipesLoading) return;
  if (!force && state.recipes) { renderRecipes(state.recipes); showRecipesState('result'); return; }

  const apiKey = CONFIG?.anthropic?.apiKey;
  if (!apiKey || apiKey.includes('YOUR_')) { showToast('请先配置 Anthropic API Key'); return; }
  if (state.items.length === 0) { showToast('冰箱是空的，请先添加食材'); return; }

  recipesLoading = true;
  showRecipesState('loading');

  try {
    const inventory = buildInventoryPromptData();
    const expiring  = inventory.filter(i => i.freshness.includes('快过期')).map(i => i.name);
    const urgNote   = expiring.length ? `\n\n⚡ 必须优先推荐使用这些即将过期的食材：${expiring.join('、')}` : '';

    const prompt = `你是专业中餐家常菜厨师助手。根据下方冰箱库存推荐 3-5 道今天适合烹饪的菜肴。${urgNote}

【冰箱库存】
${JSON.stringify(inventory, null, 2)}

要求：
• 优先用标注"快过期"的食材，减少食物浪费
• 推荐中式家常菜，难度以简单/中等为主
• missingIngredients 只列关键食材（盐/油/酱油等基础调味料不算）
• steps 提供 4-8 个步骤，每步不超过 30 字
• difficulty 必须是：简单、中等、复杂 之一

只返回如下 JSON 数组，无任何其他文字或 Markdown：
[{"dishName":"","ingredientsUsed":[],"missingIngredients":[],"steps":[],"cookTime":"","difficulty":"简单"}]`;

    const result = await callAnthropicChat(prompt, apiKey);
    if (!Array.isArray(result) || !result.length) throw new Error('未能获取菜谱建议，请重试');
    state.recipes = result;
    renderRecipes(result);
    showRecipesState('result');
  } catch (err) {
    showRecipesState('error', err.message);
  } finally {
    recipesLoading = false;
  }
}

function showRecipesState(s, errMsg) {
  ['intro', 'loading', 'result', 'error'].forEach(n =>
    document.getElementById('recipes-' + n)?.classList.toggle('hidden', n !== s)
  );
  if (s === 'error' && errMsg) document.getElementById('recipes-error-msg').textContent = errMsg;
}

function renderRecipes(recipes) {
  document.getElementById('recipes-label').textContent = `为您推荐 ${recipes.length} 道菜`;
  const expiringNames = state.items
    .filter(i => getFreshness(i.expiry_date).status === 'soon')
    .map(i => i.name);

  document.getElementById('recipes-list').innerHTML = recipes.map((r, idx) => {
    const total = (r.ingredientsUsed?.length || 0) + (r.missingIngredients?.length || 0);
    const have  = r.ingredientsUsed?.length || 0;
    const diffClass = { '简单': 'easy', '中等': 'medium', '复杂': 'hard' }[r.difficulty] || 'easy';

    const haveChips = (r.ingredientsUsed || []).map(ing => {
      const isExpiring = expiringNames.some(n => ing.includes(n) || n.includes(ing));
      return `<span class="ing-chip ${isExpiring ? 'expiring' : 'have'}">✅ ${escHtml(ing)}${isExpiring ? ' ⚡' : ''}</span>`;
    }).join('');
    const missingChips = (r.missingIngredients || []).map(ing =>
      `<span class="ing-chip missing">🛒 ${escHtml(ing)}</span>`
    ).join('');
    const steps = (r.steps || []).map((s, i) =>
      `<div class="recipe-step"><span class="step-bubble">${i + 1}</span><span class="step-text">${escHtml(s)}</span></div>`
    ).join('');

    return `<div class="recipe-card" data-idx="${idx}" data-open="false">
      <button class="recipe-toggle" data-idx="${idx}">
        <div class="recipe-toggle-left">
          <div class="recipe-dish-name">${escHtml(r.dishName)}</div>
          <div class="recipe-tags">
            <span class="recipe-time">⏱ ${escHtml(r.cookTime || '?分钟')}</span>
            <span class="recipe-diff ${diffClass}">${escHtml(r.difficulty || '简单')}</span>
            <span class="recipe-match${have === total ? ' full' : ''}">
              ${have === total ? '✅' : '🧩'} ${have}/${total} 种食材已有
            </span>
          </div>
        </div>
        <svg class="recipe-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="recipe-body">
        <div class="recipe-section">
          <p class="recipe-section-title">所需食材</p>
          <div class="ingredient-chips">${haveChips}${missingChips}</div>
        </div>
        <div class="recipe-section">
          <p class="recipe-section-title">烹饪步骤</p>
          <div class="recipe-steps">${steps}</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ══ Shopping Recommendations ═══════════════════════════
let shoppingLoading = false;
async function getShopping(force = false) {
  if (shoppingLoading) return;
  if (!force && state.shoppingList) { renderShoppingList(state.shoppingList); showShoppingState('result'); return; }

  const apiKey = CONFIG?.anthropic?.apiKey;
  if (!apiKey || apiKey.includes('YOUR_')) { showToast('请先配置 Anthropic API Key'); return; }

  shoppingLoading = true;
  showShoppingState('loading');

  try {
    const inventory = buildInventoryPromptData();
    const rawHistory = await db.fetchHistory(90);
    // Summarise: group by name, count frequency
    const grouped = {};
    rawHistory.forEach(h => {
      if (!grouped[h.name]) grouped[h.name] = { name: h.name, category: h.category, count: 0, lastDate: h.date };
      grouped[h.name].count++;
      if (h.date > grouped[h.name].lastDate) grouped[h.name].lastDate = h.date;
    });
    const history = Object.values(grouped).sort((a, b) => b.count - a.count).slice(0, 20);

    const prompt = `你是营养师兼家庭采购顾问。根据下方信息生成 6-10 条个性化购物建议。

【当前冰箱库存】${inventory.length === 0 ? '（空）' : ''}
${JSON.stringify(inventory, null, 2)}

【近期购买记录摘要（按频次）】${history.length === 0 ? '（暂无）' : ''}
${JSON.stringify(history, null, 2)}

推荐原则：
1. 常买食品若库存不足或已耗尽，建议补充
2. 营养均衡：近期蛋白质（肉类/乳制品）、蔬菜、水果是否充足
3. 某类食物长期缺失则建议补充
4. 不要推荐库存充足的食材

reason 字段 ≤ 15 字，如"常买，已用完"、"近期缺乏蛋白质"。

只返回 JSON 数组，无其他文字：
[{"item":"","reason":"","category":"蔬菜/水果/肉类/乳制品/调料/主食/其他"}]`;

    const result = await callAnthropicChat(prompt, apiKey);
    if (!Array.isArray(result) || !result.length) throw new Error('未能获取建议，请重试');
    state.shoppingList = result;
    renderShoppingList(result);
    showShoppingState('result');
  } catch (err) {
    showShoppingState('error', err.message);
  } finally {
    shoppingLoading = false;
  }
}

function showShoppingState(s, errMsg) {
  ['intro', 'loading', 'result', 'error'].forEach(n =>
    document.getElementById('shopping-' + n)?.classList.toggle('hidden', n !== s)
  );
  if (s === 'error' && errMsg) document.getElementById('shopping-error-msg').textContent = errMsg;
}

function renderShoppingList(list) {
  document.getElementById('shopping-label').textContent = `${list.length} 条采购建议`;
  document.getElementById('shopping-list').innerHTML = list.map(item => {
    const cat = item.category || '其他';
    return `<div class="shop-item">
      <span class="shop-emoji">${catIcon(cat)}</span>
      <div class="shop-info">
        <div class="shop-name">${escHtml(item.item)}</div>
        <div class="shop-reason">${escHtml(item.reason)}</div>
      </div>
      <span class="shop-badge ${escHtml(cat)}">${escHtml(cat)}</span>
    </div>`;
  }).join('');
}

// ══ Shared Anthropic Chat ══════════════════════════════
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
    let msg = `API ${resp.status}`;
    try { const e = await resp.json(); msg = e.error?.message || msg; } catch {}
    throw new Error(msg);
  }
  return parseJsonArray((await resp.json()).content?.[0]?.text || '');
}

function parseJsonArray(text) {
  text = text.trim();
  try { const r = JSON.parse(text); if (Array.isArray(r)) return r; } catch {}
  const m = text.match(/\[[\s\S]*\]/);
  if (m) { try { const r = JSON.parse(m[0]); if (Array.isArray(r)) return r; } catch {} }
  throw new Error('无法解析 AI 返回结果，请重试');
}

// ══ File → Base64 ══════════════════════════════════════
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ base64: reader.result.split(',')[1], mime: file.type || 'image/jpeg' });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ══ Toast ══════════════════════════════════════════════
let _toastTimer;
function showToast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.style.display = 'block';
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { if (el) el.style.display = 'none'; }, 2600);
}

// ══ Config Check ══════════════════════════════════════
function isConfigured() {
  return typeof CONFIG !== 'undefined'
    && CONFIG.supabase?.url
    && !CONFIG.supabase.url.includes('YOUR_')
    && CONFIG.supabase?.anonKey
    && !CONFIG.supabase.anonKey.includes('YOUR_');
}

// ══ Init ══════════════════════════════════════════════
async function init() {
  if (!isConfigured()) {
    document.getElementById('screen-loading').classList.add('hidden');
    document.getElementById('screen-setup').classList.remove('hidden');
    return;
  }

  // Init Supabase
  sb = window.supabase.createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey);

  // Show main screen
  document.getElementById('screen-loading').classList.add('hidden');
  document.getElementById('screen-main').classList.remove('hidden');
  document.getElementById('screen-main').dataset.view = 'inventory';

  await loadInventory();

  // ── Nav tabs ──
  document.querySelectorAll('.nav-tab').forEach(tab =>
    tab.addEventListener('click', () => switchView(tab.dataset.view))
  );

  // ── Filter pills ──
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.filter = pill.dataset.filter;
      renderInventory();
    });
  });

  // ── View toggle (grid/list) ──
  document.getElementById('btn-toggle-view').addEventListener('click', () => {
    state.viewMode = state.viewMode === 'grid' ? 'list' : 'grid';
    document.getElementById('icon-grid').classList.toggle('hidden', state.viewMode === 'list');
    document.getElementById('icon-list').classList.toggle('hidden', state.viewMode === 'grid');
    renderInventory();
  });

  // ── Item container (delegated) ──
  document.getElementById('item-container').addEventListener('click', e => {
    const card = e.target.closest('[data-id]');
    if (card) openEditForm(card.dataset.id);
  });

  // ── Add buttons ──
  document.getElementById('btn-add').addEventListener('click', openAddForm);
  document.getElementById('btn-add-empty').addEventListener('click', openAddForm);

  // ── Item form ──
  document.getElementById('form-item').addEventListener('submit', handleFormSubmit);
  document.getElementById('btn-close-item').addEventListener('click', () => closeSheet('sheet-item'));
  document.getElementById('btn-delete-item').addEventListener('click', handleDeleteItem);
  document.getElementById('input-category').addEventListener('change', e => {
    const pd = document.getElementById('input-purchase-date').value || todayStr();
    document.getElementById('input-expiry-date').value = addDays(pd, CATEGORIES[e.target.value]?.expiry ?? 14);
  });

  // ── Scan: upload zone click ──
  document.getElementById('upload-zone').addEventListener('click', () => {
    document.getElementById('file-input').value = '';
    document.getElementById('file-input').click();
  });

  // ── Scan: file selected ──
  document.getElementById('file-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const { base64, mime } = await readFileAsBase64(file);
      state.scanImage = base64; state.scanMime = mime;
      document.getElementById('scan-preview-img').src = `data:${mime};base64,${base64}`;
      document.getElementById('upload-zone').classList.add('hidden');
      document.getElementById('scan-preview-wrap').classList.remove('hidden');
    } catch { showToast('图片读取失败'); }
  });

  // ── Scan: do scan ──
  document.getElementById('btn-do-scan').addEventListener('click', performScan);
  document.getElementById('btn-reselect').addEventListener('click', () => { resetScanUpload(); });
  document.getElementById('btn-rescan').addEventListener('click', () => { resetScanUpload(); showScanStep('upload'); });
  document.getElementById('btn-confirm-import').addEventListener('click', confirmImport);
  document.getElementById('btn-scan-retry').addEventListener('click', () => { resetScanUpload(); showScanStep('upload'); });

  // ── Recipes ──
  document.getElementById('btn-get-recipes').addEventListener('click', () => getRecipes(true));
  document.getElementById('btn-refresh-recipes').addEventListener('click', () => getRecipes(true));
  document.getElementById('btn-retry-recipes').addEventListener('click', () => getRecipes(true));
  document.getElementById('recipes-list').addEventListener('click', e => {
    const btn = e.target.closest('[data-idx]');
    if (!btn) return;
    const card = document.querySelector(`.recipe-card[data-idx="${btn.dataset.idx}"]`);
    if (card) card.dataset.open = card.dataset.open === 'true' ? 'false' : 'true';
  });

  // ── Shopping ──
  document.getElementById('btn-get-shopping').addEventListener('click', () => getShopping(true));
  document.getElementById('btn-refresh-shopping').addEventListener('click', () => getShopping(true));
  document.getElementById('btn-retry-shopping').addEventListener('click', () => getShopping(true));

  // ── Backdrop ──
  document.getElementById('modal-backdrop').addEventListener('click', () => closeSheet('sheet-item'));
}

document.addEventListener('DOMContentLoaded', init);
