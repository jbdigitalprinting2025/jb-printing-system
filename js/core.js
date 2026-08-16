// ============================================================
// CORE — app state, navigation, login flow, realtime subscriptions
// ============================================================
// Global cached data (mirrors Firestore, updated in realtime)
const State = {
  sales: [],
  expenses: [],
  inventory: [],
  invTx: [],
  projects: [],
  projRev: [],
  projExp: [],
  customers: [],
  suppliers: [],
  payments: [],
  audit: [],
  users: [],
  ready: false,
  unsubs: [],
  currentPage: 'dashboard'
};

function showLogin() {
  document.getElementById('appShell').classList.remove('visible');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('loginError').textContent = '';
}
function enterApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.add('visible');
  const ld = document.getElementById('loadingOverlay');
  if (ld) ld.classList.add('show');
  updateTopBar();
  loadAllData().then(() => {
    State.ready = true;
    if (ld) ld.classList.remove('show');
    setupRealtime();
    go(State.currentPage);
    runRetentionCheck(); // data retention (archive/delete) — admin only, safe
  }).catch(() => {
    if (ld) ld.classList.remove('show');
    showToast('Unable to load data. Check your connection and refresh.', 'error');
  });
}
function updateTopBar() {
  const name = currentUserDoc ? (currentUserDoc.name || currentUser.email) : '';
  const role = currentUserDoc ? currentUserDoc.role : '';
  document.getElementById('topbarUserName').textContent = name;
  const rb = document.getElementById('topbarRole');
  rb.textContent = role;
  rb.className = 'role-badge ' + role;
  if (settingsCache && settingsCache.businessName) {
    document.getElementById('topbarBizName').textContent = settingsCache.businessName;
    document.getElementById('loginBizName').textContent = settingsCache.businessAddress || 'Tigaon, Camarines Sur';
  }
  renderLogo();
}
// Show business logo in topbar + login screen (if set in settings)
function renderLogo() {
  const logo = settingsCache && settingsCache.businessLogo;
  const setLogo = (elId) => {
    const el = document.getElementById(elId);
    if (!el) return;
    if (logo) {
      el.innerHTML = '';
      const img = document.createElement('img');
      img.src = logo;
      el.appendChild(img);
    } else {
      el.innerHTML = '🖨️';
    }
  };
  setLogo('topbarLogo');
  setLogo('loginLogo');
}

// ---- Login ----
async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');
  if (!email || !pass) { errEl.textContent = 'Please enter email and password.'; return; }
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Signing in...';
  errEl.textContent = '';
  try {
    await auth.signInWithEmailAndPassword(email, pass);
    errEl.textContent = '';
  } catch (e) {
    const code = e.code || '';
    if (code.includes('user-not-found') || code.includes('wrong-password') || code.includes('invalid-credential')) {
      errEl.textContent = 'Wrong email or password.';
    } else if (code.includes('too-many-requests')) {
      errEl.textContent = 'Too many attempts. Try again later.';
    } else if (code.includes('network')) {
      errEl.textContent = 'No internet connection.';
    } else {
      errEl.textContent = 'Login failed: ' + (e.message || 'unknown error');
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Sign In';
  }
}
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !document.getElementById('loginScreen').classList.contains('hidden')) {
    doLogin();
  }
});

async function doLogout() {
  await auth.signOut();
  State.unsubs.forEach(u => u());
  State.unsubs = [];
  State.ready = false;
}

// ---- Navigation ----
function go(page) {
  State.currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  document.querySelectorAll('.bn-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  closeSidebar();
  window.scrollTo(0, 0);
  // render on demand
  switch (page) {
    case 'dashboard': renderDashboard(); break;
    case 'calendar': renderCalendar(); break;
    case 'sales': renderSales(); break;
    case 'expenses': renderExpenses(); break;
    case 'inventory': renderInventory(); renderInvHistory(); break;
    case 'projects': renderProjects(); break;
    case 'customers': renderCustomers(); break;
    case 'suppliers': renderSuppliers(); break;
    case 'pnl': renderPnL(); break;
    case 'reports': renderReports(); break;
    case 'settings': renderSettings(); break;
  }
}
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
}

// ---- Load all data (initial) ----
async function loadAllData() {
  const tasks = [
    loadSettings(true),
    fetchColl(COLL.sales, 'sales'),
    fetchColl(COLL.expenses, 'expenses'),
    fetchColl(COLL.inventory, 'inventory'),
    fetchColl(COLL.invTx, 'invTx', 200),
    fetchColl(COLL.projects, 'projects'),
    fetchColl(COLL.projRev, 'projRev'),
    fetchColl(COLL.projExp, 'projExp'),
    fetchColl(COLL.customers, 'customers'),
    fetchColl(COLL.suppliers, 'suppliers'),
    fetchColl(COLL.payments, 'payments')
  ];
  // users + audit logs: admin only (rules deny others; avoids permission noise)
  if (currentUserDoc && currentUserDoc.role === 'admin') {
    tasks.push(fetchColl(COLL.users, 'users'));
    tasks.push(fetchColl(COLL.audit, 'audit', 300));
  } else {
    State.users = [];
    State.audit = [];
  }
  try {
    await Promise.all(tasks);
  } catch (e) {
    // individual fetches swallow their own errors; this catches unexpected failures
  }
  const failed = State._loadErrors || [];
  State._loadErrors = [];
  if (failed.length) {
    showToast('Unable to load some data: ' + failed.join(', ') + '. Check your connection.', 'error');
  }
}
async function fetchColl(collection, stateKey, limit = 1000) {
  try {
    let q = db.collection(collection);
    if (limit) q = q.limit(limit);
    const snap = await q.get();
    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    State[stateKey] = items;
  } catch (e) {
    console.error('fetchColl error', collection, e);
    State[stateKey] = [];
    if (e && e.code && e.code !== 'permission-denied') {
      State._loadErrors = State._loadErrors || [];
      State._loadErrors.push(collection);
    }
  }
}

// ---- Realtime subscriptions ----
function setupRealtime() {
  // Only subscribe to collections the user can see; keep it light.
  // NOTE: invTx/payments/projRev/projExp MUST be subscribed too — otherwise
  // movements/payments created during the session never reach State and P&L,
  // inventory history, and project cards go stale until a page reload (bug
  // found during UAT Aug 16 2026).
  const subs = [
    [COLL.sales, 'sales', onSalesChanged],
    [COLL.expenses, 'expenses', onExpensesChanged],
    [COLL.inventory, 'inventory', onInventoryChanged],
    [COLL.invTx, 'invTx', onInvTxChanged],
    [COLL.projects, 'projects', onProjectsChanged],
    [COLL.projRev, 'projRev', onProjRevChanged],
    [COLL.projExp, 'projExp', onProjExpChanged],
    [COLL.payments, 'payments', onPaymentsChanged],
    [COLL.customers, 'customers', onCustomersChanged],
    [COLL.suppliers, 'suppliers', onSuppliersChanged]
  ];
  subs.forEach(([coll, key, cb]) => {
    // NOTE: no orderBy on snapshot — legacy docs may lack createdAt, which would
    // fail the whole query. Views sort client-side instead.
    const un = db.collection(coll)
      .onSnapshot(snap => {
        const items = [];
        snap.forEach(d => items.push({ id: d.id, ...d.data() }));
        State[key] = items;
        cb && cb();
      }, err => console.error('rt err', coll, err));
    State.unsubs.push(un);
  });
}
function onInvTxChanged() { if (State.currentPage === 'inventory' || State.currentPage === 'pnl' || State.currentPage === 'reports' || State.currentPage === 'dashboard') rerenderCurrent(); }
function onProjRevChanged() { if (State.currentPage === 'projects' || State.currentPage === 'dashboard' || State.currentPage === 'reports') rerenderCurrent(); }
function onProjExpChanged() { if (State.currentPage === 'projects' || State.currentPage === 'dashboard' || State.currentPage === 'reports') rerenderCurrent(); }
function onPaymentsChanged() { if (State.currentPage === 'projects' || State.currentPage === 'dashboard' || State.currentPage === 'reports') rerenderCurrent(); }
function onSalesChanged() { if (State.currentPage === 'sales' || State.currentPage === 'dashboard' || State.currentPage === 'calendar' || State.currentPage === 'pnl' || State.currentPage === 'reports') rerenderCurrent(); }
function onExpensesChanged() { if (State.currentPage === 'expenses' || State.currentPage === 'dashboard' || State.currentPage === 'calendar' || State.currentPage === 'pnl' || State.currentPage === 'reports') rerenderCurrent(); }
function onInventoryChanged() { if (State.currentPage === 'inventory' || State.currentPage === 'dashboard') rerenderCurrent(); }
function onProjectsChanged() { if (State.currentPage === 'projects' || State.currentPage === 'dashboard' || State.currentPage === 'pnl' || State.currentPage === 'reports') rerenderCurrent(); }
function onCustomersChanged() { if (State.currentPage === 'customers' || State.currentPage === 'sales') rerenderCurrent(); }
function onSuppliersChanged() { if (State.currentPage === 'suppliers' || State.currentPage === 'expenses' || State.currentPage === 'inventory') rerenderCurrent(); }
function rerenderCurrent() {
  switch (State.currentPage) {
    case 'dashboard': renderDashboard(); break;
    case 'calendar': renderCalendar(); break;
    case 'sales': renderSales(); break;
    case 'expenses': renderExpenses(); break;
    case 'inventory': renderInventory(); renderInvHistory(); break;
    case 'projects': renderProjects(); break;
    case 'customers': renderCustomers(); break;
    case 'suppliers': renderSuppliers(); break;
    case 'pnl': renderPnL(); break;
    case 'reports': renderReports(); break;
  }
}

// ---- Aggregations (shared) ----
function sumBy(items, fn) {
  return items.reduce((s, it) => s + (Number(fn(it)) || 0), 0);
}
function saleTotal(s) {
  if (s.total !== undefined && s.total !== null) return round2(Number(s.total)) || 0;
  return round2((Array.isArray(s.items) ? s.items : []).reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0));
}
function salePaid(s) {
  const total = saleTotal(s);
  const status = s.paymentStatus || 'Unpaid';
  if (status === 'Paid') return total;
  if (status === 'Partial') return round2(Math.min(total, Number(s.amountPaid) || 0));
  return 0;
}
function saleBalance(s) { return round2(saleTotal(s) - salePaid(s)); }
function isArchived(doc) { return doc && doc.archived === true; }
function activeSales() { return State.sales.filter(s => !isArchived(s)); }
function activeExpenses() { return State.expenses.filter(e => !isArchived(e)); }
function activeProjects() { return State.projects.filter(p => !isArchived(p)); }

// ---- Global quick add (bottom nav / calendar) ----
function openQuickAdd(type, presetDate) {
  if (!guardWrite()) return;
  if (type === 'income') openSaleModal(null, presetDate);
  else openExpenseModal(null, presetDate);
}
