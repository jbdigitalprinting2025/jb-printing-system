// ============================================================
// SETTINGS — business info, categories, users, retention, backup, audit
// ============================================================

function renderSettings() {
  const s = settingsCache || {};
  const canAdmin = isAdmin();
  const ret = getRetentionConfig();
  const eligible = retentionEligibleCount();

  document.getElementById('settingsContent').innerHTML = `
    <div class="set-group"><h3>🏪 Business Information</h3><div class="desc">Shown in the app and reports.</div>
      <div class="form-grid">
        <div class="field"><label>Business Name</label><input type="text" id="setBizName" value="${escapeHtml(s.businessName || APP_NAME)}"></div>
        <div class="field"><label>Address</label><input type="text" id="setBizAddr" value="${escapeHtml(s.businessAddress || 'Tigaon, Camarines Sur')}"></div>
        <div class="field"><label>Contact Number</label><input type="text" id="setBizPhone" value="${escapeHtml(s.businessPhone || '')}"></div>
        <div class="field"><label>Email</label><input type="email" id="setBizEmail" value="${escapeHtml(s.businessEmail || '')}"></div>
        <div class="field"><label>Currency Symbol</label><input type="text" id="setCurrency" value="${escapeHtml(s.currency || '₱')}" maxlength="4"></div>
        <div class="field"><label>Tax / VAT Rate (%)</label><input type="number" id="setTax" value="${s.taxRate ?? 0}" min="0" step="0.01"></div>
      </div>
      <button class="btn btn-yellow btn-sm mt-8" onclick="saveBizSettings()">💾 Save Business Info</button>
    </div>

    <div class="set-group"><h3>🖼 Business Logo</h3><div class="desc">I-upload ang logo ng business mo. Lalabas sa taas ng app at sa login screen.</div>
      <div class="flex" style="align-items:center;gap:14px;flex-wrap:wrap">
        <div id="logoPreview" style="width:64px;height:64px;border-radius:14px;background:var(--gray-100);border:2px dashed var(--gray-300);display:flex;align-items:center;justify-content:center;font-size:30px;overflow:hidden">🖨️</div>
        <div>
          <button class="btn btn-outline btn-sm" onclick="document.getElementById('logoFileInput').click()">📷 Pumili ng Logo</button>
          <input type="file" id="logoFileInput" accept="image/*" class="hidden" onchange="previewLogo(this)">
          <button class="btn btn-yellow btn-sm mt-8" onclick="saveLogo()">💾 Save Logo</button>
          ${settingsCache && settingsCache.businessLogo ? `<button class="btn btn-danger btn-sm mt-8" onclick="removeLogo()">🗑 Remove</button>` : ''}
        </div>
      </div>
      <div class="muted mt-8" style="font-size:11px">Pinakamaganda: square na image (PNG o JPG). Awtomatikong ni-resize sa laki para sa app.</div>
    </div>

    <div class="set-group"><h3>📂 Categories</h3><div class="desc">Used in sales, expenses, and inventory. Add your own.</div>
      <div class="set-row"><span class="sr-lbl">Sales Categories</span><button class="btn btn-outline btn-sm" onclick="editCategories('sales')">✎ Manage</button></div>
      <div class="set-row"><span class="sr-lbl">Expense Categories</span><button class="btn btn-outline btn-sm" onclick="editCategories('expenses')">✎ Manage</button></div>
    </div>

    ${canAdmin ? `
    <div class="set-group"><h3>👥 User Management</h3><div class="desc">Roles: <b>Admin</b> (full access) · <b>Staff</b> (daily operations) · <b>Viewer</b> (view only).</div>
      <div id="userListWrap"></div>
      <button class="btn btn-yellow btn-sm mt-8" onclick="openAddUserModal()">+ Add User</button>
    </div>` : ''}

    <div class="set-group"><h3>🗄 Data Retention</h3><div class="desc">Old records older than the retention period are archived or deleted automatically. Master data (customers, suppliers, inventory items, users, settings) is NEVER deleted.</div>
      <div class="set-row"><span class="sr-lbl">Retention Period</span><select id="retMonths" ${canAdmin ? '' : 'disabled'}>
        <option value="6" ${ret.months === 6 ? 'selected' : ''}>6 months</option>
        <option value="12" ${ret.months === 12 ? 'selected' : ''}>1 year (recommended)</option>
        <option value="24" ${ret.months === 24 ? 'selected' : ''}>2 years</option>
        <option value="36" ${ret.months === 36 ? 'selected' : ''}>3 years</option>
      </select></div>
      <div class="set-row"><span class="sr-lbl">Mode</span><select id="retMode" ${canAdmin ? '' : 'disabled'}>
        <option value="archive" ${ret.mode === 'archive' ? 'selected' : ''}>ARCHIVE (recommended — keeps records safely)</option>
        <option value="delete" ${ret.mode === 'delete' ? 'selected' : ''}>PERMANENT DELETE (dangerous)</option>
        <option value="disabled" ${ret.mode === 'disabled' ? 'selected' : ''}>DISABLED (no cleanup)</option>
      </select></div>
      <div class="set-row"><span class="sr-lbl">Eligible records now</span><b>${eligible.total}</b></div>
      ${canAdmin ? `<button class="btn btn-yellow btn-sm mt-8" onclick="saveRetentionSettings()">💾 Save Retention Settings</button>
      <button class="btn btn-outline btn-sm mt-8" onclick="runRetentionNow()">⚡ Run Cleanup Now</button>` : ''}
    </div>

    ${canAdmin ? `
    <div class="set-group"><h3>💾 Backup & Restore</h3><div class="desc">Download all data as backup, or restore from a backup file. Restore overwrites current data — always backup first. Admin only.</div>
      <div class="flex flex-wrap">
        <button class="btn btn-green btn-sm" onclick="exportBackup()">⬇ Download Backup (JSON)</button>
        <button class="btn btn-outline btn-sm" onclick="exportBackupExcel()">⬇ Backup as Excel</button>
        <button class="btn btn-pink btn-sm" onclick="document.getElementById('restoreFile').click()">⬆ Restore from Backup</button>
        <input type="file" id="restoreFile" accept=".json" class="hidden" onchange="restoreBackup(this.files[0])">
      </div>
    </div>

    <div class="set-group"><h3>📜 Audit Log</h3><div class="desc">All important changes are recorded. Admin only.</div>
      <div id="auditListWrap"></div>
    </div>` : ''}

    <div class="set-group"><h3>🔐 Account</h3><div class="desc">Signed in as <b>${escapeHtml(currentUserDoc ? currentUserDoc.email : '')}</b> (${escapeHtml(currentUserDoc ? currentUserDoc.role : '')})</div>
      <button class="btn btn-gray btn-sm" onclick="doLogout()">🚪 Sign Out</button>
    </div>
  `;
  renderUserList();
  renderAuditLog();
  renderLogoPreview();
  renderLogo();
}

async function saveBizSettings() {
  if (!guardAdmin()) return;
  const data = {
    businessName: document.getElementById('setBizName').value.trim(),
    businessAddress: document.getElementById('setBizAddr').value.trim(),
    businessPhone: document.getElementById('setBizPhone').value.trim(),
    businessEmail: document.getElementById('setBizEmail').value.trim(),
    currency: document.getElementById('setCurrency').value.trim() || '₱',
    taxRate: parseFloat(document.getElementById('setTax').value) || 0
  };
  try {
    await saveSettings(data);
    await logAudit('edited', 'settings', 'main', null, data);
    updateTopBar();
    showToast('Settings saved ✓', 'success');
  } catch (e) { showToast('Error: ' + (e.message || ''), 'error'); }
}

// ---- Business logo ----
let _logoDataUrl = null;
function renderLogoPreview() {
  const el = document.getElementById('logoPreview');
  if (!el) return;
  const logo = _logoDataUrl || (settingsCache && settingsCache.businessLogo);
  if (logo) {
    el.innerHTML = '';
    const img = document.createElement('img');
    img.src = logo;
    img.style.cssText = 'width:100%;height:100%;object-fit:contain';
    el.appendChild(img);
  } else {
    el.innerHTML = '🖨️';
  }
}
function previewLogo(input) {
  const file = input.files && input.files[0];
  if (!file) { showToast('Pumili ng image file', 'error'); return; }
  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      // Resize to max 256x256 to keep Firestore doc small
      const max = 256;
      let w = img.width, h = img.height;
      if (w > max || h > max) {
        const ratio = Math.min(max / w, max / h);
        w = Math.round(w * ratio); h = Math.round(h * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      _logoDataUrl = canvas.toDataURL('image/png');
      renderLogoPreview();
      showToast('Logo ready — i-click ang Save Logo', 'info');
    };
    img.onerror = function () { showToast('Hindi mabasa ang image', 'error'); };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
async function saveLogo() {
  if (!guardAdmin()) return;
  if (!_logoDataUrl) { showToast('Pumili muna ng logo image', 'error'); return; }
  try {
    await saveSettings({ businessLogo: _logoDataUrl });
    await logAudit('edited', 'logo', 'main', null, { hasLogo: true });
    _logoDataUrl = null;
    renderLogo();
    renderSettings();
    showToast('Logo saved ✓', 'success');
  } catch (e) { showToast('Error: ' + (e.message || ''), 'error'); }
}
async function removeLogo() {
  if (!guardAdmin()) return;
  confirmModal('Alisin ang logo?', 'Babalik sa default na 🖨️ icon.', async () => {
    try {
      await saveSettings({ businessLogo: '' });
      await logAudit('edited', 'logo', 'main', null, { hasLogo: false });
      _logoDataUrl = null;
      renderLogo();
      renderSettings();
      showToast('Logo removed', 'success');
    } catch (e) { showToast('Error: ' + (e.message || ''), 'error'); }
  });
}

// ---- Categories editor ----
async function editCategories(kind) {
  if (!guardWrite()) return;
  const cats = await getCategories();
  const list = kind === 'sales' ? cats.sales : cats.expenses;
  openModal(`✎ Manage ${kind === 'sales' ? 'Sales' : 'Expense'} Categories`, `
    <div id="catList"></div>
    <div class="flex mt-8">
      <input type="text" id="newCatName" placeholder="New category name" class="flex-1" style="padding:9px 10px;border:1.5px solid var(--gray-300);border-radius:var(--radius-sm)">
      <button class="btn btn-yellow btn-sm" onclick="addCategory('${kind}')">+ Add</button>
    </div>
  `, `<button class="btn btn-gray btn-sm" onclick="closeModal()">Close</button>
     <button class="btn btn-yellow btn-sm" onclick="saveCategories('${kind}')">💾 Save All</button>`);
  document.getElementById('catList').innerHTML = list.map((c, i) => `
    <div class="set-row"><span class="sr-lbl">${escapeHtml(c)}</span><button class="btn btn-danger btn-sm" onclick="removeCategoryRow(this)">🗑</button></div>
  `).join('') || '<div class="muted">No categories</div>';
  window._catKind = kind;
  window._catList = list;
}
function addCategory(kind) {
  const name = document.getElementById('newCatName').value.trim();
  if (!name) return;
  const wrap = document.getElementById('catList');
  const div = document.createElement('div');
  div.className = 'set-row';
  div.innerHTML = `<span class="sr-lbl">${escapeHtml(name)}</span><button class="btn btn-danger btn-sm" onclick="removeCategoryRow(this)">🗑</button>`;
  wrap.appendChild(div);
  document.getElementById('newCatName').value = '';
}
function removeCategoryRow(btn) {
  btn.closest('.set-row').remove();
}
async function saveCategories(kind) {
  if (!guardWrite()) return;
  const rows = [...document.querySelectorAll('#catList .set-row .sr-lbl')].map(el => el.textContent.trim()).filter(Boolean);
  if (!rows.length) { showToast('At least one category required', 'error'); return; }
  const s = settingsCache || {};
  const data = kind === 'sales' ? { saleCategories: rows } : { expenseCategories: rows };
  await saveSettings(data);
  await logAudit('edited', 'categories', kind, null, data);
  closeModal();
  populateSalesCatFilter(); populateExpCatFilter();
  showToast('Categories saved ✓', 'success');
}

// ---- Users ----
function renderUserList() {
  const el = document.getElementById('userListWrap');
  if (!el) return;
  const roleBadge = r => `<span class="badge ${r === 'admin' ? 'yellow' : r === 'staff' ? 'blue' : 'gray'}">${escapeHtml(r)}</span>`;
  el.innerHTML = State.users.map(u => `
    <div class="set-row">
      <div><div class="sr-lbl">${escapeHtml(u.name || u.email)} ${u.uid === currentUser.uid ? '<span class="badge green">you</span>' : ''}</div><div class="sr-sub">${escapeHtml(u.email || '')}</div></div>
      ${isAdmin() ? `<select onchange="changeUserRole('${u.uid}', this.value)" ${u.uid === currentUser.uid ? 'disabled' : ''} style="padding:6px 8px;border:1.5px solid var(--gray-300);border-radius:var(--radius-sm);font-size:12px">
        ${ROLES.map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}
      </select>
      ${u.uid !== currentUser.uid ? `<button class="btn btn-danger btn-sm" onclick="deleteUser('${u.uid}')" title="Remove user access">🗑</button>` : ''}`
      : roleBadge(u.role)}
    </div>`).join('') || '<div class="muted">No users yet</div>';
}
function deleteUser(uid) {
  if (!guardAdmin()) return;
  const u = State.users.find(x => x.uid === uid);
  if (!u) return;
  if (uid === currentUser.uid) { showToast("You can't delete yourself", 'error'); return; }
  confirmDelete(`Remove user "${u.name || u.email}"? They will lose access to the system.`, async () => {
    try {
      await db.collection(COLL.users).doc(uid).delete();
      await logAudit('deleted', 'user', uid, null, { email: u.email });
      State.users = State.users.filter(x => x.uid !== uid);
      renderSettings();
      showToast('User removed ✓', 'success');
    } catch (e) { showToast('Error: ' + (e.message || ''), 'error'); }
  });
}
function openAddUserModal() {
  if (!guardAdmin()) return;
  openModal('+ Add User', `
    <div class="form-grid">
      <div class="field"><label>Name</label><input type="text" id="nuName" placeholder="e.g., Maria"></div>
      <div class="field"><label>Email *</label><input type="email" id="nuEmail" placeholder="staff@email.com"></div>
      <div class="field"><label>Password *</label><input type="password" id="nuPass" placeholder="min 6 chars"></div>
      <div class="field"><label>Role</label><select id="nuRole">${ROLES.map(r => `<option value="${r}" ${r === 'staff' ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
    </div>
    <div class="mt-8" style="padding:10px;background:var(--blue-bg);border-radius:8px;font-size:12px">New users are created in Firebase Authentication with this email/password.</div>
  `, `<button class="btn btn-gray btn-sm" onclick="closeModal()">Cancel</button>
     <button class="btn btn-yellow btn-sm" id="saveNuBtn">✅ Create User</button>`);
  document.getElementById('saveNuBtn').onclick = createUser;
}
async function createUser() {
  if (!guardAdmin()) return;
  const name = document.getElementById('nuName').value.trim();
  const email = document.getElementById('nuEmail').value.trim();
  const pass = document.getElementById('nuPass').value;
  const role = document.getElementById('nuRole').value;
  if (!email || pass.length < 6) { showToast('Email + password (min 6 chars) required', 'error'); return; }
  try {
    // create in Firebase Auth via REST (client SDK cannot create users)
    const key = FIREBASE_CONFIG.apiKey;
    const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass, returnSecureToken: false })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);
    const uid = data.localId;
    await db.collection(COLL.users).doc(uid).set({
      uid, email, name: name || email.split('@')[0], role,
      createdAt: nowTS(), updatedAt: nowTS()
    });
    await logAudit('created', 'user', uid, null, { email, role });
    closeModal();
    renderSettings();
    showToast(`User created ✓ (${role})`, 'success');
  } catch (e) { console.error(e); showToast('Error: ' + (e.message || ''), 'error'); }
}
async function changeUserRole(uid, role) {
  if (!guardAdmin()) return;
  const u = State.users.find(x => x.uid === uid);
  if (!u) return;
  if (uid === currentUser.uid) { showToast("You can't change your own role", 'error'); renderUserList(); return; }
  try {
    await db.collection(COLL.users).doc(uid).update({ role, updatedAt: nowTS() });
    await logAudit('edited', 'user_role', uid, { role: u.role }, { role });
    showToast(`Role updated → ${role}`, 'success');
    renderUserList();
  } catch (e) { showToast('Error: ' + (e.message || ''), 'error'); }
}

// ---- Retention ----
function retentionCutoff() {
  const ret = getRetentionConfig();
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - ret.months, now.getDate());
}
function retentionEligibleCount() {
  const ret = getRetentionConfig();
  if (ret.mode === 'disabled' || !ret.enabled) return { sales: 0, expenses: 0, payments: 0, invTx: 0, projRev: 0, projExp: 0, projects: 0, total: 0, oldest: null };
  const cutoff = retentionCutoff();
  const older = (d) => { const x = tsToDate(d); return x && x.getTime() < cutoff.getTime(); };
  const sales = activeSales().filter(s => older(s.date));
  const expenses = activeExpenses().filter(e => older(e.date));
  const payments = State.payments.filter(p => !p.archived && older(p.date));
  const invTx = State.invTx.filter(t => !t.archived && older(t.date || t.createdAt));
  const projRev = State.projRev.filter(r => !r.archived && older(r.date || r.createdAt));
  const projExp = State.projExp.filter(e => !e.archived && older(e.date || e.createdAt));
  // Historical project records: completed/delivered projects older than retention
  const projects = activeProjects().filter(p => ['Completed', 'Delivered'].includes(p.status) && older(p.endDate || p.targetDate || p.createdAt));
  const allDates = [...sales, ...expenses, ...payments, ...invTx, ...projRev, ...projExp].map(x => tsToDate(x.date || x.createdAt)).filter(Boolean);
  const oldest = allDates.length ? new Date(Math.min(...allDates.map(d => d.getTime()))) : null;
  const total = sales.length + expenses.length + payments.length + invTx.length + projRev.length + projExp.length + projects.length;
  return { sales: sales.length, expenses: expenses.length, payments: payments.length, invTx: invTx.length, projRev: projRev.length, projExp: projExp.length, projects: projects.length, total, oldest };
}
function retentionOldestDate() {
  return retentionEligibleCount().oldest;
}
async function saveRetentionSettings() {
  if (!guardAdmin()) return;
  const data = {
    retentionEnabled: document.getElementById('retMode').value !== 'disabled',
    retentionMode: document.getElementById('retMode').value,
    retentionMonths: parseInt(document.getElementById('retMonths').value, 10)
  };
  try {
    await saveSettings(data);
    await logAudit('edited', 'retention', 'main', null, data);
    renderSettings();
    showToast('Retention settings saved ✓', 'success');
  } catch (e) { showToast('Error: ' + (e.message || ''), 'error'); }
}
async function runRetentionCheck() {
  // runs on login (admin) — archive/delete eligible records
  if (!isAdmin()) return;
  const ret = getRetentionConfig();
  if (ret.mode === 'disabled' || !ret.enabled) return;
  const cutoff = retentionCutoff();
  const older = (d) => { const x = tsToDate(d); return x && x.getTime() < cutoff.getTime(); };
  const eligibleSales = activeSales().filter(s => older(s.date));
  const eligibleExpenses = activeExpenses().filter(e => older(e.date));
  const eligiblePayments = State.payments.filter(p => !p.archived && older(p.date));
  const eligibleInvTx = State.invTx.filter(t => !t.archived && older(t.date || t.createdAt));
  const eligibleProjRev = State.projRev.filter(r => !r.archived && older(r.date || r.createdAt));
  const eligibleProjExp = State.projExp.filter(e => !e.archived && older(e.date || e.createdAt));
  const eligibleProjects = activeProjects().filter(p => ['Completed', 'Delivered'].includes(p.status) && older(p.endDate || p.targetDate || p.createdAt));
  const totalEligible = eligibleSales.length + eligibleExpenses.length + eligiblePayments.length + eligibleInvTx.length + eligibleProjRev.length + eligibleProjExp.length + eligibleProjects.length;
  try {
    if (totalEligible > 0) {
      // Retention warning notice (spec: notify admin before cleanup)
      showToast(`🗄 DATA RETENTION NOTICE: ${totalEligible} record(s) reached ${ret.months}-month retention. Oldest: ${fmtDate(retentionOldestDate())}. Mode: ${ret.mode.toUpperCase()}`, 'info');
    }
    if (ret.mode === 'archive') {
      // soft-archive: mark archived=true (records stay in DB, hidden from views)
      let n = 0;
      let batch = db.batch();
      let ops = 0;
      const process = async (coll, list) => {
        for (const doc of list) {
          if (ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
          batch.update(db.collection(coll).doc(doc.id), { archived: true, archivedAt: nowTS() });
          ops++; n++;
        }
      };
      await process(COLL.sales, eligibleSales);
      await process(COLL.expenses, eligibleExpenses);
      await process(COLL.payments, eligiblePayments);
      await process(COLL.invTx, eligibleInvTx);
      await process(COLL.projRev, eligibleProjRev);
      await process(COLL.projExp, eligibleProjExp);
      await process(COLL.projects, eligibleProjects);
      if (ops > 0) await batch.commit();
      if (n > 0) {
        await logAudit('retention', 'archive', 'bulk', null, { count: n, mode: 'archive', cutoff: dateInputVal(cutoff) });
        showToast(`🗄 Archived ${n} old record(s)`, 'info');
      }
    } else if (ret.mode === 'delete') {
      // permanent delete — requires explicit admin activation (mode=delete)
      if (totalEligible > 0) {
        const ok = confirm(`PERMANENT DELETE ${totalEligible} record(s) older than ${ret.months} months?\n\nThis CANNOT be undone. Make sure you have a backup.`);
        if (!ok) return;
      }
      let ops = 0; let batch = db.batch(); let n = 0;
      const del = async (coll, list) => {
        for (const doc of list) {
          batch.delete(db.collection(coll).doc(doc.id)); ops++; n++;
          if (ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
        }
      };
      await del(COLL.sales, eligibleSales);
      await del(COLL.expenses, eligibleExpenses);
      await del(COLL.payments, eligiblePayments);
      await del(COLL.invTx, eligibleInvTx);
      await del(COLL.projRev, eligibleProjRev);
      await del(COLL.projExp, eligibleProjExp);
      await del(COLL.projects, eligibleProjects);
      if (ops > 0) await batch.commit();
      if (n > 0) {
        await logAudit('retention', 'delete', 'bulk', null, { count: n, mode: 'delete', cutoff: dateInputVal(cutoff) });
        showToast(`🗑 Deleted ${n} old record(s)`, 'info');
      }
    }
  } catch (e) {
    console.error('retention error', e);
    showToast('Retention cleanup stopped — error: ' + (e.message || ''), 'error');
  }
}
function runRetentionNow() {
  if (!guardAdmin()) { showToast('Admin only', 'error'); return; }
  runRetentionCheck().then(() => renderSettings());
}

// ---- Backup / Restore ----
async function exportBackup() {
  if (!guardAdmin()) return;
  const data = {
    app: 'jb-printing-system', version: 3,
    exportedAt: new Date().toISOString(),
    settings: settingsCache || {},
    customers: State.customers, suppliers: State.suppliers,
    sales: State.sales, expenses: State.expenses,
    inventory: State.inventory, inventory_transactions: State.invTx,
    projects: State.projects, project_revenue: State.projRev,
    project_expenses: State.projExp, payments: State.payments,
    users: State.users
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `jb-backup-${dateInputVal(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  // Cloud copy: store the snapshot in Firestore too (admin-only collection)
  try {
    await db.collection(COLL.backups).add({
      fileName: a.download,
      createdAt: nowTS(),
      counts: {
        sales: data.sales.length, expenses: data.expenses.length, inventory: data.inventory.length,
        inventory_transactions: data.inventory_transactions.length, projects: data.projects.length,
        project_revenue: data.project_revenue.length, project_expenses: data.project_expenses.length,
        payments: data.payments.length, customers: data.customers.length, suppliers: data.suppliers.length,
        users: data.users.length
      }
    });
  } catch (e) { console.warn('cloud backup copy failed', e); }
  await logAudit('backup', 'system', 'export', null, { size: data.sales.length + data.expenses.length + data.inventory.length + data.projects.length + data.customers.length });
  showToast('Backup downloaded ✓', 'success');
}
function exportBackupExcel() {
  const wb = XLSX.utils.book_new();
  const add = (name, arr, map) => { const ws = XLSX.utils.json_to_sheet(arr.map(map)); XLSX.utils.book_append_sheet(wb, ws, name); };
  add('Sales', State.sales, s => ({ ID: s.transactionId, Date: fmtDate(s.date), Customer: s.customerName, Items: (s.items || []).map(i => i.product).join(', '), Total: saleTotal(s), Status: s.paymentStatus }));
  add('Expenses', State.expenses, e => ({ ID: e.expenseId, Date: fmtDate(e.date), Category: e.category, Description: e.description, Amount: e.amount }));
  add('Inventory', activeInventory(), i => ({ Item: i.name, SKU: i.sku, Stock: i.currentStock, Unit: i.unit, Cost: i.costPerUnit, Value: (Number(i.currentStock) || 0) * (Number(i.costPerUnit) || 0) }));
  add('Projects', activeProjects(), p => ({ Name: p.name, Status: p.status, Contract: p.contractPrice, Paid: projectPaidTotal(p.id), Profit: projectProfit(p) }));
  add('Customers', State.customers, c => ({ Name: c.name, Contact: c.contactNumber, Email: c.email }));
  add('Suppliers', State.suppliers, s => ({ Name: s.name, Contact: s.contactPerson, Phone: s.phone }));
  XLSX.writeFile(wb, 'jb-backup.xlsx');
}
async function restoreBackup(file) {
  if (!guardAdmin()) return;
  if (!busyStart()) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.sales || !data.expenses) { showToast('Not a valid backup file', 'error'); return; }
    const counts = `Sales: ${data.sales.length} · Expenses: ${data.expenses.length} · Inventory: ${data.inventory ? data.inventory.length : 0} · Projects: ${data.projects ? data.projects.length : 0}`;
    confirmModal('⚠️ Restore Backup', `This will OVERWRITE current data with the backup.\n\n${counts}\n\nThis cannot be undone. Proceed?`, async () => {
      try {
        const clear = async (coll) => {
          // loop until empty to clear >400 docs safely
          for (let i = 0; i < 20; i++) {
            const snap = await db.collection(coll).limit(400).get();
            if (snap.empty) return;
            const b = db.batch();
            snap.forEach(d => b.delete(d.ref));
            await b.commit();
          }
        };
        await clear(COLL.sales); await clear(COLL.expenses); await clear(COLL.inventory); await clear(COLL.invTx);
        await clear(COLL.projects); await clear(COLL.projRev); await clear(COLL.projExp); await clear(COLL.payments);
        await clear(COLL.customers); await clear(COLL.suppliers);
        const writeAll = async (coll, list) => {
          let b = db.batch(); let ops = 0;
          for (const item of list) {
            const { id, ...rest } = item;
            const ref = id ? db.collection(coll).doc(id) : db.collection(coll).doc();
            b.set(ref, rest, { merge: true }); ops++;
            if (ops >= 450) { await b.commit(); b = db.batch(); ops = 0; }
          }
          if (ops > 0) await b.commit();
        };
        await writeAll(COLL.sales, data.sales || []);
        await writeAll(COLL.expenses, data.expenses || []);
        await writeAll(COLL.inventory, data.inventory || []);
        await writeAll(COLL.invTx, data.inventory_transactions || []);
        await writeAll(COLL.projects, data.projects || []);
        await writeAll(COLL.projRev, data.project_revenue || []);
        await writeAll(COLL.projExp, data.project_expenses || []);
        await writeAll(COLL.payments, data.payments || []);
        await writeAll(COLL.customers, data.customers || []);
        await writeAll(COLL.suppliers, data.suppliers || []);
        // settings + users (roles come from the backup; ADMIN_EMAILS safety net still
        // force-promotes the owner on next login)
        if (data.settings) await db.collection(COLL.settings).doc('main').set(data.settings, { merge: true });
        if (data.users) await writeAll(COLL.users, data.users);
        await logAudit('restore', 'system', 'import', null, { counts });
        settingsCache = null; await loadSettings(true);
        await loadAllData();
        // Verification: compare restored counts with backup counts
        const verify = [
          ['Sales', State.sales.length, (data.sales || []).length],
          ['Expenses', State.expenses.length, (data.expenses || []).length],
          ['Inventory', State.inventory.length, (data.inventory || []).length],
          ['Inventory Tx', State.invTx.length, (data.inventory_transactions || []).length],
          ['Projects', State.projects.length, (data.projects || []).length],
          ['Payments', State.payments.length, (data.payments || []).length],
          ['Customers', State.customers.length, (data.customers || []).length],
          ['Suppliers', State.suppliers.length, (data.suppliers || []).length]
        ];
        const mismatches = verify.filter(([n, a, b]) => a !== b);
        if (mismatches.length) {
          showToast('Restore finished but some counts differ: ' + mismatches.map(m => `${m[0]} ${m[1]}/${m[2]}`).join(', '), 'error');
        } else {
          showToast('✅ Restore complete and verified!', 'success');
        }
        renderSettings();
      } catch (e) { console.error(e); showToast(friendlyError(e, 'Restore failed. Please try again.'), 'error'); }
    }, 'Restore', true);
  } catch (e) { showToast('Invalid backup file', 'error'); }
  finally { busyEnd(); }
}

// ---- Audit log ----
function renderAuditLog() {
  const el = document.getElementById('auditListWrap');
  if (!el) return;
  const logs = [...State.audit].sort((a, b) => (tsToDate(b.createdAt) || 0) - (tsToDate(a.createdAt) || 0)).slice(0, 50);
  const actionLabel = { created: ['➕', 'green'], edited: ['✎', 'blue'], deleted: ['🗑', 'red'], restock: ['📦', 'green'], usage: ['⏱', 'orange'], sold: ['💰', 'blue'], damaged: ['⚠️', 'red'], lost: ['❌', 'red'], adjustment: ['±', 'orange'], payment: ['💵', 'green'], retention: ['🗄', 'gray'], backup: ['💾', 'blue'], restore: ['⬆', 'blue'] };
  el.innerHTML = `<div class="tbl-wrap"><table class="tbl" style="min-width:520px"><thead><tr><th>When</th><th>User</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
    <tbody>${logs.map(l => {
      const [ico, cls] = actionLabel[l.action] || ['•', 'gray'];
      let detail = '';
      try { const nv = JSON.parse(l.newValue); if (nv) detail = Object.entries(nv).map(([k, v]) => `${k}: ${v}`).join(', '); } catch (e) {}
      return `<tr><td>${escapeHtml(fmtDateTime(l.createdAt))}</td><td>${escapeHtml(l.userName || '')}</td><td><span class="badge ${cls}">${ico} ${escapeHtml(l.action)}</span></td><td>${escapeHtml(l.recordType || '')}</td><td class="muted">${escapeHtml(detail || l.recordId || '')}</td></tr>`;
    }).join('') || `<tr><td colspan="5">${emptyState('📜', 'No audit records yet')}</td></tr>`}</tbody></table></div>`;
}
