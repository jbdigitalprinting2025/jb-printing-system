// ============================================================
// PARTNERS — Customers + Suppliers
// ============================================================

// ==================== CUSTOMERS ====================
function customerStats(id) {
  const sales = activeSales().filter(s => s.customerName && State.customers.find(c => c.id === id) && s.customerName === State.customers.find(c => c.id === id).name);
  const totalPurchases = sumBy(sales, saleTotal);
  const totalPaid = sumBy(sales, salePaid);
  const balance = sumBy(sales, saleBalance);
  const projs = activeProjects().filter(p => p.customerName && State.customers.find(c => c.id === id) && p.customerName === State.customers.find(c => c.id === id).name);
  return { sales, totalPurchases, totalPaid, balance, projs };
}

function renderCustomers() {
  const q = (document.getElementById('custSearch').value || '').toLowerCase();
  let list = State.customers.filter(c => {
    if (q) {
      const hay = [c.name, c.contactNumber, c.email, c.address].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const canEdit = canWrite();

  const rows = list.map(c => {
    const st = customerStats(c.id);
    return `<tr>
      <td><b>${escapeHtml(c.name)}</b></td>
      <td>${escapeHtml(c.contactNumber || '—')}</td>
      <td>${escapeHtml(c.email || '—')}</td>
      <td>${escapeHtml(c.address || '—')}</td>
      <td class="num">${st.sales.length}</td>
      <td class="num">${fmtMoney(st.totalPurchases)}</td>
      <td class="num pos">${fmtMoney(st.totalPaid)}</td>
      <td class="num ${st.balance > 0 ? 'neg' : ''}">${fmtMoney(st.balance)}</td>
      ${canEdit ? `<td><button class="btn btn-outline btn-sm" onclick="viewCustomer('${c.id}')">👁</button> <button class="btn btn-outline btn-sm" onclick="editCustomer('${c.id}')">✎</button> <button class="btn btn-danger btn-sm" onclick="deleteCustomer('${c.id}')">🗑</button></td>` : ''}
    </tr>`;
  }).join('');
  const mcards = list.map(c => {
    const st = customerStats(c.id);
    return `<div class="mcard">
      <div class="m-top"><span class="m-title">${escapeHtml(c.name)}</span><span class="badge gray">${st.sales.length} sales</span></div>
      <div class="m-sub">${escapeHtml(c.contactNumber || '')}${c.email ? ' · ' + escapeHtml(c.email) : ''}</div>
      <div class="flex mt-8" style="justify-content:space-between"><span class="muted">Total ${fmtMoney(st.totalPurchases)}</span><b style="color:${st.balance > 0 ? 'var(--red)' : 'var(--green)'}">Bal ${fmtMoney(st.balance)}</b></div>
      ${canEdit ? `<div class="m-actions"><button class="btn btn-outline btn-sm" onclick="viewCustomer('${c.id}')">👁 View</button><button class="btn btn-outline btn-sm" onclick="editCustomer('${c.id}')">✎</button><button class="btn btn-danger btn-sm" onclick="deleteCustomer('${c.id}')">🗑</button></div>` : ''}
    </div>`;
  }).join('');

  document.getElementById('custList').innerHTML = `
    <div class="tbl-wrap desktop-table"><table class="tbl">
      <thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Address</th><th class="num">Sales</th><th class="num">Total Purchases</th><th class="num">Total Paid</th><th class="num">Balance</th>${canEdit ? '<th>Actions</th>' : ''}</tr></thead>
      <tbody>${rows || `<tr><td colspan="9">${emptyState('👥', 'No customers yet')}</td></tr>`}</tbody>
    </table></div>
    <div class="mobile-cards">${mcards || emptyState('👥', 'No customers yet')}</div>`;
}

function openCustomerModal(existing) {
  if (!guardWrite()) return;
  const isEdit = !!existing;
  const c = existing || {};
  openModal(isEdit ? '✎ Edit Customer' : '+ Add Customer', `
    <div class="form-grid">
      <div class="field"><label>Name *</label><input type="text" id="cName" value="${escapeHtml(c.name || '')}"></div>
      <div class="field"><label>Contact Number</label><input type="text" id="cContact" value="${escapeHtml(c.contactNumber || '')}" placeholder="09xx-xxx-xxxx"></div>
      <div class="field"><label>Email</label><input type="email" id="cEmail" value="${escapeHtml(c.email || '')}"></div>
      <div class="field"><label>Address</label><input type="text" id="cAddress" value="${escapeHtml(c.address || '')}"></div>
      <div class="field full"><label>Notes</label><textarea id="cNotes">${escapeHtml(c.notes || '')}</textarea></div>
    </div>
  `,
  `<button class="btn btn-gray btn-sm" onclick="closeModal()">Cancel</button>
   <button class="btn btn-yellow btn-sm" id="saveCustBtn">${isEdit ? '💾 Save Changes' : '✅ Add Customer'}</button>`
  );
  document.getElementById('saveCustBtn').onclick = () => saveCustomer(existing);
}
async function saveCustomer(existing) {
  if (!guardWrite()) return;
  if (!guardOnline()) return;
  if (!busyStart()) return;
  const btn = document.getElementById('saveCustBtn');
  if (btn) btn.disabled = true;
  try {
  const name = document.getElementById('cName').value.trim();
  if (!name) { showToast('Name is required', 'error'); return; }
  const email = document.getElementById('cEmail').value.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Invalid email address', 'error'); return; }
  const data = {
    name, contactNumber: document.getElementById('cContact').value.trim(),
    email: email,
    address: document.getElementById('cAddress').value.trim(),
    notes: document.getElementById('cNotes').value.trim(),
    updatedAt: nowTS()
  };
    if (existing) {
      await db.collection(COLL.customers).doc(existing.id).update(data);
      await logAudit('edited', 'customer', existing.id, null, { name });
      showToast('Customer updated ✓', 'success');
    } else {
      data.createdAt = nowTS();
      const ref = await db.collection(COLL.customers).add(data);
      await logAudit('created', 'customer', ref.id, null, { name });
      showToast('Customer added ✓', 'success');
    }
    closeModal();
    renderCustomers();
  } catch (e) { console.error(e); showToast(friendlyError(e, 'Unable to save customer. Please try again.'), 'error'); }
  finally { busyEnd(); if (btn) btn.disabled = false; }
}
function editCustomer(id) {
  const c = State.customers.find(x => x.id === id);
  if (c) openCustomerModal(c);
}
function viewCustomer(id) {
  const c = State.customers.find(x => x.id === id);
  if (!c) return;
  const st = customerStats(id);
  const sales = st.sales.sort((a, b) => (tsToDate(b.date) || 0) - (tsToDate(a.date) || 0)).slice(0, 10);
  openModal(`👥 ${escapeHtml(c.name)}`, `
    <div class="grid grid-2 mb-12">
      <div class="stat-card blue"><div class="lbl">Total Purchases</div><div class="val sm">${fmtMoney(st.totalPurchases)}</div></div>
      <div class="stat-card green"><div class="lbl">Total Paid</div><div class="val sm">${fmtMoney(st.totalPaid)}</div></div>
      <div class="stat-card ${st.balance > 0 ? 'red' : 'dark'}"><div class="lbl">Outstanding Balance</div><div class="val sm">${fmtMoney(st.balance)}</div></div>
      <div class="stat-card yellow"><div class="lbl">Projects</div><div class="val sm">${st.projs.length}</div></div>
    </div>
    <div class="muted mb-8">${escapeHtml(c.contactNumber || '')}${c.email ? ' · ' + escapeHtml(c.email) : ''}${c.address ? ' · ' + escapeHtml(c.address) : ''}</div>
    <h4 style="font-size:12.5px;font-weight:800;color:var(--gray-500);text-transform:uppercase;margin-bottom:8px">Recent Transactions</h4>
    <div class="tbl-wrap"><table class="tbl" style="min-width:400px"><thead><tr><th>Date</th><th>ID</th><th>Items</th><th class="num">Total</th><th>Status</th></tr></thead>
    <tbody>${sales.map(s => {
      const items = (Array.isArray(s.items) ? s.items : []).map(i => i.product || '').join(', ') || s.category || 'Sale';
      return `<tr><td>${escapeHtml(fmtDate(s.date))}</td><td>${escapeHtml(s.transactionId || '')}</td><td>${escapeHtml(items)}</td><td class="num">${fmtMoney(saleTotal(s))}</td><td>${paymentBadge(s.paymentStatus || 'Unpaid')}</td></tr>`;
    }).join('') || `<tr><td colspan="5">${emptyState('🧾', 'No transactions yet')}</td></tr>`}</tbody></table></div>
    <h4 style="font-size:12.5px;font-weight:800;color:var(--gray-500);text-transform:uppercase;margin:14px 0 8px">Projects</h4>
    ${st.projs.map(p => `<div class="set-row"><span>${escapeHtml(p.name)}</span><span class="badge ${p.status === 'Cancelled' ? 'red' : p.status === 'Completed' || p.status === 'Delivered' ? 'green' : 'orange'}">${escapeHtml(p.status)}</span></div>`).join('') || '<div class="muted">No projects</div>'}
  `, `<button class="btn btn-gray btn-sm" onclick="closeModal()">Close</button>`);
}
function deleteCustomer(id) {
  if (!guardWrite()) return;
  const c = State.customers.find(x => x.id === id);
  confirmDelete(`Delete customer "${c ? c.name : ''}"? Their sales records stay (customer name removed from link).`, async () => {
    try {
      await db.collection(COLL.customers).doc(id).delete();
      await logAudit('deleted', 'customer', id, null, { name: c ? c.name : '' });
      showToast('Customer deleted', 'success');
      renderCustomers();
    } catch (e) { showToast('Delete failed: ' + (e.message || ''), 'error'); }
  });
}
function exportCustomersCSV() {
  const rows = [['Name', 'Contact', 'Email', 'Address', 'Total Sales', 'Total Purchases', 'Total Paid', 'Balance', 'Notes']];
  State.customers.forEach(c => {
    const st = customerStats(c.id);
    rows.push([c.name, c.contactNumber || '', c.email || '', c.address || '', st.sales.length, st.totalPurchases, st.totalPaid, st.balance, c.notes || '']);
  });
  downloadCSV('jb-customers.csv', rows);
}

// ==================== SUPPLIERS ====================
function supplierStats(id) {
  const sup = State.suppliers.find(s => s.id === id);
  if (!sup) return { purchases: 0, count: 0 };
  const purchases = activeExpenses().filter(e => e.supplierName === sup.name);
  return { purchases: sumBy(purchases, e => e.amount), count: purchases.length };
}

function renderSuppliers() {
  const q = (document.getElementById('supSearch').value || '').toLowerCase();
  let list = State.suppliers.filter(s => {
    if (q) {
      const hay = [s.name, s.contactPerson, s.phone, s.email, s.address, (s.productsSupplied || []).join(' ')].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const canEdit = canWrite();
  const rows = list.map(s => {
    const st = supplierStats(s.id);
    return `<tr>
      <td><b>${escapeHtml(s.name)}</b></td>
      <td>${escapeHtml(s.contactPerson || '—')}</td>
      <td>${escapeHtml(s.phone || '—')}</td>
      <td>${escapeHtml(s.email || '—')}</td>
      <td>${escapeHtml(s.address || '—')}</td>
      <td>${escapeHtml((s.productsSupplied || []).join(', ') || '—')}</td>
      <td class="num">${st.count}</td>
      <td class="num">${fmtMoney(st.purchases)}</td>
      ${canEdit ? `<td><button class="btn btn-outline btn-sm" onclick="editSupplier('${s.id}')">✎</button> <button class="btn btn-danger btn-sm" onclick="deleteSupplier('${s.id}')">🗑</button></td>` : ''}
    </tr>`;
  }).join('');
  const mcards = list.map(s => {
    const st = supplierStats(s.id);
    return `<div class="mcard">
      <div class="m-top"><span class="m-title">${escapeHtml(s.name)}</span><span class="badge gray">${st.count} purchases</span></div>
      <div class="m-sub">${escapeHtml(s.contactPerson || '')}${s.phone ? ' · ' + escapeHtml(s.phone) : ''}</div>
      <div class="m-sub">${escapeHtml((s.productsSupplied || []).join(', ') || '')}</div>
      <div class="m-amt">${fmtMoney(st.purchases)}</div>
      ${canEdit ? `<div class="m-actions"><button class="btn btn-outline btn-sm" onclick="editSupplier('${s.id}')">✎</button><button class="btn btn-danger btn-sm" onclick="deleteSupplier('${s.id}')">🗑</button></div>` : ''}
    </div>`;
  }).join('');
  document.getElementById('supList').innerHTML = `
    <div class="tbl-wrap desktop-table"><table class="tbl">
      <thead><tr><th>Name</th><th>Contact Person</th><th>Phone</th><th>Email</th><th>Address</th><th>Products Supplied</th><th class="num">Purchases</th><th class="num">Total Purchases</th>${canEdit ? '<th>Actions</th>' : ''}</tr></thead>
      <tbody>${rows || `<tr><td colspan="9">${emptyState('🚚', 'No suppliers yet')}</td></tr>`}</tbody>
    </table></div>
    <div class="mobile-cards">${mcards || emptyState('🚚', 'No suppliers yet')}</div>`;
}

function openSupplierModal(existing) {
  if (!guardWrite()) return;
  const isEdit = !!existing;
  const s = existing || {};
  openModal(isEdit ? '✎ Edit Supplier' : '+ Add Supplier', `
    <div class="form-grid">
      <div class="field"><label>Name *</label><input type="text" id="sName" value="${escapeHtml(s.name || '')}"></div>
      <div class="field"><label>Contact Person</label><input type="text" id="sPerson" value="${escapeHtml(s.contactPerson || '')}"></div>
      <div class="field"><label>Phone</label><input type="text" id="sPhone" value="${escapeHtml(s.phone || '')}"></div>
      <div class="field"><label>Email</label><input type="email" id="sEmail" value="${escapeHtml(s.email || '')}"></div>
      <div class="field full"><label>Address</label><input type="text" id="sAddress" value="${escapeHtml(s.address || '')}"></div>
      <div class="field full"><label>Products Supplied (comma separated)</label><input type="text" id="sProducts" value="${escapeHtml((s.productsSupplied || []).join(', '))}" placeholder="e.g., Tarpaulin, Vinyl, Ink"></div>
      <div class="field full"><label>Notes</label><textarea id="sNotes">${escapeHtml(s.notes || '')}</textarea></div>
    </div>
  `,
  `<button class="btn btn-gray btn-sm" onclick="closeModal()">Cancel</button>
   <button class="btn btn-yellow btn-sm" id="saveSupBtn">${isEdit ? '💾 Save Changes' : '✅ Add Supplier'}</button>`
  );
  document.getElementById('saveSupBtn').onclick = () => saveSupplier(existing);
}
async function saveSupplier(existing) {
  if (!guardWrite()) return;
  if (!guardOnline()) return;
  if (!busyStart()) return;
  const btn = document.getElementById('saveSupBtn');
  if (btn) btn.disabled = true;
  try {
  const name = document.getElementById('sName').value.trim();
  if (!name) { showToast('Name is required', 'error'); return; }
  const email = document.getElementById('sEmail').value.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Invalid email address', 'error'); return; }
  const data = {
    name, contactPerson: document.getElementById('sPerson').value.trim(),
    phone: document.getElementById('sPhone').value.trim(),
    email: email,
    address: document.getElementById('sAddress').value.trim(),
    productsSupplied: document.getElementById('sProducts').value.split(',').map(x => x.trim()).filter(Boolean),
    notes: document.getElementById('sNotes').value.trim(),
    updatedAt: nowTS()
  };
    if (existing) {
      await db.collection(COLL.suppliers).doc(existing.id).update(data);
      await logAudit('edited', 'supplier', existing.id, null, { name });
      showToast('Supplier updated ✓', 'success');
    } else {
      data.createdAt = nowTS();
      const ref = await db.collection(COLL.suppliers).add(data);
      await logAudit('created', 'supplier', ref.id, null, { name });
      showToast('Supplier added ✓', 'success');
    }
    closeModal();
    renderSuppliers();
  } catch (e) { console.error(e); showToast(friendlyError(e, 'Unable to save supplier. Please try again.'), 'error'); }
  finally { busyEnd(); if (btn) btn.disabled = false; }
}
function editSupplier(id) {
  const s = State.suppliers.find(x => x.id === id);
  if (s) openSupplierModal(s);
}
function deleteSupplier(id) {
  if (!guardWrite()) return;
  const s = State.suppliers.find(x => x.id === id);
  confirmDelete(`Delete supplier "${s ? s.name : ''}"?`, async () => {
    try {
      await db.collection(COLL.suppliers).doc(id).delete();
      await logAudit('deleted', 'supplier', id, null, { name: s ? s.name : '' });
      showToast('Supplier deleted', 'success');
      renderSuppliers();
    } catch (e) { showToast('Delete failed: ' + (e.message || ''), 'error'); }
  });
}
function exportSuppliersCSV() {
  const rows = [['Name', 'Contact Person', 'Phone', 'Email', 'Address', 'Products Supplied', 'Purchase Count', 'Total Purchases', 'Notes']];
  State.suppliers.forEach(s => {
    const st = supplierStats(s.id);
    rows.push([s.name, s.contactPerson || '', s.phone || '', s.email || '', s.address || '', (s.productsSupplied || []).join(', '), st.count, st.purchases, s.notes || '']);
  });
  downloadCSV('jb-suppliers.csv', rows);
}
