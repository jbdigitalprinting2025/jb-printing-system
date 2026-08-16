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
  const name = document.getElementById('invName').value.trim();
  if (!name) { showToast('Item name is required', 'error'); return; }
  const current = parseFloat(document.getElementById('invCurrent').value) || 0;
  const data = {
    sku: document.getElementById('invSku').value.trim(),
    name: name,
    category: document.getElementById('invCat').value.trim(),
    unit: document.getElementById('invUnit').value,
    currentStock: current,
    minStock: parseFloat(document.getElementById('invMin').value) || 0,
    maxStock: parseFloat(document.getElementById('invMax').value) || 0,
    costPerUnit: parseFloat(document.getElementById('invCost').value) || 0,
    sellingPrice: parseFloat(document.getElementById('invSell').value) || 0,
    supplierName: document.getElementById('invSupplier').value || '',
    location: document.getElementById('invLoc').value.trim(),
    description: document.getElementById('invDesc').value.trim(),
    notes: document.getElementById('invNotes').value.trim(),
    archived: false,
    updatedAt: nowTS()
  };
  try {
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
  } catch (e) { console.error(e); showToast('Error: ' + (e.message || ''), 'error'); }
}
function editInvItem(id) {
  const it = State.inventory.find(x => x.id === id);
  if (it) openInvItemModal(it);
}
function deleteInvItem(id) {
  if (!guardWrite()) return;
  const it = State.inventory.find(x => x.id === id);
  confirmDelete(`Delete inventory item "${it ? it.name : ''}"? History records will be kept.`, async () => {
    try {
      await db.collection(COLL.inventory).doc(id).delete();
      await logAudit('deleted', 'inventory_item', id, null, { name: it ? it.name : '' });
      showToast('Item deleted', 'success');
      renderInventory(); populateInvCatFilter();
    } catch (e) { showToast('Delete failed: ' + (e.message || ''), 'error'); }
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
async function saveInvTx(forcedType) {
  if (!guardWrite()) return;
  const itemId = document.getElementById('txItem').value;
  const item = State.inventory.find(x => x.id === itemId);
  if (!item) { showToast('Select an item', 'error'); return; }
  const type = forcedType || document.getElementById('txType').value;
  const qtyRaw = parseFloat(document.getElementById('txQty').value);
  if (isNaN(qtyRaw) || qtyRaw === 0) { showToast('Enter a valid quantity', 'error'); return; }
  if (qtyRaw < 0 && type !== 'adjustment') { showToast('Quantity must be positive for this type', 'error'); return; }
  const date = parseDateInput(document.getElementById('txDate').value) || new Date();
  const notes = document.getElementById('txNotes').value.trim();
  const projectId = document.getElementById('txProject') ? document.getElementById('txProject').value : '';
  const prevStock = Number(item.currentStock) || 0;

  let newStock;
  let signedQty;
  let costPerUnit = Number(item.costPerUnit) || 0;
  if (type === 'restock') {
    costPerUnit = parseFloat(document.getElementById('txCost').value) || costPerUnit;
    newStock = prevStock + qtyRaw;
    signedQty = qtyRaw;
  } else if (type === 'adjustment') {
    // qty is the change; if user wants absolute, we treat qty as signed change
    newStock = Math.max(0, prevStock + qtyRaw);
    signedQty = qtyRaw;
    if (document.getElementById('txType') && document.getElementById('txType').value === 'adjustment' && newStock !== prevStock + qtyRaw) {
      // clamped
    }
  } else {
    if (prevStock < qtyRaw) {
      const ok = confirm(`Stock is only ${fmtNum(prevStock)} — proceed anyway (will go to 0)?`);
      if (!ok) return;
    }
    newStock = Math.max(0, prevStock - qtyRaw);
    signedQty = -qtyRaw;
  }

  try {
    // 1. Update item stock + totals
    const itemUpdate = { currentStock: newStock, updatedAt: nowTS() };
    if (type === 'restock') {
      itemUpdate.totalPurchased = (Number(item.totalPurchased) || 0) + qtyRaw;
      itemUpdate.costPerUnit = costPerUnit;
      itemUpdate.lastRestockDate = firebase.firestore.Timestamp.fromDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0));
    } else if (type === 'usage') { itemUpdate.totalUsed = (Number(item.totalUsed) || 0) + qtyRaw; }
    else if (type === 'sold') { itemUpdate.totalUsed = (Number(item.totalUsed) || 0) + qtyRaw; }
    else if (type === 'adjustment') { itemUpdate.totalAdjustments = (Number(item.totalAdjustments) || 0) + qtyRaw; }
    await db.collection(COLL.inventory).doc(itemId).update(itemUpdate);

    // 2. Record history
    const txData = {
      itemId: itemId,
      itemName: item.name,
      type: type,
      qty: qtyRaw,
      signedQty: signedQty,
      prevStock: prevStock,
      newStock: newStock,
      projectId: projectId || '',
      notes: notes,
      userId: currentUser.uid,
      userName: currentUserDoc ? (currentUserDoc.name || currentUser.email) : '',
      date: firebase.firestore.Timestamp.fromDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)),
      createdAt: nowTS()
    };
    const txRef = await db.collection(COLL.invTx).add(txData);
    await logAudit(type, 'inventory_tx', txRef.id, { prevStock }, { newStock, qty: qtyRaw });

    // 3. Restock -> optional expense
    if (type === 'restock') {
      const asExpense = document.getElementById('txAsExpense') ? document.getElementById('txAsExpense').checked : false;
      if (asExpense && costPerUnit > 0) {
        const totalCost = qtyRaw * costPerUnit;
        // avoid duplicates: check recent restock expense for same item+date
        const dupe = activeExpenses().find(e =>
          e.category === 'Materials' &&
          e.notes && e.notes.includes(`RESTOCK:${itemId}`) &&
          tsToDate(e.date) && Math.abs(tsToDate(e.date).getTime() - date.getTime()) < 86400000
        );
        if (!dupe) {
          await db.collection(COLL.expenses).add({
            expenseId: `E-${Date.now().toString(36).toUpperCase()}`,
            date: firebase.firestore.Timestamp.fromDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)),
            category: 'Materials',
            description: `Restock: ${item.name} (${fmtNum(qtyRaw)} ${item.unit || ''})`,
            amount: totalCost,
            paymentMethod: 'Cash',
            supplierName: item.supplierName || '',
            projectId: projectId || '',
            receiptNo: '',
            notes: `RESTOCK:${itemId}`,
            archived: false,
            createdAt: nowTS()
          });
          showToast(`Expense recorded: ${fmtMoney(totalCost)}`, 'success');
        }
      }
    }

    // 4. Usage -> project expense (material cost) if project linked
    if ((type === 'usage' || type === 'sold') && projectId && costPerUnit > 0) {
      const totalCost = qtyRaw * costPerUnit;
      // avoid double count: check existing project expense with same marker
      const dupe = State.projExp.find(pe => pe.projectId === projectId && pe.marker === `INV:${itemId}:${txRef.id}`);
      if (!dupe) {
        await db.collection(COLL.projExp).add({
          projectId: projectId,
          category: 'Material',
          description: `Material: ${item.name} (${fmtNum(qtyRaw)} ${item.unit || ''})`,
          amount: totalCost,
          date: firebase.firestore.Timestamp.fromDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)),
          marker: `INV:${itemId}:${txRef.id}`,
          inventoryTxId: txRef.id,
          createdAt: nowTS()
        });
      }
    }

    closeModal();
    renderInventory(); renderInvHistory();
    showToast('Stock updated ✓', 'success');
  } catch (e) { console.error(e); showToast('Error: ' + (e.message || ''), 'error'); }
}

// ---- Inventory history ----
function renderInvHistory() {
  const el = document.getElementById('invHistory');
  if (!el) return;
  const txs = [...State.invTx].sort((a, b) => (tsToDate(b.createdAt) || 0) - (tsToDate(a.createdAt) || 0)).slice(0, 50);
  if (!txs.length) { el.innerHTML = emptyState('⏱', 'No inventory movements yet'); return; }
  const typeLabel = { restock: ['+ Restock', 'green'], usage: ['− Usage', 'blue'], sold: ['− Sold', 'blue'], damaged: ['− Damaged', 'red'], lost: ['− Lost', 'red'], adjustment: ['± Adjustment', 'orange'] };
  const projName = id => { const p = State.projects.find(x => x.id === id); return p ? p.name : ''; };
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
        <td>${t.projectId ? escapeHtml(projName(t.projectId) || '—') : '—'}</td>
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
