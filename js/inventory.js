// ============================================================
// INVENTORY — items, restock, usage, adjustments, history, valuation
// ============================================================
let invPage = 1;
const INV_PER_PAGE = 20;

function activeInventory() { return State.inventory.filter(i => !isArchived(i)); }

function renderInventory() {
  const q = (document.getElementById('invSearch').value || '').toLowerCase();
  const cat = document.getElementById('invCatFilter').value;
  const stockFilter = document.getElementById('invStockFilter').value;

  let list = activeInventory().filter(it => {
    if (cat && (it.category || '') !== cat) return false;
    const cur = Number(it.currentStock) || 0;
    const min = Number(it.minStock) || 0;
    if (stockFilter === 'low' && !(cur > 0 && cur <= min)) return false;
    if (stockFilter === 'out' && cur > 0) return false;
    if (q) {
      const hay = [it.sku, it.name, it.description, it.category, it.location, (it.supplierName || '')].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // Summary
  const invValue = sumBy(list, it => (Number(it.currentStock) || 0) * (Number(it.costPerUnit) || 0));
  const lowStock = list.filter(it => { const c = Number(it.currentStock) || 0; return c > 0 && c <= (Number(it.minStock) || 0); });
  const outStock = list.filter(it => (Number(it.currentStock) || 0) <= 0);
  document.getElementById('invSummary').innerHTML = `
    <div class="stat-card blue"><div class="lbl">Inventory Value</div><div class="val sm">${fmtMoney(invValue)}</div><div class="note">${list.length} items shown</div></div>
    <div class="stat-card orange"><div class="lbl">Low Stock</div><div class="val sm">${lowStock.length}</div><div class="note">items at or below minimum</div></div>
    <div class="stat-card red"><div class="lbl">Out of Stock</div><div class="val sm">${outStock.length}</div><div class="note">items with zero stock</div></div>`;

  const totalPages = Math.max(1, Math.ceil(list.length / INV_PER_PAGE));
  if (invPage > totalPages) invPage = totalPages;
  const pageItems = list.slice((invPage - 1) * INV_PER_PAGE, invPage * INV_PER_PAGE);
  const canEdit = canWrite();

  const rows = pageItems.map(it => {
    const cur = Number(it.currentStock) || 0;
    const min = Number(it.minStock) || 0;
    const max = Number(it.maxStock) || 0;
    const val = cur * (Number(it.costPerUnit) || 0);
    const pct = max > 0 ? Math.min(100, (cur / max) * 100) : 100;
    return `<tr>
      <td>${escapeHtml(it.sku || '—')}</td>
      <td><b>${escapeHtml(it.name || '')}</b>${it.description ? `<div class="muted">${escapeHtml(it.description)}</div>` : ''}</td>
      <td>${escapeHtml(it.category || '')}</td>
      <td>${escapeHtml(it.unit || 'pc')}</td>
      <td><div class="flex" style="gap:6px"><span style="font-weight:800">${fmtNum(cur)}</span><div class="progress"><div class="bar" style="width:${pct}%;background:${cur <= 0 ? 'var(--red)' : cur <= min ? 'var(--orange)' : 'var(--green)'}"></div></div></div></td>
      <td>${stockBadge(cur, min)}</td>
      <td class="num">${fmtMoney(it.costPerUnit)}</td>
      <td class="num">${fmtMoney(it.sellingPrice)}</td>
      <td class="num">${fmtMoney(val)}</td>
      <td>${escapeHtml(it.supplierName || '—')}</td>
      <td>${it.lastRestockDate ? escapeHtml(fmtDate(it.lastRestockDate)) : '—'}</td>
      ${canEdit ? `<td><button class="btn btn-outline btn-sm" onclick="openRestockModal('${it.id}')">+ Stock</button> <button class="btn btn-outline btn-sm" onclick="editInvItem('${it.id}')">✎</button> <button class="btn btn-danger btn-sm" onclick="deleteInvItem('${it.id}')">🗑</button></td>` : ''}
    </tr>`;
  }).join('');
  const mcards = pageItems.map(it => {
    const cur = Number(it.currentStock) || 0;
    const min = Number(it.minStock) || 0;
    const val = cur * (Number(it.costPerUnit) || 0);
    return `<div class="mcard ${cur <= 0 ? 'expense' : cur <= min ? '' : 'income'}">
      <div class="m-top"><span class="m-title">${escapeHtml(it.name || '')}</span>${stockBadge(cur, min)}</div>
      <div class="m-sub">${escapeHtml(it.category || '')} · ${escapeHtml(it.unit || 'pc')} · ${escapeHtml(it.sku || '')}</div>
      <div class="m-amt">${fmtNum(cur)} ${escapeHtml(it.unit || '')}</div>
      <div class="m-sub">Cost ${fmtMoney(it.costPerUnit)} · Value ${fmtMoney(val)}</div>
      <div class="m-actions">${canEdit ? `<button class="btn btn-outline btn-sm" onclick="openRestockModal('${it.id}')">+ Stock</button><button class="btn btn-outline btn-sm" onclick="editInvItem('${it.id}')">✎</button><button class="btn btn-danger btn-sm" onclick="deleteInvItem('${it.id}')">🗑</button>` : ''}</div>
    </div>`;
  }).join('');

  document.getElementById('invList').innerHTML = `
    <div class="tbl-wrap desktop-table"><table class="tbl">
      <thead><tr><th>SKU</th><th>Item</th><th>Category</th><th>Unit</th><th>Stock</th><th>Status</th><th class="num">Cost/Unit</th><th class="num">Sell Price</th><th class="num">Value</th><th>Supplier</th><th>Last Restock</th>${canEdit ? '<th>Actions</th>' : ''}</tr></thead>
      <tbody>${rows || `<tr><td colspan="12">${emptyState('📦', 'No inventory items', 'Add items to get started')}</td></tr>`}</tbody>
    </table></div>
    <div class="mobile-cards">${mcards || emptyState('📦', 'No inventory items')}</div>
    ${makePager(list.length, invPage, INV_PER_PAGE, 'invGoPage')}`;
}
function invGoPage(p) { invPage = p; renderInventory(); }

function populateInvCatFilter() {
  const cats = [...new Set(activeInventory().map(i => i.category).filter(Boolean))];
  const sel = document.getElementById('invCatFilter');
  const cur = sel.value;
  sel.innerHTML = '<option value="">All Categories</option>' + cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  if (cur) sel.value = cur;
}

// ---- Item modal ----
function openInvItemModal(existing) {
  if (!guardWrite()) return;
  const isEdit = !!existing;
  const it = existing || {};
  const suppliers = State.suppliers;
  openModal(isEdit ? '✎ Edit Inventory Item' : '+ Add Inventory Item', `
    <div class="form-grid">
      <div class="field"><label>SKU / Item ID</label><input type="text" id="invSku" value="${escapeHtml(it.sku || '')}" placeholder="e.g., TARP-001"></div>
      <div class="field"><label>Material Name *</label><input type="text" id="invName" value="${escapeHtml(it.name || '')}" placeholder="e.g., Tarpaulin Roll"></div>
      <div class="field"><label>Category</label><input type="text" id="invCat" value="${escapeHtml(it.category || '')}" placeholder="e.g., Materials"></div>
      <div class="field"><label>Unit</label><select id="invUnit">${INVENTORY_UNITS.map(u => `<option ${it.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
      <div class="field"><label>Current Stock</label><input type="number" id="invCurrent" value="${it.currentStock ?? 0}" min="0" step="any"></div>
      <div class="field"><label>Minimum Stock</label><input type="number" id="invMin" value="${it.minStock ?? 0}" min="0" step="any"></div>
      <div class="field"><label>Maximum Stock</label><input type="number" id="invMax" value="${it.maxStock ?? 0}" min="0" step="any"></div>
      <div class="field"><label>Cost Per Unit (₱)</label><input type="number" id="invCost" value="${it.costPerUnit ?? ''}" min="0" step="0.01"></div>
      <div class="field"><label>Selling Price (₱)</label><input type="number" id="invSell" value="${it.sellingPrice ?? ''}" min="0" step="0.01"></div>
      <div class="field"><label>Supplier</label>
        <select id="invSupplier">
          <option value="">— None —</option>
          ${suppliers.map(s => `<option value="${escapeHtml(s.name)}" ${it.supplierName === s.name ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Storage Location</label><input type="text" id="invLoc" value="${escapeHtml(it.location || '')}" placeholder="e.g., Shelf A"></div>
      <div class="field full"><label>Description</label><textarea id="invDesc">${escapeHtml(it.description || '')}</textarea></div>
      <div class="field full"><label>Notes</label><textarea id="invNotes">${escapeHtml(it.notes || '')}</textarea></div>
    </div>
  `,
  `<button class="btn btn-gray btn-sm" onclick="closeModal()">Cancel</button>
   <button class="btn btn-yellow btn-sm" id="saveInvBtn">${isEdit ? '💾 Save Changes' : '✅ Add Item'}</button>`
  );
  document.getElementById('saveInvBtn').onclick = () => saveInvItem(existing);
}
async function saveInvItem(existing) {
  if (!guardWrite()) return;
  if (!busyStart()) return;
  const btn = document.getElementById('saveInvBtn');
  if (btn) btn.disabled = true;
  try {
  const name = document.getElementById('invName').value.trim();
  if (!name) { showToast('Item name is required', 'error'); return; }
  const current = parseFloat(document.getElementById('invCurrent').value) || 0;
  if (current < 0 || current > 999999999) { showToast('Invalid stock value', 'error'); return; }
  const data = {
    sku: document.getElementById('invSku').value.trim(),
    name: name,
    category: document.getElementById('invCat').value.trim(),
    unit: document.getElementById('invUnit').value,
    currentStock: round2(current),
    minStock: Math.max(0, round2(parseFloat(document.getElementById('invMin').value) || 0)),
    maxStock: Math.max(0, round2(parseFloat(document.getElementById('invMax').value) || 0)),
    costPerUnit: round2(parseFloat(document.getElementById('invCost').value) || 0),
    sellingPrice: round2(parseFloat(document.getElementById('invSell').value) || 0),
    supplierName: document.getElementById('invSupplier').value || '',
    location: document.getElementById('invLoc').value.trim(),
    description: document.getElementById('invDesc').value.trim(),
    notes: document.getElementById('invNotes').value.trim(),
    archived: false,
    updatedAt: nowTS()
  };
    if (existing) {
      await db.collection(COLL.inventory).doc(existing.id).update(data);
      await logAudit('edited', 'inventory_item', existing.id, null, { name });
      showToast('Item updated ✓', 'success');
    } else {
      data.createdAt = nowTS();
      data.initialStock = current;
      data.totalPurchased = current;
      data.totalUsed = 0;
      data.totalAdjustments = 0;
      const ref = await db.collection(COLL.inventory).add(data);
      await logAudit('created', 'inventory_item', ref.id, null, { name });
      showToast('Item added ✓', 'success');
    }
    closeModal();
    renderInventory(); populateInvCatFilter();
  } catch (e) { console.error(e); showToast(friendlyError(e, 'Unable to save item. Please try again.'), 'error'); }
  finally { busyEnd(); if (btn) btn.disabled = false; }
}
function editInvItem(id) {
  const it = State.inventory.find(x => x.id === id);
  if (it) openInvItemModal(it);
}
function deleteInvItem(id) {
  if (!guardWrite()) return;
  const it = State.inventory.find(x => x.id === id);
  confirmDelete(`Archive inventory item "${it ? it.name : ''}"? It will be hidden from the list but history records stay readable.`, async () => {
    try {
      // Soft delete (archive): keeps historical movements meaningful and allows restore
      await db.collection(COLL.inventory).doc(id).update({ archived: true, archivedAt: nowTS() });
      await logAudit('deleted', 'inventory_item', id, null, { name: it ? it.name : '' });
      showToast('Item archived', 'success');
      renderInventory(); populateInvCatFilter();
    } catch (e) { showToast(friendlyError(e, 'Delete failed. Please try again.'), 'error'); }
  });
}

// ---- Inventory transactions (restock / usage / sold / damaged / lost / adjustment) ----
function openRestockModal(itemId) {
  if (!guardWrite()) return;
  const items = activeInventory();
  const preset = itemId ? items.find(i => i.id === itemId) : null;
  openModal('+ Restock Inventory', `
    <div class="form-grid">
      <div class="field full"><label>Item *</label><select id="txItem" onchange="showTxItemInfo()">
        ${items.map(i => `<option value="${i.id}" ${preset && preset.id === i.id ? 'selected' : ''}>${escapeHtml(i.name)} — stock: ${fmtNum(i.currentStock)} ${escapeHtml(i.unit || '')}</option>`).join('')}
      </select></div>
      <div class="field"><label>Quantity to Restock *</label><input type="number" id="txQty" min="0" step="any" value=""></div>
      <div class="field"><label>Date</label><input type="date" id="txDate" value="${dateInputVal(new Date())}"></div>
      <div class="field"><label>Cost per unit (₱)</label><input type="number" id="txCost" min="0" step="0.01" value="" placeholder="for stock valuation"></div>
      <div class="field full"><label>Notes</label><input type="text" id="txNotes" placeholder="e.g., from supplier"></div>
      <div class="field full">
        <label class="flex" style="gap:8px"><input type="checkbox" id="txAsExpense" checked> Mark as business expense (Materials category)</label>
      </div>
    </div>
    <div id="txItemInfo" class="mt-8" style="padding:10px;background:var(--gray-100);border-radius:8px;font-size:12.5px"></div>
  `,
  `<button class="btn btn-gray btn-sm" onclick="closeModal()">Cancel</button>
   <button class="btn btn-green btn-sm" id="saveTxBtn">✅ Restock</button>`
  );
  document.getElementById('saveTxBtn').onclick = () => saveInvTx('restock');
  showTxItemInfo();
}
function openInvTxModal() {
  if (!guardWrite()) return;
  openModal('+ Use / Adjust Inventory', `
    <div class="form-grid">
      <div class="field full"><label>Item *</label><select id="txItem" onchange="showTxItemInfo()">
        ${activeInventory().map(i => `<option value="${i.id}">${escapeHtml(i.name)} — stock: ${fmtNum(i.currentStock)} ${escapeHtml(i.unit || '')}</option>`).join('')}
      </select></div>
      <div class="field"><label>Transaction Type *</label><select id="txType">
        <option value="usage">Usage (used in production)</option>
        <option value="sold">Sold</option>
        <option value="damaged">Damaged</option>
        <option value="lost">Lost</option>
        <option value="adjustment">Adjustment (+/-)</option>
      </select></div>
      <div class="field"><label>Quantity *</label><input type="number" id="txQty" step="any" value="" placeholder="+ dagdag / − bawas"></div>
      <div class="field"><label>Date</label><input type="date" id="txDate" value="${dateInputVal(new Date())}"></div>
      <div class="field"><label>Related Project</label><select id="txProject">
        <option value="">— None —</option>
        ${State.projects.filter(p => p.status !== 'Cancelled').map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
      </select></div>
      <div class="field full"><label>Notes</label><input type="text" id="txNotes" placeholder="e.g., used for school uniform project"></div>
      <div class="field full"><label class="flex" style="gap:8px"><input type="checkbox" id="txAsExpense"> Mark as business expense</label></div>
    </div>
    <div id="txItemInfo" class="mt-8" style="padding:10px;background:var(--gray-100);border-radius:8px;font-size:12.5px"></div>
  `,
  `<button class="btn btn-gray btn-sm" onclick="closeModal()">Cancel</button>
   <button class="btn btn-blue btn-sm" id="saveTxBtn">✅ Save Movement</button>`
  );
  document.getElementById('saveTxBtn').onclick = () => saveInvTx(null);
  showTxItemInfo();
}
function showTxItemInfo() {
  const sel = document.getElementById('txItem');
  const info = document.getElementById('txItemInfo');
  if (!sel || !info) return;
  const it = State.inventory.find(x => x.id === sel.value);
  info.innerHTML = it ? `Current stock: <b>${fmtNum(it.currentStock)} ${escapeHtml(it.unit || '')}</b> · Min: ${fmtNum(it.minStock)} · Max: ${fmtNum(it.maxStock)} · Cost/unit: ${fmtMoney(it.costPerUnit)}` : 'No item selected';
}
// Pure stock math (testable): computes new stock + validation.
// Never silently clamps to zero; blocks insufficient stock unless type==='adjustment'.
class StockError extends Error {
  constructor(msg) { super(msg); this.name = 'StockError'; this.friendly = msg; }
}
function computeStockUpdate(prevStock, type, qtyRaw, costPerUnit) {
  const prev = Number(prevStock) || 0;
  const qty = Number(qtyRaw) || 0;
  if (!isFinite(qty) || qty === 0) return { ok: false, error: 'Enter a valid quantity' };
  let newStock, signedQty;
  if (type === 'restock') {
    if (qty <= 0) return { ok: false, error: 'Restock quantity must be positive' };
    newStock = prev + qty; signedQty = qty;
  } else if (type === 'adjustment') {
    // adjustment is the AUTHORIZED way to fix stock; still never below zero
    newStock = prev + qty; signedQty = qty;
  } else { // usage / sold / damaged / lost
    if (qty <= 0) return { ok: false, error: 'Quantity must be positive for this type' };
    if (qty > prev) return { ok: false, error: `Insufficient stock. Available stock: ${fmtNum(prev)}.` };
    newStock = prev - qty; signedQty = -qty;
  }
  if (newStock < 0) return { ok: false, error: 'Stock cannot go below zero. Use an authorized adjustment.' };
  newStock = round2(newStock);
  return { ok: true, prevStock: prev, newStock, signedQty, qty };
}
async function saveInvTx(forcedType) {
  if (!guardWrite()) return;
  if (!busyStart()) return;
  const btn = document.getElementById('saveTxBtn');
  if (btn) btn.disabled = true;
  try {
    const itemId = document.getElementById('txItem').value;
    const item = State.inventory.find(x => x.id === itemId);
    if (!item) { showToast('Select an item', 'error'); return; }
    const type = forcedType || document.getElementById('txType').value;
    const qtyRaw = parseFloat(document.getElementById('txQty').value);
    const date = parseDateInput(document.getElementById('txDate').value) || new Date();
    const notes = document.getElementById('txNotes').value.trim();
    const projectId = document.getElementById('txProject') ? document.getElementById('txProject').value : '';
    const asExpense = document.getElementById('txAsExpense') ? document.getElementById('txAsExpense').checked : false;
    let costPerUnit = Number(item.costPerUnit) || 0;
    if (type === 'restock') costPerUnit = round2(parseFloat(document.getElementById('txCost').value)) || costPerUnit;
    const projectName = projectId ? (() => { const p = State.projects.find(x => x.id === projectId); return p ? p.name : ''; })() : '';
    if (qtyRaw > 999999999 || costPerUnit > 999999999) { showToast('Amount too large', 'error'); return; }

    // ATOMIC transaction: read stock + validate + update + record movement — all-or-nothing.
    // Two devices updating the same item are serialized by Firestore (no lost updates).
    const result = await db.runTransaction(async (t) => {
      const itemRef = db.collection(COLL.inventory).doc(itemId);
      const snap = await t.get(itemRef);
      if (!snap.exists) throw new StockError('Item no longer exists. Refresh and try again.');
      const liveItem = snap.data();
      const calc = computeStockUpdate(liveItem.currentStock, type, qtyRaw, costPerUnit);
      if (!calc.ok) throw new StockError(calc.error);

      const itemUpdate = { currentStock: calc.newStock, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
      if (type === 'restock') {
        itemUpdate.totalPurchased = (Number(liveItem.totalPurchased) || 0) + calc.qty;
        itemUpdate.costPerUnit = costPerUnit;
        itemUpdate.lastRestockDate = firebase.firestore.Timestamp.fromDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0));
      } else if (type === 'usage' || type === 'sold') { itemUpdate.totalUsed = (Number(liveItem.totalUsed) || 0) + calc.qty; }
      else if (type === 'adjustment') { itemUpdate.totalAdjustments = (Number(liveItem.totalAdjustments) || 0) + calc.qty; }
      t.update(itemRef, itemUpdate);

      // movement record — unique id reserved inside the transaction
      const txRef = db.collection(COLL.invTx).doc();
      const txData = {
        itemId: itemId,
        itemName: item.name,
        type: type,
        qty: calc.qty,
        signedQty: calc.signedQty,
        prevStock: calc.prevStock,
        newStock: calc.newStock,
        projectId: projectId || '',
        projectName: projectName,
        unit: item.unit || '',
        costPerUnit: costPerUnit,
        totalCost: round2(calc.qty * costPerUnit),
        notes: notes,
        userId: currentUser.uid,
        userName: currentUserDoc ? (currentUserDoc.name || currentUser.email) : '',
        date: firebase.firestore.Timestamp.fromDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      t.set(txRef, txData);
      return { txId: txRef.id, calc, costPerUnit };
    });

    await logAudit(type, 'inventory_tx', result.txId, { prevStock: result.calc.prevStock }, { newStock: result.calc.newStock, qty: result.calc.qty });

    // 3. Restock -> optional expense, linked by UNIQUE inventoryTransactionId.
    //    No time-window dedup: two legitimate restocks on the same day both record.
    if (type === 'restock') {
      if (asExpense && result.costPerUnit > 0) {
        const totalCost = round2(result.calc.qty * result.costPerUnit);
        const already = State.expenses.find(e => e.inventoryTransactionId === result.txId);
        if (!already) {
          const expenseRef = await db.collection(COLL.expenses).add({
            expenseId: uniqueBizId('E', date, State.expenses.map(e => e.expenseId).filter(Boolean)),
            date: firebase.firestore.Timestamp.fromDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)),
            category: 'Materials',
            description: `Restock: ${item.name} (${fmtNum(result.calc.qty)} ${item.unit || ''})`,
            amount: totalCost,
            paymentMethod: 'Cash',
            supplierName: item.supplierName || '',
            projectId: projectId || '',
            receiptNo: '',
            notes: `RESTOCK:${itemId}:${result.txId}`,
            inventoryTransactionId: result.txId,
            archived: false,
            createdAt: nowTS()
          });
          await logAudit('restock_expense', 'expense', expenseRef.id, null, { amount: totalCost });
          showToast(`Expense recorded: ${fmtMoney(totalCost)}`, 'success');
        }
      }
    }

    // 4. Usage -> project expense (material cost) if project linked — dedup by unique marker
    if ((type === 'usage' || type === 'sold') && projectId && result.costPerUnit > 0) {
      const totalCost = round2(result.calc.qty * result.costPerUnit);
      const marker = `INV:${itemId}:${result.txId}`;
      const dupe = State.projExp.find(pe => pe.projectId === projectId && pe.marker === marker);
      if (!dupe) {
        await db.collection(COLL.projExp).add({
          projectId: projectId,
          category: 'Material',
          description: `Material: ${item.name} (${fmtNum(result.calc.qty)} ${item.unit || ''})`,
          amount: totalCost,
          date: firebase.firestore.Timestamp.fromDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)),
          marker: marker,
          inventoryTxId: result.txId,
          archived: false,
          createdAt: nowTS()
        });
      }
    }

    closeModal();
    renderInventory(); renderInvHistory();
    showToast('Stock updated ✓', 'success');
  } catch (e) {
    console.error(e);
    const msg = (e && e.friendly) ? e.friendly : friendlyError(e, 'Unable to update inventory. Please try again.');
    showToast(msg, 'error');
  } finally {
    busyEnd();
    if (btn) btn.disabled = false;
  }
}

// ---- Inventory history ----
function renderInvHistory() {
  const el = document.getElementById('invHistory');
  if (!el) return;
  const txs = [...State.invTx].sort((a, b) => (tsToDate(b.createdAt) || 0) - (tsToDate(a.createdAt) || 0)).slice(0, 50);
  if (!txs.length) { el.innerHTML = emptyState('⏱', 'No inventory movements yet'); return; }
  const typeLabel = { restock: ['+ Restock', 'green'], usage: ['− Usage', 'blue'], sold: ['− Sold', 'blue'], damaged: ['− Damaged', 'red'], lost: ['− Lost', 'red'], adjustment: ['± Adjustment', 'orange'] };
  const projName = t => { if (t.projectName) return t.projectName; const p = State.projects.find(x => x.id === t.projectId); return p ? p.name : ''; };
  el.innerHTML = `<div class="tbl-wrap"><table class="tbl" style="min-width:520px">
    <thead><tr><th>Date</th><th>Item</th><th>Type</th><th class="num">Qty</th><th class="num">Before</th><th class="num">After</th><th>User</th><th>Project</th></tr></thead>
    <tbody>${txs.map(t => {
      const [lbl, cls] = typeLabel[t.type] || [t.type, 'gray'];
      return `<tr>
        <td>${escapeHtml(fmtDateTime(t.date || t.createdAt))}</td>
        <td>${escapeHtml(t.itemName || '')}</td>
        <td><span class="badge ${cls}">${lbl}</span></td>
        <td class="num">${t.signedQty !== undefined ? fmtNum(t.signedQty) : fmtNum(t.qty)}</td>
        <td class="num">${fmtNum(t.prevStock)}</td>
        <td class="num"><b>${fmtNum(t.newStock)}</b></td>
        <td>${escapeHtml(t.userName || '—')}</td>
        <td>${t.projectId ? escapeHtml(projName(t) || '—') : '—'}</td>
      </tr>`;
    }).join('')}
    </tbody></table></div>`;
}

// ---- CSV export ----
function exportInventoryCSV() {
  const rows = [['SKU', 'Item', 'Category', 'Unit', 'Current Stock', 'Min Stock', 'Max Stock', 'Cost/Unit', 'Selling Price', 'Inventory Value', 'Supplier', 'Location', 'Last Restock']];
  activeInventory().forEach(it => rows.push([
    it.sku || '', it.name || '', it.category || '', it.unit || '',
    it.currentStock, it.minStock, it.maxStock, it.costPerUnit, it.sellingPrice,
    (Number(it.currentStock) || 0) * (Number(it.costPerUnit) || 0), it.supplierName || '', it.location || '',
    it.lastRestockDate ? fmtDate(it.lastRestockDate) : ''
  ]));
  downloadCSV('jb-inventory.csv', rows);
}
