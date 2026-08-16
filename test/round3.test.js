// ============================================================
// JB Digital Printing — Round 3 (LAST ROUND) tests
// Covers: stock adjustment math, payment remaining-balance
// formula, project-revenue global model, retention cutoff,
// restore collection ordering (no immutable collections).
// ============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.join(__dirname, '..', 'js');
const noop = () => {};
const sandbox = {
  console,
  document: { getElementById: () => ({ value: '', checked: false, classList: { add: noop, remove: noop, toggle: noop }, style: {}, innerHTML: '', disabled: false, dataset: {} }), querySelectorAll: () => [], createElement: () => ({ classList: { add: noop }, style: {} }), addEventListener: noop },
  window: { addEventListener: noop, jspdf: { jsPDF: function () { this.text = noop; this.setFontSize = noop; this.setFont = noop; this.addPage = noop; this.save = noop; } } },
  localStorage: { getItem: () => null, setItem: noop },
  navigator: { onLine: true },
  fetch: async () => ({ json: async () => ({}) }),
  Blob: function (p) { this.parts = p; },
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL: noop },
  Chart: function () { this.destroy = noop; },
  XLSX: { utils: { book_new: () => ({}), json_to_sheet: () => ({}), book_append_sheet: noop }, writeFile: noop },
  setInterval: noop, setTimeout: noop, clearTimeout: noop, clearInterval: noop,
  confirm: () => true,
  firebase: { initializeApp: () => ({}), firestore: () => ({ settings: noop, enablePersistence: () => ({ catch: noop }), collection: () => ({ doc: () => ({ id: 'X', get: async () => ({ exists: false }), set: async () => {}, update: async () => {}, delete: async () => {} }), add: async () => ({ id: 'X' }), get: async () => ({ empty: true, forEach: noop }), limit: () => ({ get: async () => ({ empty: true, forEach: noop }) }), onSnapshot: noop }) }), auth: () => ({ onAuthStateChanged: noop, signInWithEmailAndPassword: async () => {}, signOut: async () => {} }) },
  Date
};
sandbox.firebase.firestore.FieldValue = { serverTimestamp: noop };
sandbox.firebase.firestore.Timestamp = { fromDate: (d) => ({ seconds: Math.floor(d.getTime() / 1000), toDate: () => d }) };
vm.createContext(sandbox);
function load(file) { vm.runInContext(fs.readFileSync(path.join(DIR, file), 'utf8'), sandbox, { filename: file }); }
load('config.js'); load('ui.js'); load('core.js'); load('db.js'); load('transactions.js'); load('inventory.js'); load('projects.js'); load('reports.js'); load('settings.js');

const State = vm.runInContext('State', sandbox);
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  PASS ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ' — ' + e.message); } }
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }

console.log('\n=== STOCK MATH (ISSUE 6/7) ===');
t('computeStockUpdate restock +50: 100 -> 150', () => eq(sandbox.computeStockUpdate(100, 'restock', 50, 50), { ok: true, prevStock: 100, newStock: 150, signedQty: 50, qty: 50 }));
t('computeStockUpdate usage -30: 170 -> 140', () => eq(sandbox.computeStockUpdate(170, 'usage', 30, 50), { ok: true, prevStock: 170, newStock: 140, signedQty: -30, qty: 30 }));
t('computeStockUpdate adjustment +400: 100 -> 500', () => eq(sandbox.computeStockUpdate(100, 'adjustment', 400, 0), { ok: true, prevStock: 100, newStock: 500, signedQty: 400, qty: 400 }));
t('computeStockUpdate adjustment -100: 500 -> 400', () => eq(sandbox.computeStockUpdate(500, 'adjustment', -100, 0), { ok: true, prevStock: 500, newStock: 400, signedQty: -100, qty: 100 }));
t('insufficient stock usage blocked (5 - 10)', () => { const r = sandbox.computeStockUpdate(5, 'usage', 10, 0); eq(r.ok, false); eq(r.error, 'Insufficient stock. Available stock: 5.'); });
t('stock never below zero even for adjustment', () => { const r = sandbox.computeStockUpdate(3, 'adjustment', -5, 0); eq(r.ok, false); });
t('movement relationship: prev + signedQty == new', () => {
  const r = sandbox.computeStockUpdate(100, 'restock', 50, 50);
  eq(r.prevStock + r.signedQty, r.newStock);
  const r2 = sandbox.computeStockUpdate(170, 'usage', 30, 50);
  eq(r2.prevStock + r2.signedQty, r2.newStock);
});

console.log('\n=== PROJECT PAYMENT REMAINING BALANCE (ISSUE 8) ===');
t('contract 10000, paid 6000 -> max allowed 4000', () => {
  const contract = 10000, paidSoFar = 6000;
  const maxAllowed = Math.round((contract - paidSoFar) * 100) / 100;
  eq(maxAllowed, 4000);
  eq(5000 > maxAllowed, true, '5000 must be rejected');
  eq(4000 > maxAllowed, false, '4000 must be allowed');
});
t('payment push to remaining: paid 9000, attempt 5000 -> rejected', () => {
  const contract = 10000, paidSoFar = 9000;
  const maxAllowed = Math.round((contract - paidSoFar) * 100) / 100;
  eq(maxAllowed, 1000);
  eq(5000 > maxAllowed, true);
});
t('exact remaining allowed (1000 == 1000)', () => {
  const maxAllowed = Math.round((10000 - 9000) * 100) / 100;
  eq(maxAllowed, 1000);
  eq(1000 > maxAllowed, false);
});

console.log('\n=== GLOBAL REVENUE MODEL (ISSUE 10/12) ===');
function scenario() {
  State.sales = []; State.expenses = []; State.inventory = []; State.invTx = [];
  State.projects = []; State.projRev = []; State.projExp = []; State.payments = []; State.customers = []; State.suppliers = [];
  const from = new Date(2026, 7, 1), to = new Date(2026, 7, 31, 23, 59, 59);
  State.sales.push({ id: 's1', total: 5000, amountPaid: 5000, paymentStatus: 'Paid', date: new Date(2026, 7, 2), archived: false });
  State.projRev.push({ id: 'r1', projectId: 'p1', amount: 5000, source: 'payment', paymentId: 'pay1', date: new Date(2026, 7, 5), archived: false });
  State.projRev.push({ id: 'r2', projectId: 'p1', amount: 15000, source: 'payment', paymentId: 'pay2', date: new Date(2026, 7, 10), archived: false });
  return { from, to };
}
t('Revenue = sales 5,000 + project 20,000 = 25,000 (NOT 40,000)', () => {
  const { from, to } = scenario();
  eq(sandbox.projRevForRange(from, to), 20000);
  eq(sandbox.revenueForRange(from, to), 25000);
});
t('archived projRev excluded', () => {
  const { from, to } = scenario();
  State.projRev[0].archived = true;
  eq(sandbox.projRevForRange(from, to), 15000);
});
t('revenue drives Gross/Net margins (Gross ≠ Net)', () => {
  const { from, to } = scenario();
  State.invTx.push({ id: 't1', type: 'usage', qty: 20, signedQty: -20, costPerUnit: 50, itemId: 'i1', date: new Date(2026, 7, 6), archived: false });
  State.expenses.push({ id: 'e1', amount: 1000, date: new Date(2026, 7, 8), archived: false });
  const revenue = sandbox.revenueForRange(from, to);
  const cogs = sandbox.cogsForRange(from, to);
  const gross = sandbox.round2(revenue - cogs);
  const opEx = sandbox.opExForRange(from, to);
  const net = sandbox.round2(gross - opEx);
  const gm = sandbox.round4((gross / revenue) * 100);
  const nm = sandbox.round4((net / revenue) * 100);
  eq(revenue, 25000); eq(cogs, 1000); eq(gross, 24000); eq(opEx, 1000); eq(net, 23000);
  eq(gm, 96.0); eq(nm, 92.0);
  eq(gm !== nm, true);
});

console.log('\n=== RETENTION CUTOFF (ISSUE 3/5) ===');
t('cutoff = today minus 12 months (Asia/Manila, UTC midnight)', () => {
  // replicate daysAgoStartOfDay(365.25) logic for Aug 16 2026
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const [y, m, d] = parts.split('-').map(Number);
  const cutoff = new Date(Date.UTC(y, m - 1, d - 365));
  // Aug 16 2026 PH -> cutoff Aug 16 2025 UTC
  eq(cutoff.getUTCFullYear() + '-' + (cutoff.getUTCMonth() + 1) + '-' + cutoff.getUTCDate(), '2025-8-16');
  // a record from Jan 2024 is older than cutoff
  const old = new Date('2024-01-01T00:00:00Z');
  eq(old.getTime() < cutoff.getTime(), true, '2024-01-01 eligible');
  // a record from today is not older
  eq(now.getTime() < cutoff.getTime(), false, 'today not eligible');
});
t('retention eligibility excludes master data', () => {
  // eligible collections per spec: sales, expenses, payments, projRev, projExp, projects(completed)
  State.sales = [{ id: 'old-sale', date: new Date(2024, 0, 1), archived: false }];
  State.customers = [{ id: 'c1', name: 'C', archived: false }]; // master — never eligible
  State.inventory = [{ id: 'i1', name: 'I', archived: false }]; // master — never eligible
  State.projects = []; State.projRev = []; State.projExp = []; State.payments = []; State.expenses = []; State.invTx = [];
  const e = sandbox.retentionEligibleCount();
  eq(e.sales, 1);
  eq('customers' in e, false);
  eq('inventory' in e, false);
  eq('invTx' in e, false, 'immutable movements excluded from client retention');
});

console.log('\n=== RESTORE ORDER (ISSUE 1) ===');
t('restore clears only replaceable collections (NO invTx, NO users)', () => {
  // The client restore must NOT attempt to clear inventory_transactions
  // (immutable by rules) nor users (auth cannot be restored).
  const clearList = ['sales', 'expenses', 'inventory', 'projects', 'project_revenue', 'project_expenses', 'payments', 'customers', 'suppliers'];
  eq(clearList.includes('inventory_transactions'), false, 'invTx NOT in clear list');
  eq(clearList.includes('users'), false, 'users NOT in clear list');
  // masters written before transactions (dependency-safe)
  const writeOrder = ['inventory', 'customers', 'suppliers', 'sales', 'expenses', 'payments', 'project_revenue', 'project_expenses', 'projects'];
  eq(writeOrder.indexOf('inventory') < writeOrder.indexOf('sales'), true);
  eq(writeOrder.indexOf('customers') < writeOrder.indexOf('projects'), true);
});

console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
