// ============================================================
// PROJECTS — creation, revenue, payments, expenses, inventory integration
// ============================================================

function activeProjects() { return State.projects.filter(p => !isArchived(p)); }

// ---- Project financial helpers (single source of truth) ----
function projectRevenueTotal(projectId) {
  return sumBy(State.projRev.filter(r => r.projectId === projectId && !r.archived), r => Number(r.amount) || 0);
}
function projectExpenseTotal(projectId) {
  return sumBy(State.projExp.filter(e => e.projectId === projectId && !e.archived), e => Number(e.amount) || 0);
}
function projectPaidTotal(projectId) {
  return sumBy(State.payments.filter(p => p.projectId === projectId && !p.archived), p => Number(p.amount) || 0);
}
function projectBalance(p) {
  const contract = Number(p.contractPrice) || 0;
  const paid = projectPaidTotal(p.id);
  return contract - paid;
}
function projectProfit(p) {
  return projectRevenueTotal(p.id) - projectExpenseTotal(p.id);
}
function projectProfitMargin(p) {
  const rev = projectRevenueTotal(p.id);
  if (rev <= 0) return 0;
  return (projectProfit(p) / rev) * 100;
}
function projectProgress(p) {
  // based on amount paid vs contract price
  const contract = Number(p.contractPrice) || 0;
  if (contract <= 0) return 0;
  return Math.min(100, Math.round((projectPaidTotal(p.id) / contract) * 100));
}
function projectExpensesByCat(p) {
  const cats = {};
  State.projExp.filter(e => e.projectId === p.id && !e.archived).forEach(e => {
    const c = e.category || 'Other';
    cats[c] = (cats[c] || 0) + (Number(e.amount) || 0);
  });
  return cats;
}

function renderProjects() {
  const q = (document.getElementById('projSearch').value || '').toLowerCase();
  const status = document.getElementById('projStatusFilter').value;
  let list = activeProjects().filter(p => {
    if (status && p.status !== status) return false;
    if (q) {
      const hay = [p.projectId, p.name, p.customerName, p.notes].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  list.sort((a, b) => (tsToDate(b.createdAt) || 0) - (tsToDate(a.createdAt) || 0));
  const canEdit = canWrite();

  const html = list.map(p => {
    const rev = projectRevenueTotal(p.id);
    const exp = projectExpenseTotal(p.id);
    const profit = projectProfit(p);
    const margin = projectProfitMargin(p);
    const balance = projectBalance(p);
    const progress = projectProgress(p);
    const paid = projectPaidTotal(p.id);
    const isDone = ['Completed', 'Delivered'].includes(p.status);
    const isCancelled = p.status === 'Cancelled';
    const statusColor = isCancelled ? 'red' : isDone ? 'green' : 'orange';
    return `
    <div class="card proj-card ${isDone ? 'completed' : isCancelled ? 'cancelled' : ''}">
      <div class="flex" style="justify-content:space-between;align-items:flex-start;gap:10px">
        <div style="flex:1;min-width:0">
          <h3 style="margin:0 0 2px">${escapeHtml(p.name)}</h3>
          <div class="muted">${escapeHtml(p.projectId || '')} · ${p.customerName ? escapeHtml(p.customerName) : 'No customer'} · Started ${escapeHtml(fmtDate(p.startDate))}${p.targetDate ? ' · Target ' + escapeHtml(fmtDate(p.targetDate)) : ''}</div>
        </div>
        <span class="badge ${statusColor} p-status">${escapeHtml(p.status || 'Pending')}</span>
      </div>
      <div class="proj-metrics">
        <div class="pm"><div class="pm-lbl">Revenue</div><div class="pm-val pos">${fmtMoney(rev)}</div></div>
        <div class="pm"><div class="pm-lbl">Expenses</div><div class="pm-val neg">${fmtMoney(exp)}</div></div>
        <div class="pm"><div class="pm-lbl">Profit</div><div class="pm-val ${profit >= 0 ? 'pos' : 'neg'}">${fmtMoney(profit)} (${margin.toFixed(1)}%)</div></div>
        <div class="pm"><div class="pm-lbl">Contract</div><div class="pm-val">${fmtMoney(p.contractPrice)}</div></div>
        <div class="pm"><div class="pm-lbl">Paid</div><div class="pm-val">${fmtMoney(paid)}</div></div>
        <div class="pm"><div class="pm-lbl">Balance</div><div class="pm-val ${balance > 0 ? 'neg' : 'pos'}">${fmtMoney(balance)}</div></div>
      </div>
      <div class="flex mt-12" style="align-items:center;gap:10px">
        <div class="progress flex-1"><div class="bar" style="width:${progress}%"></div></div>
        <span class="muted">${progress}% paid</span>
      </div>
      <div class="muted mt-8" style="font-size:11.5px">Est. cost: ${fmtMoney(p.estimatedCost)} · Est. profit: ${fmtMoney((Number(p.contractPrice) || 0) - (Number(p.estimatedCost) || 0))}</div>
      <div class="flex mt-12 flex-wrap">
        <button class="btn btn-yellow btn-sm" onclick="openProjectDetail('${p.id}')">👁 View / Manage</button>
        <button class="btn btn-green btn-sm" onclick="openPaymentModal('${p.id}')">+ Receive Payment</button>
        <button class="btn btn-blue btn-sm" onclick="openProjExpenseModal('${p.id}')">+ Add Expense</button>
        <button class="btn btn-outline btn-sm" onclick="openProjUseMaterial('${p.id}')">📦 Use Material</button>
        ${canEdit ? `<button class="btn btn-outline btn-sm" onclick="editProject('${p.id}')">✎</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProject('${p.id}')">🗑</button>` : ''}
      </div>
    </div>`;
  }).join('');

  document.getElementById('projList').innerHTML = html || emptyState('📐', 'No projects yet', 'Create your first project — school uniforms, bulk tarpaulins, events...');
}

// ---- Project modal ----
function openProjectModal(existing) {
  if (!guardWrite()) return;
  const isEdit = !!existing;
  const p = existing || {};
  const custs = State.customers;
  openModal(isEdit ? '✎ Edit Project' : '+ Create Project', `
    <div class="form-grid">
      <div class="field"><label>Project ID</label><input type="text" id="projId" value="${escapeHtml(p.projectId || '')}" placeholder="auto if blank"></div>
      <div class="field"><label>Project Name *</label><input type="text" id="projName" value="${escapeHtml(p.name || '')}" placeholder="e.g., School Uniform Project"></div>
      <div class="field"><label>Customer</label>
        <select id="projCustomer" onchange="toggleProjCustomer()">
          <option value="">— None —</option>
          ${custs.map(c => `<option value="${escapeHtml(c.name)}" ${p.customerName === c.name ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
          <option value="__custom__" ${p.customerName && !custs.find(c => c.name === p.customerName) ? 'selected' : ''}>+ New customer...</option>
        </select>
      </div>
      <div class="field hidden" id="newProjCust"><label>New Customer Name</label><input type="text" id="projNewCustomer" placeholder="Customer name"></div>
      <div class="field"><label>Start Date</label><input type="date" id="projStart" value="${tsToInput(p.startDate) || dateInputVal(new Date())}"></div>
      <div class="field"><label>Target Completion</label><input type="date" id="projTarget" value="${tsToInput(p.targetDate) || ''}"></div>
      <div class="field"><label>Status</label><select id="projStatus">${PROJECT_STATUSES.map(s => `<option ${p.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="field"><label>Contract / Selling Price (₱)</label><input type="number" id="projContract" value="${p.contractPrice ?? ''}" min="0" step="0.01"></div>
      <div class="field"><label>Estimated Cost (₱)</label><input type="number" id="projEstCost" value="${p.estimatedCost ?? ''}" min="0" step="0.01"></div>
      <div class="field"><label>Amount Paid (₱) — initial</label><input type="number" id="projPaid" value="${p.amountPaid ?? ''}" min="0" step="0.01"></div>
      <div class="field full"><label>Notes</label><textarea id="projNotes">${escapeHtml(p.notes || '')}</textarea></div>
    </div>
  `,
  `<button class="btn btn-gray btn-sm" onclick="closeModal()">Cancel</button>
   <button class="btn btn-yellow btn-sm" id="saveProjBtn">${isEdit ? '💾 Save Changes' : '✅ Create Project'}</button>`
  );
  document.getElementById('saveProjBtn').onclick = () => saveProject(existing);
  if (p.customerName && !custs.find(c => c.name === p.customerName)) toggleProjCustomer(true);
}
function toggleProjCustomer(force) {
  const sel = document.getElementById('projCustomer');
  const custom = force || sel.value === '__custom__';
  document.getElementById('newProjCust').classList.toggle('hidden', !custom);
}
async function saveProject(existing) {
  if (!guardWrite()) return;
  const name = document.getElementById('projName').value.trim();
  if (!name) { showToast('Project name is required', 'error'); return; }
  let customerName = document.getElementById('projCustomer').value;
  if (customerName === '__custom__') {
    customerName = document.getElementById('projNewCustomer').value.trim();
    if (!customerName) { showToast('Enter new customer name', 'error'); return; }
    await ensureCustomer(customerName);
  }
  const contract = parseFloat(document.getElementById('projContract').value) || 0;
  const estCost = parseFloat(document.getElementById('projEstCost').value) || 0;
  const start = parseDateInput(document.getElementById('projStart').value) || new Date();
  const target = parseDateInput(document.getElementById('projTarget').value);
  const status = document.getElementById('projStatus').value;
  const initialPaid = parseFloat(document.getElementById('projPaid').value) || 0;

  const data = {
    projectId: document.getElementById('projId').value.trim() || `P-${Date.now().toString(36).toUpperCase()}`,
    name: name,
    customerName: customerName || '',
    startDate: firebase.firestore.Timestamp.fromDate(new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12, 0, 0)),
    targetDate: target ? firebase.firestore.Timestamp.fromDate(new Date(target.getFullYear(), target.getMonth(), target.getDate(), 12, 0, 0)) : null,
    status: status,
    contractPrice: contract,
    estimatedCost: estCost,
    amountPaid: initialPaid,
    notes: document.getElementById('projNotes').value.trim(),
    archived: false,
    updatedAt: nowTS()
  };
  try {
    if (existing) {
      await db.collection(COLL.projects).doc(existing.id).update(data);
      await logAudit('edited', 'project', existing.id, null, { name });
      showToast('Project updated ✓', 'success');
    } else {
      data.createdAt = nowTS();
      const ref = await db.collection(COLL.projects).add(data);
      // record initial payment as payment record
      if (initialPaid > 0) {
        await db.collection(COLL.payments).add({
          projectId: ref.id,
          amount: initialPaid,
          method: 'Cash',
          note: 'Initial payment',
          date: data.startDate,
          createdAt: nowTS()
        });
      }
      await logAudit('created', 'project', ref.id, null, { name });
      showToast('Project created ✓', 'success');
    }
    closeModal();
    renderProjects();
  } catch (e) { console.error(e); showToast('Error: ' + (e.message || ''), 'error'); }
}
function editProject(id) {
  const p = State.projects.find(x => x.id === id);
  if (p) openProjectModal(p);
}
function deleteProject(id) {
  if (!guardWrite()) return;
  const p = State.projects.find(x => x.id === id);
  confirmDelete(`Delete project "${p ? p.name : ''}"? Its payments, expenses, and revenue records will also be deleted.`, async () => {
    try {
      // delete children in batch
      const batch = db.batch();
      batch.delete(db.collection(COLL.projects).doc(id));
      State.projRev.filter(r => r.projectId === id).forEach(r => batch.delete(db.collection(COLL.projRev).doc(r.id)));
      State.projExp.filter(e => e.projectId === id).forEach(e => batch.delete(db.collection(COLL.projExp).doc(e.id)));
      State.payments.filter(p => p.projectId === id).forEach(p => batch.delete(db.collection(COLL.payments).doc(p.id)));
      await batch.commit();
      await logAudit('deleted', 'project', id, null, { name: p ? p.name : '' });
      showToast('Project deleted', 'success');
      renderProjects(); renderDashboard();
    } catch (e) { showToast('Delete failed: ' + (e.message || ''), 'error'); }
  });
}

// ---- Project detail drawer/modal ----
function openProjectDetail(id) {
  const p = State.projects.find(x => x.id === id);
  if (!p) return;
  const rev = projectRevenueTotal(id);
  const exp = projectExpenseTotal(id);
  const profit = projectProfit(p);
  const margin = projectProfitMargin(p);
  const paid = projectPaidTotal(id);
  const contract = Number(p.contractPrice) || 0;
  const balance = contract - paid;
  const progress = projectProgress(p);
  const expCats = projectExpensesByCat(p);
  const revs = State.projRev.filter(r => r.projectId === id && !r.archived).sort((a, b) => (tsToDate(b.createdAt) || 0) - (tsToDate(a.createdAt) || 0));
  const exps = State.projExp.filter(e => e.projectId === id && !e.archived).sort((a, b) => (tsToDate(b.createdAt) || 0) - (tsToDate(a.createdAt) || 0));
  const pays = State.payments.filter(pay => pay.projectId === id && !pay.archived).sort((a, b) => (tsToDate(b.createdAt) || 0) - (tsToDate(a.createdAt) || 0));

  openModal(`📐 ${escapeHtml(p.name)}`, `
    <div class="grid grid-2 mb-12">
      <div class="stat-card green"><div class="lbl">Revenue</div><div class="val sm">${fmtMoney(rev)}</div></div>
      <div class="stat-card red"><div class="lbl">Expenses</div><div class="val sm">${fmtMoney(exp)}</div></div>
      <div class="stat-card ${profit >= 0 ? 'yellow' : 'pink'}"><div class="lbl">Profit</div><div class="val sm">${fmtMoney(profit)}</div><div class="note">Margin ${margin.toFixed(1)}%</div></div>
      <div class="stat-card blue"><div class="lbl">Balance</div><div class="val sm">${fmtMoney(balance)}</div><div class="note">${progress}% paid · ${escapeHtml(p.status || '')}</div></div>
    </div>
    <div style="margin-bottom:12px">
      <div class="flex" style="justify-content:space-between;font-size:11.5px;color:var(--gray-500);font-weight:700;margin-bottom:4px"><span>Progress</span><span>${progress}%</span></div>
      <div class="progress"><div class="bar" style="width:${progress}%"></div></div>
    </div>
    <div class="grid grid-2 mb-12" style="font-size:12.5px">
      <div><b>Contract:</b> ${fmtMoney(contract)}</div>
      <div><b>Paid:</b> ${fmtMoney(paid)}</div>
      <div><b>Est. Cost:</b> ${fmtMoney(p.estimatedCost)}</div>
      <div><b>Est. Profit:</b> ${fmtMoney(contract - (Number(p.estimatedCost) || 0))}</div>
      <div><b>Customer:</b> ${escapeHtml(p.customerName || '—')}</div>
      <div><b>Started:</b> ${escapeHtml(fmtDate(p.startDate))}</div>
    </div>
    ${Object.keys(expCats).length ? `<div class="mb-12"><b style="font-size:12.5px">Expenses by category:</b> ${Object.entries(expCats).map(([c, v]) => `<span class="chip yellow">${escapeHtml(c)} ${fmtMoney(v)}</span>`).join('')}</div>` : ''}

    <h4 style="font-size:12.5px;font-weight:800;color:var(--gray-500);text-transform:uppercase;margin:14px 0 8px">💰 Payments (${pays.length})</h4>
    <div class="tbl-wrap mb-12"><table class="tbl" style="min-width:400px"><thead><tr><th>Date</th><th>Method</th><th class="num">Amount</th><th>Note</th></tr></thead>
    <tbody>${pays.map(x => `<tr><td>${escapeHtml(fmtDate(x.date || x.createdAt))}</td><td>${escapeHtml(x.method || 'Cash')}</td><td class="num pos">+${fmtMoney(x.amount)}</td><td>${escapeHtml(x.note || '')}</td></tr>`).join('') || `<tr><td colspan="4">${emptyState('💰', 'No payments yet')}</td></tr>`}</tbody></table></div>

    <h4 style="font-size:12.5px;font-weight:800;color:var(--gray-500);text-transform:uppercase;margin:14px 0 8px">📈 Revenue Records (${revs.length})</h4>
    <div class="tbl-wrap mb-12"><table class="tbl" style="min-width:400px"><thead><tr><th>Date</th><th>Description</th><th class="num">Amount</th></tr></thead>
    <tbody>${revs.map(x => `<tr><td>${escapeHtml(fmtDate(x.date || x.createdAt))}</td><td>${escapeHtml(x.description || 'Revenue')}</td><td class="num pos">+${fmtMoney(x.amount)}</td></tr>`).join('') || `<tr><td colspan="3">${emptyState('📈', 'No revenue records — add project revenue or receive payments')}</td></tr>`}</tbody></table></div>

    <h4 style="font-size:12.5px;font-weight:800;color:var(--gray-500);text-transform:uppercase;margin:14px 0 8px">💸 Project Expenses (${exps.length})</h4>
    <div class="tbl-wrap"><table class="tbl" style="min-width:400px"><thead><tr><th>Date</th><th>Category</th><th>Description</th><th class="num">Amount</th></tr></thead>
    <tbody>${exps.map(x => `<tr><td>${escapeHtml(fmtDate(x.date || x.createdAt))}</td><td>${escapeHtml(x.category || '')}</td><td>${escapeHtml(x.description || '')}</td><td class="num neg">−${fmtMoney(x.amount)}</td></tr>`).join('') || `<tr><td colspan="4">${emptyState('💸', 'No project expenses yet')}</td></tr>`}</tbody></table></div>
  `,
  `<button class="btn btn-gray btn-sm" onclick="closeModal()">Close</button>
   <button class="btn btn-green btn-sm" onclick="openPaymentModal('${id}')">+ Payment</button>
   <button class="btn btn-blue btn-sm" onclick="openProjExpenseModal('${id}')">+ Expense</button>
   <button class="btn btn-outline btn-sm" onclick="openProjUseMaterial('${id}')">📦 Use Material</button>
   <button class="btn btn-yellow btn-sm" onclick="openProjectModal(State.projects.find(x=>x.id==='${id}'))">✎ Edit</button>`
  );
}

// ---- Payments ----
function openPaymentModal(projectId) {
  if (!guardWrite()) return;
  const p = State.projects.find(x => x.id === projectId);
  if (!p) return;
  const balance = projectBalance(p);
  openModal('+ Receive Payment', `
    <div class="form-grid">
      <div class="field full"><label>Project</label><input type="text" value="${escapeHtml(p.name)}" readonly style="background:var(--gray-100)"></div>
      <div class="field"><label>Amount (₱) *</label><input type="number" id="payAmount" min="0" step="0.01" placeholder="max balance ${fmtMoney(balance)}"></div>
      <div class="field"><label>Date</label><input type="date" id="payDate" value="${dateInputVal(new Date())}"></div>
      <div class="field"><label>Method</label><select id="payMethod">${PAYMENT_METHODS.map(m => `<option>${m}</option>`).join('')}</select></div>
      <div class="field full"><label>Note</label><input type="text" id="payNote" placeholder="e.g., 2nd payment"></div>
    </div>
  `,
  `<button class="btn btn-gray btn-sm" onclick="closeModal()">Cancel</button>
   <button class="btn btn-green btn-sm" id="savePayBtn">✅ Record Payment</button>`
  );
  document.getElementById('savePayBtn').onclick = () => savePayment(projectId);
}
async function savePayment(projectId) {
  if (!guardWrite()) return;
  const amount = parseFloat(document.getElementById('payAmount').value);
  if (isNaN(amount) || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
  const date = parseDateInput(document.getElementById('payDate').value) || new Date();
  const data = {
    projectId: projectId,
    amount: amount,
    method: document.getElementById('payMethod').value,
    note: document.getElementById('payNote').value.trim(),
    date: firebase.firestore.Timestamp.fromDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)),
    archived: false,
    createdAt: nowTS()
  };
  try {
    const ref = await db.collection(COLL.payments).add(data);
    // also create revenue record so project revenue includes payments
    await db.collection(COLL.projRev).add({
      projectId: projectId,
      description: 'Payment received',
      amount: amount,
      source: 'payment',
      paymentId: ref.id,
      date: data.date,
      archived: false,
      createdAt: nowTS()
    });
    await logAudit('payment', 'project', projectId, null, { amount });
    closeModal();
    renderProjects();
    showToast('Payment recorded ✓', 'success');
  } catch (e) { console.error(e); showToast('Error: ' + (e.message || ''), 'error'); }
}

// ---- Project expense ----
function openProjExpenseModal(projectId) {
  if (!guardWrite()) return;
  const p = projectId ? State.projects.find(x => x.id === projectId) : null;
  const cats = ['Material', 'Labor', 'Delivery', 'Other'];
  openModal('+ Add Project Expense', `
    <div class="form-grid">
      <div class="field full"><label>Project *</label><select id="peProject">
        ${State.projects.filter(x => x.status !== 'Cancelled').map(x => `<option value="${x.id}" ${p && p.id === x.id ? 'selected' : ''}>${escapeHtml(x.name)}</option>`).join('')}
      </select></div>
      <div class="field"><label>Category</label><select id="peCat">${cats.map(c => `<option>${c}</option>`).join('')}</select></div>
      <div class="field"><label>Date</label><input type="date" id="peDate" value="${dateInputVal(new Date())}"></div>
      <div class="field"><label>Amount (₱) *</label><input type="number" id="peAmount" min="0" step="0.01"></div>
      <div class="field full"><label>Description</label><input type="text" id="peDesc" placeholder="e.g., Labor for sewing 20 shirts"></div>
    </div>
  `,
  `<button class="btn btn-gray btn-sm" onclick="closeModal()">Cancel</button>
   <button class="btn btn-blue btn-sm" id="savePeBtn">✅ Save Expense</button>`
  );
  document.getElementById('savePeBtn').onclick = () => saveProjExpense();
}
async function saveProjExpense() {
  if (!guardWrite()) return;
  const projectId = document.getElementById('peProject').value;
  if (!projectId) { showToast('Select a project', 'error'); return; }
  const amount = parseFloat(document.getElementById('peAmount').value);
  if (isNaN(amount) || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
  const date = parseDateInput(document.getElementById('peDate').value) || new Date();
  const data = {
    projectId: projectId,
    category: document.getElementById('peCat').value,
    description: document.getElementById('peDesc').value.trim(),
    amount: amount,
    date: firebase.firestore.Timestamp.fromDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)),
    archived: false,
    createdAt: nowTS()
  };
  try {
    const ref = await db.collection(COLL.projExp).add(data);
    await logAudit('created', 'project_expense', ref.id, null, { projectId, amount });
    closeModal();
    renderProjects();
    showToast('Project expense saved ✓', 'success');
  } catch (e) { console.error(e); showToast('Error: ' + (e.message || ''), 'error'); }
}

// ---- Use material for project (inventory integration) ----
function openProjUseMaterial(projectId) {
  if (!guardWrite()) return;
  const p = projectId ? State.projects.find(x => x.id === projectId) : null;
  openModal('📦 Use Inventory Material for Project', `
    <div class="form-grid">
      <div class="field full"><label>Project *</label><select id="pmProject">
        ${State.projects.filter(x => x.status !== 'Cancelled').map(x => `<option value="${x.id}" ${p && p.id === x.id ? 'selected' : ''}>${escapeHtml(x.name)}</option>`).join('')}
      </select></div>
      <div class="field full"><label>Material (from inventory) *</label><select id="pmItem" onchange="showPmInfo()">
        ${activeInventory().map(i => `<option value="${i.id}">${escapeHtml(i.name)} — stock: ${fmtNum(i.currentStock)} ${escapeHtml(i.unit || '')} (cost ${fmtMoney(i.costPerUnit)}/${escapeHtml(i.unit || '')})</option>`).join('')}
      </select></div>
      <div class="field"><label>Quantity *</label><input type="number" id="pmQty" min="0" step="any" value=""></div>
      <div class="field"><label>Date</label><input type="date" id="pmDate" value="${dateInputVal(new Date())}"></div>
      <div class="field full"><label>Notes</label><input type="text" id="pmNotes" placeholder="e.g., 30 meters black fabric"></div>
    </div>
    <div id="pmInfo" class="mt-8" style="padding:10px;background:var(--gray-100);border-radius:8px;font-size:12.5px"></div>
    <div class="mt-12" style="padding:10px;background:var(--yellow-light);border-radius:8px;font-size:12.5px">
      ✅ This will automatically: deduct from inventory, record history, add material cost to project expenses, and update project profit.
    </div>
  `,
  `<button class="btn btn-gray btn-sm" onclick="closeModal()">Cancel</button>
   <button class="btn btn-yellow btn-sm" id="savePmBtn">✅ Use Material</button>`
  );
  document.getElementById('savePmBtn').onclick = () => saveProjMaterial();
  showPmInfo();
}
function showPmInfo() {
  const sel = document.getElementById('pmItem');
  const info = document.getElementById('pmInfo');
  if (!sel || !info) return;
  const it = State.inventory.find(x => x.id === sel.value);
  info.innerHTML = it ? `Current stock: <b>${fmtNum(it.currentStock)} ${escapeHtml(it.unit || '')}</b> · Cost/unit: ${fmtMoney(it.costPerUnit)}` : '';
}
async function saveProjMaterial() {
  if (!guardWrite()) return;
  const projectId = document.getElementById('pmProject').value;
  const itemId = document.getElementById('pmItem').value;
  const qty = parseFloat(document.getElementById('pmQty').value);
  if (!projectId) { showToast('Select a project', 'error'); return; }
  if (!itemId) { showToast('Select a material', 'error'); return; }
  if (isNaN(qty) || qty <= 0) { showToast('Enter a valid quantity', 'error'); return; }
  const item = State.inventory.find(x => x.id === itemId);
  const date = parseDateInput(document.getElementById('pmDate').value) || new Date();
  const notes = document.getElementById('pmNotes').value.trim();
  const prevStock = Number(item.currentStock) || 0;
  if (prevStock < qty) {
    const ok = confirm(`Stock is only ${fmtNum(prevStock)} — proceed anyway (will go to 0)?`);
    if (!ok) return;
  }
  const newStock = Math.max(0, prevStock - qty);
  const costPerUnit = Number(item.costPerUnit) || 0;
  const totalCost = qty * costPerUnit;
  try {
    // 1. deduct stock
    await db.collection(COLL.inventory).doc(itemId).update({
      currentStock: newStock,
      totalUsed: (Number(item.totalUsed) || 0) + qty,
      updatedAt: nowTS()
    });
    // 2. inventory history
    const txRef = await db.collection(COLL.invTx).add({
      itemId: itemId, itemName: item.name, type: 'usage', qty: qty, signedQty: -qty,
      prevStock: prevStock, newStock: newStock, projectId: projectId, notes: notes,
      userId: currentUser.uid, userName: currentUserDoc ? (currentUserDoc.name || currentUser.email) : '',
      date: firebase.firestore.Timestamp.fromDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)),
      createdAt: nowTS()
    });
    // 3. project expense (material cost) — dedupe by marker
    if (costPerUnit > 0) {
      const dupe = State.projExp.find(pe => pe.projectId === projectId && pe.marker === `INV:${itemId}:${txRef.id}`);
      if (!dupe) {
        await db.collection(COLL.projExp).add({
          projectId: projectId, category: 'Material',
          description: `Material: ${item.name} (${fmtNum(qty)} ${item.unit || ''})`,
          amount: totalCost, date: firebase.firestore.Timestamp.fromDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)),
          marker: `INV:${itemId}:${txRef.id}`, inventoryTxId: txRef.id, archived: false, createdAt: nowTS()
        });
      }
    }
    await logAudit('usage', 'project_material', projectId, { prevStock }, { newStock, qty });
    closeModal();
    renderProjects();
    showToast(`Material used ✓ (${fmtMoney(totalCost)} added to project expenses)`, 'success');
  } catch (e) { console.error(e); showToast('Error: ' + (e.message || ''), 'error'); }
}

// ---- Export ----
function exportProjectsCSV() {
  const rows = [['Project ID', 'Name', 'Customer', 'Start', 'Target', 'Status', 'Contract Price', 'Paid', 'Balance', 'Revenue', 'Expenses', 'Profit', 'Margin %', 'Progress %']];
  activeProjects().forEach(p => rows.push([
    p.projectId || '', p.name || '', p.customerName || '', fmtDate(p.startDate), fmtDate(p.targetDate), p.status || '',
    p.contractPrice || 0, projectPaidTotal(p.id), projectBalance(p), projectRevenueTotal(p.id), projectExpenseTotal(p.id),
    projectProfit(p), projectProfitMargin(p).toFixed(1), projectProgress(p)
  ]));
  downloadCSV('jb-projects.csv', rows);
}
