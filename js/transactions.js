// ============================================================
// TRANSACTIONS — Sales (income) + Expenses CRUD
// ============================================================

// ==================== SALES ====================
let salesPage = 1;
const SALES_PER_PAGE = 20;

function renderSales() {
  const q = (document.getElementById('salesSearch').value || '').toLowerCase();
  const cat = document.getElementById('salesCatFilter').value;
  const status = document.getElementById('salesStatusFilter').value;
  const from = parseDateInput(document.getElementById('salesFrom').value);
  const to = parseDateInput(document.getElementById('salesTo').value);
  const toEnd = to ? new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999) : null;

  let list = activeSales().filter(s => {
    if (cat && (s.category || '') !== cat) return false;
    if (status && (s.paymentStatus || 'Unpaid') !== status) return false;
    const d = tsToDate(s.date);
    if (from && (!d || d.getTime() < from.getTime())) return false;
    if (toEnd && (!d || d.getTime() > toEnd.getTime())) return false;
    if (q) {
      const hay = [s.transactionId, s.customerName, s.category, s.notes, (s.items || []).map(i => i.product || i.name).join(' ')].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  list.sort((a, b) => (tsToDate(b.date) || 0) - (tsToDate(a.date) || 0));

  const total = sumBy(list, saleTotal);
  const paid = sumBy(list, salePaid);
  const bal = sumBy(list, saleBalance);
  document.getElementById('salesSummary').innerHTML = `
    <span class="chip">${list.length} sales</span>
    <span class="chip yellow">Total ${fmtMoney(total)}</span>
    <span class="chip" style="background:var(--green-bg);color:var(--green)">Paid ${fmtMoney(paid)}</span>
    <span class="chip" style="background:var(--red-bg);color:var(--red)">Balance ${fmtMoney(bal)}</span>`;

  const totalPages = Math.max(1, Math.ceil(list.length / SALES_PER_PAGE));
  if (salesPage > totalPages) salesPage = totalPages;
  const pageItems = list.slice((salesPage - 1) * SALES_PER_PAGE, salesPage * SALES_PER_PAGE);

  const canEdit = canWrite();
  const rows = pageItems.map(s => {
    const items = (s.items || []).map(i => `${i.product || i.name || ''}${i.qty ? ' ×' + i.qty : ''}`).join(', ') || s.category || 'Sale';
    const cust = s.customerName || 'Walk-in';
    return `<tr>
      <td>${escapeHtml(s.transactionId || s.id.slice(0, 8))}</td>
      <td>${escapeHtml(fmtDate(s.date))}</td>
      <td>${escapeHtml(cust)}</td>
      <td>${escapeHtml(items)}</td>
      <td>${escapeHtml(s.category || '')}</td>
      <td class="num">${fmtMoney(saleTotal(s))}</td>
      <td>${escapeHtml(s.paymentMethod || '')}</td>
      <td>${paymentBadge(s.paymentStatus || 'Unpaid')}</td>
      <td class="num">${s.paymentStatus === 'Partial' ? fmtMoney(Number(s.amountPaid) || 0) : '—'}</td>
      <td class="num ${saleBalance(s) > 0 ? 'neg' : ''}">${saleBalance(s) > 0 ? fmtMoney(saleBalance(s)) : '—'}</td>
      ${canEdit ? `<td><button class="btn btn-outline btn-sm" onclick="editSale('${s.id}')">✎</button> <button class="btn btn-danger btn-sm" onclick="deleteSale('${s.id}')">🗑</button></td>` : ''}
    </tr>`;
  }).join('');

  const mcards = pageItems.map(s => {
    const items = (s.items || []).map(i => `${i.product || i.name || ''}${i.qty ? ' ×' + i.qty : ''}`).join(', ') || s.category || 'Sale';
    return `<div class="mcard income">
      <div class="m-top"><span class="m-title">${escapeHtml(s.customerName || 'Walk-in')}</span>${paymentBadge(s.paymentStatus || 'Unpaid')}</div>
      <div class="m-sub">${escapeHtml(items)} · ${escapeHtml(fmtDate(s.date))}</div>
      <div class="m-amt">${fmtMoney(saleTotal(s))}</div>
      <div class="m-actions">${canEdit ? `<button class="btn btn-outline btn-sm" onclick="editSale('${s.id}')">✎ Edit</button><button class="btn btn-danger btn-sm" onclick="deleteSale('${s.id}')">🗑</button>` : ''}</div>
    </div>`;
  }).join('');

  document.getElementById('salesList').innerHTML = `
    <div class="tbl-wrap desktop-table"><table class="tbl">
      <thead><tr><th>ID</th><th>Date</th><th>Customer</th><th>Product/Service</th><th>Category</th><th class="num">Total</th><th>Method</th><th>Status</th><th class="num">Paid</th><th class="num">Balance</th>${canEdit ? '<th>Actions</th>' : ''}</tr></thead>
      <tbody>${rows || `<tr><td colspan="11">${emptyState('💰', 'No sales found')}</td></tr>`}</tbody>
    </table></div>
    <div class="mobile-cards">${mcards || emptyState('💰', 'No sales found')}</div>
    ${makePager(list.length, salesPage, SALES_PER_PAGE, 'salesGoPage')}`;
}
function salesGoPage(p) { salesPage = p; renderSales(); }

function populateSalesCatFilter() {
  const sel = document.getElementById('salesCatFilter');
  getCategories().then(cats => {
    const cur = sel.value;
    sel.innerHTML = '<option value="">All Categories</option>' + cats.sales.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    if (cur) sel.value = cur;
  });
}

// --- Sale modal ---
function openSaleModal(existing, presetDate) {
  if (!guardWrite()) return;
  const catsPromise = getCategories();
  const custs = State.customers;
  catsPromise.then(cats => {
    const isEdit = !!existing;
    const s = existing || {};
    const dateVal = presetDate ? (typeof presetDate === 'string' ? presetDate : dateInputVal(presetDate)) : (tsToInput(s.date) || dateInputVal(new Date()));
    const items = (s.items && s.items.length) ? s.items : [{ product: '', category: cats.sales[0] || '', qty: 1, unitPrice: '' }];
    let itemsHtml = '';
    items.forEach((it, idx) => {
      itemsHtml += `
      <div class="sale-item-row" style="border:1px solid var(--gray-300);border-radius:8px;padding:10px;margin-bottom:8px">
        <div class="form-row mb-8">
          <div class="field" style="margin:0"><label>Product / Service</label><input type="text" class="si-product" value="${escapeHtml(it.product || '')}" placeholder="e.g., Tarpaulin 4x6"></div>
          <div class="field" style="margin:0"><label>Category</label><select class="si-category">${cats.sales.map(c => `<option value="${escapeHtml(c)}" ${c === (it.category || cats.sales[0]) ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select></div>
        </div>
        <div class="form-row">
          <div class="field" style="margin:0"><label>Qty</label><input type="number" class="si-qty" value="${it.qty ?? 1}" min="0" step="any" oninput="calcSaleRow(this)"></div>
          <div class="field" style="margin:0"><label>Unit Price (₱)</label><input type="number" class="si-price" value="${it.unitPrice ?? ''}" min="0" step="0.01" oninput="calcSaleRow(this)"></div>
          <div class="field" style="margin:0"><label>Total</label><input type="text" class="si-total" readonly value="${fmtMoney((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}"></div>
          <div style="display:flex;align-items:flex-end"><button class="btn btn-danger btn-sm" onclick="removeSaleItem(this)">✕</button></div>
        </div>
      </div>`;
    });

    openModal(isEdit ? '✎ Edit Sale' : '+ Add Sale', `
      <div class="form-grid">
        <div class="field"><label>Date</label><input type="date" id="saleDate" value="${dateVal}"></div>
        <div class="field"><label>Transaction ID</label><input type="text" id="saleTxnId" value="${escapeHtml(s.transactionId || nextTxnId())}" readonly style="background:var(--gray-100)"></div>
        <div class="field"><label>Customer</label>
          <select id="saleCustomer" onchange="toggleCustomCustomer()">
            <option value="">Walk-in / No customer</option>
            ${custs.map(c => `<option value="${escapeHtml(c.name)}" ${s.customerName === c.name ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
            <option value="__custom__" ${s.customerName && !custs.find(c => c.name === s.customerName) ? 'selected' : ''}>+ New customer...</option>
          </select>
        </div>
        <div class="field hidden" id="newCustField"><label>New Customer Name</label><input type="text" id="saleNewCustomer" value="" placeholder="Customer name"></div>
        <div class="field"><label>Payment Method</label><select id="saleMethod">${PAYMENT_METHODS.map(m => `<option ${s.paymentMethod === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
        <div class="field"><label>Payment Status</label><select id="saleStatus" onchange="togglePaidField()">${PAYMENT_STATUSES.map(st => `<option ${(s.paymentStatus || 'Paid') === st ? 'selected' : ''}>${st}</option>`).join('')}</select></div>
        <div class="field hidden" id="paidField"><label>Amount Paid (₱)</label><input type="number" id="salePaid" value="${s.amountPaid ?? ''}" min="0" step="0.01"></div>
        <div class="field full"><label>Notes</label><textarea id="saleNotes" placeholder="Optional notes...">${escapeHtml(s.notes || '')}</textarea></div>
      </div>
      <div style="margin-top:8px"><label style="font-size:12px;font-weight:700;color:var(--gray-700)">Items (Qty × Unit Price = Total)</label><div id="saleItemsWrap" class="mt-8">${itemsHtml}</div>
      <button class="btn btn-outline btn-sm mt-8" onclick="addSaleItem()">+ Add Item</button></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding:12px;background:var(--yellow-light);border-radius:8px">
        <b>TOTAL</b><span id="saleGrandTotal" style="font-size:20px;font-weight:800">₱0.00</span>
      </div>
    `,
    `<button class="btn btn-gray btn-sm" onclick="closeModal()">Cancel</button>
     <button class="btn btn-yellow btn-sm" id="saveSaleBtn">${isEdit ? '💾 Save Changes' : '✅ Save Sale'}</button>`
    );
    document.getElementById('saveSaleBtn').onclick = () => saveSale(existing);
    togglePaidField();
    if (s.customerName && !custs.find(c => c.name === s.customerName)) toggleCustomCustomer(true);
    calcSaleGrandTotal();
  });
}
function nextTxnId() {
  // Guaranteed unique: Firestore doc id slice + date (no random collision risk)
  const d = new Date();
  return genBizId('S', d);
}
function togglePaidField() {
  const status = document.getElementById('saleStatus').value;
  document.getElementById('paidField').classList.toggle('hidden', status !== 'Partial');
}
function toggleCustomCustomer(force) {
  const sel = document.getElementById('saleCustomer');
  const custom = force || sel.value === '__custom__';
  document.getElementById('newCustField').classList.toggle('hidden', !custom);
}
function addSaleItem() {
  const wrap = document.getElementById('saleItemsWrap');
  const cats = document.getElementById('saleItemsWrap').querySelector('.si-category');
  const firstCat = cats ? cats.options[0] && cats.options[0].value : '';
  const div = document.createElement('div');
  div.className = 'sale-item-row';
  div.style.cssText = 'border:1px solid var(--gray-300);border-radius:8px;padding:10px;margin-bottom:8px';
  div.innerHTML = `
    <div class="form-row mb-8">
      <div class="field" style="margin:0"><label>Product / Service</label><input type="text" class="si-product" placeholder="e.g., Tarpaulin 4x6"></div>
      <div class="field" style="margin:0"><label>Category</label><select class="si-category"><option value="">—</option>${DEFAULT_SALE_CATEGORIES.map(c => `<option>${c}</option>`).join('')}</select></div>
    </div>
    <div class="form-row">
      <div class="field" style="margin:0"><label>Qty</label><input type="number" class="si-qty" value="1" min="0" step="any" oninput="calcSaleRow(this)"></div>
      <div class="field" style="margin:0"><label>Unit Price (₱)</label><input type="number" class="si-price" value="" min="0" step="0.01" oninput="calcSaleRow(this)"></div>
      <div class="field" style="margin:0"><label>Total</label><input type="text" class="si-total" readonly value="₱0.00"></div>
      <div style="display:flex;align-items:flex-end"><button class="btn btn-danger btn-sm" onclick="removeSaleItem(this)">✕</button></div>
    </div>`;
  wrap.appendChild(div);
}
function removeSaleItem(btn) {
  const wrap = document.getElementById('saleItemsWrap');
  if (wrap.children.length <= 1) { showToast('At least 1 item required', 'error'); return; }
  btn.closest('.sale-item-row').remove();
  calcSaleGrandTotal();
}
function calcSaleRow(input) {
  const row = input.closest('.sale-item-row');
  const qty = parseFloat(row.querySelector('.si-qty').value) || 0;
  const price = parseFloat(row.querySelector('.si-price').value) || 0;
  row.querySelector('.si-total').value = fmtMoney(qty * price);
  calcSaleGrandTotal();
}
function calcSaleGrandTotal() {
  const rows = document.querySelectorAll('.sale-item-row');
  let total = 0;
  rows.forEach(r => {
    const qty = parseFloat(r.querySelector('.si-qty').value) || 0;
    const price = parseFloat(r.querySelector('.si-price').value) || 0;
    total += qty * price;
  });
  const el = document.getElementById('saleGrandTotal');
  if (el) el.textContent = fmtMoney(total);
}
async function saveSale(existing) {
  if (!guardWrite()) return;
  if (!busyStart()) return;
  const btn = document.getElementById('saveSaleBtn');
  if (btn) btn.disabled = true;
  try {
  const date = parseDateInput(document.getElementById('saleDate').value);
  if (!date) { showToast('Please pick a date', 'error'); return; }
  const items = [];
  let total = 0;
  document.querySelectorAll('.sale-item-row').forEach(r => {
    const product = r.querySelector('.si-product').value.trim();
    const category = r.querySelector('.si-category').value;
    const qty = parseFloat(r.querySelector('.si-qty').value) || 0;
    const unitPrice = parseFloat(r.querySelector('.si-price').value) || 0;
    if (!product || qty <= 0) return;
    if (qty < 0 || unitPrice < 0) return;
    const lineTotal = round2(qty * unitPrice);
    items.push({ product, category, qty, unitPrice, total: lineTotal });
    total = round2(total + lineTotal);
  });
  if (!items.length) { showToast('Add at least one item with product name', 'error'); return; }
  if (total <= 0) { showToast('Sale total must be greater than zero', 'error'); return; }
  if (total > 999999999) { showToast('Amount too large', 'error'); return; }

  let customerName = document.getElementById('saleCustomer').value;
  if (customerName === '__custom__') {
    customerName = document.getElementById('saleNewCustomer').value.trim();
    if (!customerName) { showToast('Enter new customer name', 'error'); return; }
    await ensureCustomer(customerName);
  }
  const paymentStatusRaw = document.getElementById('saleStatus').value;
  // Resolve payment consistently: Partial with paid >= total => Paid; paid > total => reject
  const resolved = resolvePayment(paymentStatusRaw, total, parseFloat(document.getElementById('salePaid').value) || 0);
  if (!resolved.ok) { showToast(resolved.error, 'error'); return; }
  const paymentStatus = resolved.status;
  const amountPaid = resolved.amountPaid;

  let txnId = document.getElementById('saleTxnId').value.trim() || nextTxnId();
  // uniqueness guard against existing ids (belt & suspenders)
  const existingIds = State.sales.map(s => s.transactionId).filter(Boolean);
  if (existingIds.includes(txnId) && !(existing && existing.transactionId === txnId)) {
    txnId = uniqueBizId('S', date, existingIds);
  }
  const data = {
    transactionId: txnId,
    date: firebase.firestore.Timestamp.fromDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)),
    customerName: customerName || '',
    items: items,
    category: items[0].category || 'Other',
    total: total,
    paymentMethod: document.getElementById('saleMethod').value,
    paymentStatus: paymentStatus,
    amountPaid: amountPaid,
    notes: document.getElementById('saleNotes').value.trim(),
    archived: false,
    updatedAt: nowTS()
  };

    if (existing) {
      const prev = State.sales.find(x => x.id === existing.id);
      await db.collection(COLL.sales).doc(existing.id).update(data);
      await logAudit('edited', 'sale', existing.id, { prevTotal: prev ? saleTotal(prev) : null, prevStatus: prev ? prev.paymentStatus : null }, { newTotal: total, status: paymentStatus });
      showToast('Sale updated ✓', 'success');
    } else {
      data.createdAt = nowTS();
      const ref = await db.collection(COLL.sales).add(data);
      await logAudit('created', 'sale', ref.id, null, { total, status: paymentStatus });
      showToast('Sale saved ✓', 'success');
    }
    closeModal();
    renderSales(); renderDashboard();
  } catch (e) {
    console.error(e);
    showToast(friendlyError(e, 'Unable to save sale. Please try again.'), 'error');
  } finally {
    busyEnd();
    if (btn) btn.disabled = false;
  }
}

// Pure payment-resolution logic (testable): never produces negative balance.
// Returns {ok, status, amountPaid, balance} or {ok:false, error}.
function resolvePayment(status, total, amountPaidRaw) {
  const t = round2(Number(total) || 0);
  let a = round2(Number(amountPaidRaw) || 0);
  if (a < 0) return { ok: false, error: 'Amount paid cannot be negative.' };
  if (a > 999999999) return { ok: false, error: 'Amount too large.' };
  if (status === 'Paid') {
    a = t;
    return { ok: true, status: 'Paid', amountPaid: a, balance: 0 };
  }
  if (status === 'Unpaid') {
    return { ok: true, status: 'Unpaid', amountPaid: 0, balance: t };
  }
  // Partial
  if (a > t) return { ok: false, error: `Amount paid cannot exceed the total (${fmtMoney(t)}).` };
  if (a === t) return { ok: true, status: 'Paid', amountPaid: a, balance: 0 };
  if (a > 0) return { ok: true, status: 'Partial', amountPaid: a, balance: round2(t - a) };
  return { ok: true, status: 'Unpaid', amountPaid: 0, balance: t };
}
function editSale(id) {
  const s = State.sales.find(x => x.id === id);
  if (s) openSaleModal(s);
}
function deleteSale(id) {
  if (!guardWrite()) return;
  const s = State.sales.find(x => x.id === id);
  confirmDelete(`Delete sale ${s ? s.transactionId || s.id.slice(0, 8) : ''} (${s ? fmtMoney(saleTotal(s)) : ''})? This will update all reports.`, async () => {
    try {
      await db.collection(COLL.sales).doc(id).delete();
      await logAudit('deleted', 'sale', id, { total: s ? saleTotal(s) : null }, null);
      showToast('Sale deleted', 'success');
      renderSales(); renderDashboard();
    } catch (e) { showToast('Delete failed: ' + (e.message || ''), 'error'); }
  });
}
async function ensureCustomer(name) {
  const existing = State.customers.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  const data = { name, contactNumber: '', email: '', address: '', notes: '', createdAt: nowTS(), updatedAt: nowTS() };
  const ref = await db.collection(COLL.customers).add(data);
  await logAudit('created', 'customer', ref.id, null, { name });
  return ref.id;
}
function exportSalesCSV() {
  const list = activeSales().sort((a, b) => (tsToDate(b.date) || 0) - (tsToDate(a.date) || 0));
  const rows = [['Transaction ID', 'Date', 'Customer', 'Items', 'Category', 'Qty', 'Unit Price', 'Total', 'Payment Method', 'Payment Status', 'Amount Paid', 'Balance', 'Notes']];
  list.forEach(s => {
    const items = s.items && s.items.length ? s.items : [{ product: s.category, qty: 1, unitPrice: saleTotal(s) }];
    items.forEach(it => rows.push([s.transactionId, fmtDate(s.date), s.customerName || '', it.product || '', it.category || s.category || '', it.qty, it.unitPrice, (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), s.paymentMethod || '', s.paymentStatus || '', s.paymentStatus === 'Partial' ? s.amountPaid : (s.paymentStatus === 'Paid' ? saleTotal(s) : 0), saleBalance(s), s.notes || '']));
  });
  downloadCSV('jb-sales.csv', rows);
}

// ==================== EXPENSES ====================
let expPage = 1;
const EXP_PER_PAGE = 20;

function renderExpenses() {
  const q = (document.getElementById('expSearch').value || '').toLowerCase();
  const cat = document.getElementById('expCatFilter').value;
  const proj = document.getElementById('expProjFilter').value;
  const from = parseDateInput(document.getElementById('expFrom').value);
  const to = parseDateInput(document.getElementById('expTo').value);
  const toEnd = to ? new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999) : null;

  let list = activeExpenses().filter(e => {
    if (cat && (e.category || '') !== cat) return false;
    if (proj) { const pid = e.projectId || '__none__'; if (proj === '__none__' ? pid !== '__none__' : pid !== proj) return false; }
    const d = tsToDate(e.date);
    if (from && (!d || d.getTime() < from.getTime())) return false;
    if (toEnd && (!d || d.getTime() > toEnd.getTime())) return false;
    if (q) {
      const hay = [e.expenseId, e.description, e.category, e.supplierName, e.receiptNo, e.notes].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  list.sort((a, b) => (tsToDate(b.date) || 0) - (tsToDate(a.date) || 0));

  const total = sumBy(list, e => e.amount);
  document.getElementById('expSummary').innerHTML = `
    <span class="chip">${list.length} expenses</span>
    <span class="chip yellow">Total ${fmtMoney(total)}</span>`;

  const totalPages = Math.max(1, Math.ceil(list.length / EXP_PER_PAGE));
  if (expPage > totalPages) expPage = totalPages;
  const pageItems = list.slice((expPage - 1) * EXP_PER_PAGE, expPage * EXP_PER_PAGE);
  const projName = id => { const p = State.projects.find(x => x.id === id); return p ? p.name : ''; };
  const canEdit = canWrite();

  const rows = pageItems.map(e => `<tr>
    <td>${escapeHtml(e.expenseId || e.id.slice(0, 8))}</td>
    <td>${escapeHtml(fmtDate(e.date))}</td>
    <td>${escapeHtml(e.category || '')}</td>
    <td>${escapeHtml(e.description || '')}</td>
    <td class="num">${fmtMoney(e.amount)}</td>
    <td>${escapeHtml(e.paymentMethod || '')}</td>
    <td>${escapeHtml(e.supplierName || '—')}</td>
    <td>${e.projectId ? escapeHtml(projName(e.projectId) || '—') : '—'}</td>
    <td>${escapeHtml(e.receiptNo || '—')}</td>
    ${canEdit ? `<td><button class="btn btn-outline btn-sm" onclick="editExpense('${e.id}')">✎</button> <button class="btn btn-danger btn-sm" onclick="deleteExpense('${e.id}')">🗑</button></td>` : ''}
  </tr>`).join('');
  const mcards = pageItems.map(e => `<div class="mcard expense">
    <div class="m-top"><span class="m-title">${escapeHtml(e.description || e.category)}</span><span class="badge gray">${escapeHtml(e.category || '')}</span></div>
    <div class="m-sub">${escapeHtml(fmtDate(e.date))}${e.projectId ? ' · ' + escapeHtml(projName(e.projectId)) : ''}${e.supplierName ? ' · ' + escapeHtml(e.supplierName) : ''}</div>
    <div class="m-amt">${fmtMoney(e.amount)}</div>
    <div class="m-actions">${canEdit ? `<button class="btn btn-outline btn-sm" onclick="editExpense('${e.id}')">✎ Edit</button><button class="btn btn-danger btn-sm" onclick="deleteExpense('${e.id}')">🗑</button>` : ''}</div>
  </div>`).join('');

  document.getElementById('expList').innerHTML = `
    <div class="tbl-wrap desktop-table"><table class="tbl">
      <thead><tr><th>ID</th><th>Date</th><th>Category</th><th>Description</th><th class="num">Amount</th><th>Method</th><th>Supplier</th><th>Project</th><th>Receipt</th>${canEdit ? '<th>Actions</th>' : ''}</tr></thead>
      <tbody>${rows || `<tr><td colspan="10">${emptyState('💸', 'No expenses found')}</td></tr>`}</tbody>
    </table></div>
    <div class="mobile-cards">${mcards || emptyState('💸', 'No expenses found')}</div>
    ${makePager(list.length, expPage, EXP_PER_PAGE, 'expGoPage')}`;
}
function expGoPage(p) { expPage = p; renderExpenses(); }

function populateExpCatFilter() {
  const sel = document.getElementById('expCatFilter');
  getCategories().then(cats => {
    const cur = sel.value;
    sel.innerHTML = '<option value="">All Categories</option>' + cats.expenses.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    if (cur) sel.value = cur;
  });
}

function openExpenseModal(existing, presetDate) {
  if (!guardWrite()) return;
  const catsPromise = getCategories();
  const suppliers = State.suppliers;
  const projects = State.projects;
  catsPromise.then(cats => {
    const isEdit = !!existing;
    const e = existing || {};
    const dateVal = presetDate ? (typeof presetDate === 'string' ? presetDate : dateInputVal(presetDate)) : (tsToInput(e.date) || dateInputVal(new Date()));
    openModal(isEdit ? '✎ Edit Expense' : '+ Add Expense', `
      <div class="form-grid">
        <div class="field"><label>Date</label><input type="date" id="expDate" value="${dateVal}"></div>
        <div class="field"><label>Expense ID</label><input type="text" id="expId" value="${escapeHtml(e.expenseId || '')}" placeholder="auto if blank"></div>
        <div class="field"><label>Category</label><select id="expCat">${cats.expenses.map(c => `<option value="${escapeHtml(c)}" ${e.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select></div>
        <div class="field"><label>Description</label><input type="text" id="expDesc" value="${escapeHtml(e.description || '')}" placeholder="e.g., Ink refill Epson"></div>
        <div class="field"><label>Amount (₱)</label><input type="number" id="expAmount" value="${e.amount ?? ''}" min="0" step="0.01"></div>
        <div class="field"><label>Payment Method</label><select id="expMethod">${PAYMENT_METHODS.map(m => `<option ${e.paymentMethod === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
        <div class="field"><label>Supplier / Payee</label>
          <select id="expSupplier" onchange="toggleCustomSupplier()">
            <option value="">— None —</option>
            ${suppliers.map(s => `<option value="${escapeHtml(s.name)}" ${e.supplierName === s.name ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
            <option value="__custom__" ${e.supplierName && !suppliers.find(s => s.name === e.supplierName) ? 'selected' : ''}>+ Other supplier...</option>
          </select>
        </div>
        <div class="field hidden" id="newSupField"><label>Supplier Name</label><input type="text" id="expNewSupplier" placeholder="Supplier name"></div>
        <div class="field"><label>Related Project</label><select id="expProject">
          <option value="">— None —</option>
          ${projects.filter(p => p.status !== 'Cancelled').map(p => `<option value="${p.id}" ${e.projectId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
        </select></div>
        <div class="field"><label>Receipt / Reference No.</label><input type="text" id="expReceipt" value="${escapeHtml(e.receiptNo || '')}"></div>
        <div class="field full"><label>Notes</label><textarea id="expNotes">${escapeHtml(e.notes || '')}</textarea></div>
      </div>
    `,
    `<button class="btn btn-gray btn-sm" onclick="closeModal()">Cancel</button>
     <button class="btn btn-pink btn-sm" id="saveExpBtn">${isEdit ? '💾 Save Changes' : '✅ Save Expense'}</button>`
    );
    document.getElementById('saveExpBtn').onclick = () => saveExpense(existing);
    if (e.supplierName && !suppliers.find(s => s.name === e.supplierName)) toggleCustomSupplier(true);
  });
}
function toggleCustomSupplier(force) {
  const sel = document.getElementById('expSupplier');
  const custom = force || sel.value === '__custom__';
  document.getElementById('newSupField').classList.toggle('hidden', !custom);
}
async function saveExpense(existing) {
  if (!guardWrite()) return;
  if (!busyStart()) return;
  const btn = document.getElementById('saveExpBtn');
  if (btn) btn.disabled = true;
  try {
  const date = parseDateInput(document.getElementById('expDate').value);
  if (!date) { showToast('Please pick a date', 'error'); return; }
  const amount = round2(parseFloat(document.getElementById('expAmount').value));
  if (isNaN(amount) || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
  if (amount > 999999999) { showToast('Amount too large', 'error'); return; }
  let supplierName = document.getElementById('expSupplier').value;
  if (supplierName === '__custom__') supplierName = document.getElementById('expNewSupplier').value.trim();
  let expenseId = document.getElementById('expId').value.trim();
  if (!expenseId) expenseId = uniqueBizId('E', date, State.expenses.map(e => e.expenseId).filter(Boolean));
  const data = {
    expenseId: expenseId,
    date: firebase.firestore.Timestamp.fromDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)),
    category: document.getElementById('expCat').value,
    description: document.getElementById('expDesc').value.trim(),
    amount: amount,
    paymentMethod: document.getElementById('expMethod').value,
    supplierName: supplierName || '',
    projectId: document.getElementById('expProject').value || '',
    receiptNo: document.getElementById('expReceipt').value.trim(),
    notes: document.getElementById('expNotes').value.trim(),
    archived: false,
    updatedAt: nowTS()
  };
    if (existing) {
      const prev = State.expenses.find(x => x.id === existing.id);
      await db.collection(COLL.expenses).doc(existing.id).update(data);
      await logAudit('edited', 'expense', existing.id, { prevAmount: prev ? prev.amount : null }, { newAmount: amount });
      showToast('Expense updated ✓', 'success');
    } else {
      data.createdAt = nowTS();
      const ref = await db.collection(COLL.expenses).add(data);
      await logAudit('created', 'expense', ref.id, null, { amount });
      showToast('Expense saved ✓', 'success');
    }
    closeModal();
    renderExpenses(); renderDashboard();
  } catch (e) { console.error(e); showToast(friendlyError(e, 'Unable to save expense. Please try again.'), 'error'); }
  finally { busyEnd(); if (btn) btn.disabled = false; }
}
function editExpense(id) {
  const e = State.expenses.find(x => x.id === id);
  if (e) openExpenseModal(e);
}
function deleteExpense(id) {
  if (!guardWrite()) return;
  const e = State.expenses.find(x => x.id === id);
  confirmDelete(`Delete expense ${e ? fmtMoney(e.amount) : ''} — ${e ? escapeHtml(e.description || e.category) : ''}?`, async () => {
    try {
      await db.collection(COLL.expenses).doc(id).delete();
      await logAudit('deleted', 'expense', id, { amount: e ? e.amount : null }, null);
      showToast('Expense deleted', 'success');
      renderExpenses(); renderDashboard();
    } catch (e2) { showToast('Delete failed: ' + (e2.message || ''), 'error'); }
  });
}
function exportExpensesCSV() {
  const list = activeExpenses().sort((a, b) => (tsToDate(b.date) || 0) - (tsToDate(a.date) || 0));
  const projName = id => { const p = State.projects.find(x => x.id === id); return p ? p.name : ''; };
  const rows = [['Expense ID', 'Date', 'Category', 'Description', 'Amount', 'Payment Method', 'Supplier/Payee', 'Related Project', 'Receipt No.', 'Notes']];
  list.forEach(e => rows.push([e.expenseId, fmtDate(e.date), e.category, e.description, e.amount, e.paymentMethod || '', e.supplierName || '', projName(e.projectId) || '', e.receiptNo || '', e.notes || '']));
  downloadCSV('jb-expenses.csv', rows);
}

// ---- CSV download ----
function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(c => {
    const s = String(c === null || c === undefined ? '' : c);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
