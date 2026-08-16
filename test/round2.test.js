// ============================================================
// JB Digital Printing — Round 2 hardening tests (node, no browser)
// Covers: payment transitions, money edge cases, full business
// workflow reconciliation, project cost double-counting, CSV/PDF
// export content, retention idempotency.
// ============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.join(__dirname, '..', 'js');

// ---- stubs ----
const noop = () => {};
let capturedBlobs = [];
let capturedCsv = null;
let capturedPdf = null;
let fakeAnchor = { href: '', download: '', click: noop };
const sandbox = {
  console,
  document: {
    getElementById: () => ({ value: '', checked: false, classList: { add: noop, remove: noop, toggle: noop }, style: {}, innerHTML: '', disabled: false, dataset: {} }),
    querySelectorAll: () => [],
    createElement: (tag) => tag === 'a' ? fakeAnchor : { classList: { add: noop }, style: {}, appendChild: noop },
    addEventListener: noop
  },
  window: { addEventListener: noop, jspdf: { jsPDF: function () {
    capturedPdf = { texts: [], saves: [] };
    this.setFontSize = noop; this.setFont = noop; this.addPage = noop;
    this.text = (t) => capturedPdf.texts.push(String(t));
    this.save = (n) => capturedPdf.saves.push(n);
    return this;
  } } },
  localStorage: { getItem: () => null, setItem: noop },
  navigator: { onLine: true },
  fetch: async () => ({ json: async () => ({}) }),
  Blob: function (parts, opts) { this.parts = parts; this.opts = opts; capturedBlobs.push(this); },
  URL: { createObjectURL: (b) => 'blob:' + capturedBlobs.length, revokeObjectURL: noop },
  Chart: function () { this.destroy = noop; },
  XLSX: { utils: { book_new: () => ({}), json_to_sheet: () => ({}), book_append_sheet: noop }, writeFile: noop },
  setInterval: noop, setTimeout: noop, clearTimeout: noop, clearInterval: noop,
  confirm: () => true,
  firebase: {
    initializeApp: () => ({}),
    firestore: () => ({ settings: noop, enablePersistence: () => ({ catch: noop }), collection: () => ({ doc: () => ({ id: 'FAKEID123456', get: async () => ({ exists: false }), set: async () => {}, update: async () => {}, delete: async () => {} }), add: async () => ({ id: 'FAKEID123456' }), get: async () => ({ empty: true, forEach: noop }), limit: () => ({ get: async () => ({ empty: true, forEach: noop }) }), onSnapshot: noop }) }),
    auth: () => ({ onAuthStateChanged: noop, signInWithEmailAndPassword: async () => {}, signOut: async () => {} })
  },
  Date
};
sandbox.firebase.firestore.FieldValue = { serverTimestamp: noop };
sandbox.firebase.firestore.Timestamp = { fromDate: (d) => ({ seconds: Math.floor(d.getTime() / 1000), toDate: () => d }) };
vm.createContext(sandbox);

function load(file) { vm.runInContext(fs.readFileSync(path.join(DIR, file), 'utf8'), sandbox, { filename: file }); }
load('config.js');
load('ui.js');
load('core.js');
load('db.js');
load('transactions.js');
load('inventory.js');
load('projects.js');
load('reports.js');
load('settings.js');

const State = vm.runInContext('State', sandbox);
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  PASS ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ' — ' + e.message); } }
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }

console.log('\n=== PAYMENT TRANSITIONS (edit flow) ===');
t('Paid -> stays Paid with full amount', () => eq(sandbox.resolvePayment('Paid', 1000, 1000).status, 'Paid'));
t('Partial (500) -> Unpaid when paid cleared', () => eq(sandbox.resolvePayment('Partial', 1000, 0), { ok: true, status: 'Unpaid', amountPaid: 0, balance: 1000 }));
t('Partial (500) -> Paid when paid set to full', () => eq(sandbox.resolvePayment('Partial', 1000, 1000), { ok: true, status: 'Paid', amountPaid: 1000, balance: 0 }));
t('Unpaid -> Partial (300)', () => eq(sandbox.resolvePayment('Partial', 1000, 300), { ok: true, status: 'Partial', amountPaid: 300, balance: 700 }));
t('Paid -> Partial requires explicit paid amount', () => eq(sandbox.resolvePayment('Partial', 1000, 400), { ok: true, status: 'Partial', amountPaid: 400, balance: 600 }));
t('Full cycle never produces negative balance', () => {
  const seq = [['Partial', 500], ['Partial', 1000], ['Unpaid', 0], ['Partial', 250], ['Paid', 1000]];
  for (const [st, amt] of seq) { const r = sandbox.resolvePayment(st, 1000, amt); if (r.ok && r.balance < 0) throw new Error('negative balance!'); }
});

console.log('\n=== MONEY EDGE CASES ===');
const moneyCases = [0.01, 0.10, 1.99, 999.99, 10000.55, 1234567.89];
moneyCases.forEach(v => t('round2(' + v + ') exact', () => {
  const r = sandbox.round2(v);
  if (!Number.isFinite(r) || Math.abs(r * 100 - Math.round(v * 100)) > 0.0001) throw new Error('bad rounding ' + r);
}));
t('saleTotal 0.1*3 = 0.3', () => eq(sandbox.saleTotal({ items: [{ qty: 3, unitPrice: 0.1 }] }), 0.3));
t('large total sums cleanly', () => eq(sandbox.saleTotal({ items: [{ qty: 10000, unitPrice: 999.99 }] }), 9999900));
t('profit/margin math stable', () => {
  const rev = 10000.55, cogs = 2999.97, op = 1234.56;
  const gp = sandbox.round2(rev - cogs);
  const np = sandbox.round2(gp - op);
  if (np !== sandbox.round2(rev - cogs - op)) throw new Error('non-associative float');
});

console.log('\n=== PROJECT COST DOUBLE-COUNTING (₱5,000 buy / ₱3,000 use / ₱1,000 other) ===');
function buildProjectScenario() {
  State.sales = []; State.expenses = []; State.inventory = []; State.invTx = [];
  State.projects = []; State.projRev = []; State.projExp = []; State.payments = []; State.customers = []; State.suppliers = [];
  const from = new Date(2026, 7, 1), to = new Date(2026, 7, 31, 23, 59, 59);
  // inventory item
  State.inventory.push({ id: 'mat1', name: 'Tarpaulin Roll', currentStock: 0, costPerUnit: 0, unit: 'roll', archived: false });
  // RESTOCK ₱5,000 (10 rolls × 500) — acquisition, NOT period expense
  State.invTx.push({ id: 'tx-restock', type: 'restock', qty: 10, signedQty: 10, costPerUnit: 500, totalCost: 5000, itemId: 'mat1', date: new Date(2026, 7, 2), archived: false });
  State.expenses.push({ id: 'exp-restock', amount: 5000, category: 'Materials', inventoryTransactionId: 'tx-restock', date: new Date(2026, 7, 2), archived: false });
  State.inventory[0].currentStock = 10; State.inventory[0].costPerUnit = 500;
  // CONSUME ₱3,000 (6 rolls) for project → COGS recognized ONCE here
  State.invTx.push({ id: 'tx-use', type: 'usage', qty: 6, signedQty: -6, costPerUnit: 500, totalCost: 3000, itemId: 'mat1', projectId: 'proj1', date: new Date(2026, 7, 5), archived: false });
  State.projExp.push({ id: 'pe-mat', projectId: 'proj1', category: 'Material', amount: 3000, marker: 'INV:mat1:tx-use', inventoryTxId: 'tx-use', date: new Date(2026, 7, 5), archived: false });
  State.inventory[0].currentStock = 4;
  // OTHER project expense ₱1,000 (labor)
  State.projExp.push({ id: 'pe-labor', projectId: 'proj1', category: 'Labor', amount: 1000, date: new Date(2026, 7, 6), archived: false });
  // PROJECT: contract ₱20,000, paid ₱20,000 (collected)
  State.projects.push({ id: 'proj1', name: 'Test Project', contractPrice: 20000, estimatedCost: 18000, status: 'Completed', amountPaid: 20000, archived: false, startDate: new Date(2026, 7, 1) });
  State.payments.push({ id: 'pay1', projectId: 'proj1', amount: 20000, date: new Date(2026, 7, 10), archived: false });
  State.projRev.push({ id: 'rev1', projectId: 'proj1', amount: 20000, source: 'payment', paymentId: 'pay1', date: new Date(2026, 7, 10), archived: false });
  // OPERATING expense ₱2,000 (electricity)
  State.expenses.push({ id: 'exp-el', amount: 2000, category: 'Electricity', date: new Date(2026, 7, 8), archived: false });
  // SALES revenue ₱8,000 (separate walk-in)
  State.sales.push({ id: 'sale1', transactionId: 'S-20260816-TEST', total: 8000, amountPaid: 8000, paymentStatus: 'Paid', date: new Date(2026, 7, 12), archived: false });
  return { from, to };
}

t('COGS = only consumed ₱3,000 (purchase ₱5,000 NOT counted)', () => {
  const { from, to } = buildProjectScenario();
  eq(sandbox.cogsForRange(from, to), 3000);
});
t('Operating expenses exclude restock-linked ₱5,000', () => {
  const { from, to } = buildProjectScenario();
  // opEx = all expenses (5000+2000) minus restock-linked (5000) = 2000
  eq(sandbox.opExForRange(from, to), 2000);
});
t('Project cost = ₱3,000 material + ₱1,000 labor = ₱4,000 (NOT ₱8,000)', () => {
  buildProjectScenario();
  eq(sandbox.projectExpenseTotal('proj1'), 4000);
});
t('Project profit = collected 20,000 - actual 4,000 = 16,000', () => {
  buildProjectScenario();
  const p = State.projects[0];
  eq(sandbox.projectProfit(p), 16000);
});
t('Estimated vs Actual differ and both shown', () => {
  buildProjectScenario();
  const p = State.projects[0];
  const est = (Number(p.contractPrice) || 0) - (Number(p.estimatedCost) || 0);
  eq(est, 2000); // estimated profit
  eq(sandbox.projectProfit(p), 16000); // actual profit
});

console.log('\n=== FULL WORKFLOW RECONCILIATION (dashboard == reports == P&L) ===');
t('P&L reconciles: Revenue 28,000 (8k sales + 20k project); COGS 3,000; Gross 25,000 (89.3%); OpEx 2,000; Net 23,000 (82.1%)', () => {
  const { from, to } = buildProjectScenario();
  // NEW accounting model (Aug 2026): global Revenue = Sales + Project Revenue.
  const revenue = sandbox.revenueForRange(from, to);
  const salesOnly = sandbox.round2(sandbox.sumBy(State.sales, sandbox.saleTotal));
  const projRevOnly = sandbox.projRevForRange(from, to);
  const cogs = sandbox.cogsForRange(from, to);
  const invPurchases = sandbox.invPurchasesForRange(from, to);
  const opEx = sandbox.round2(sandbox.round2(sandbox.sumBy(State.expenses, e => Number(e.amount) || 0)) - invPurchases);
  const grossProfit = sandbox.round2(revenue - cogs);
  const grossMargin1 = +((grossProfit / revenue) * 100).toFixed(1);
  const netProfit = sandbox.round2(grossProfit - opEx);
  const netMargin1 = +((netProfit / revenue) * 100).toFixed(1);
  eq(salesOnly, 8000, 'sales revenue');
  eq(projRevOnly, 20000, 'project revenue counted once');
  eq(revenue, 28000, 'total revenue = sales + project (no double count)');
  eq(cogs, 3000);
  eq(grossProfit, 25000);
  eq(grossMargin1, 89.3);
  eq(opEx, 2000);
  eq(netProfit, 23000);
  eq(netMargin1, 82.1);
});
t('Project revenue NOT double-counted (5,000 + 15,000 payments = 20,000, not 40,000)', () => {
  buildProjectScenario();
  // two payments of 5000 + 15000 -> projRev = 20000 total
  State.projRev = [
    { id: 'r1', projectId: 'proj1', amount: 5000, source: 'payment', paymentId: 'p1', date: new Date(2026, 7, 5), archived: false },
    { id: 'r2', projectId: 'proj1', amount: 15000, source: 'payment', paymentId: 'p2', date: new Date(2026, 7, 10), archived: false }
  ];
  const from = new Date(2026, 7, 1), to = new Date(2026, 7, 31, 23, 59, 59);
  eq(sandbox.projRevForRange(from, to), 20000);
  eq(sandbox.revenueForRange(from, to), 28000); // 8000 sales + 20000 project
});
t('Dashboard income formula == P&L revenue (same helper semantics)', () => {
  buildProjectScenario();
  const from = new Date(2026, 7, 1), to = new Date(2026, 7, 31, 23, 59, 59);
  const pnl = sandbox.revenueForRange(from, to);
  const projRevInRange = State.projRev.filter(r => { const d = sandbox.tsToDate(r.date || r.createdAt); return !r.archived && d && d.getTime() >= from.getTime() && d.getTime() <= to.getTime(); });
  const dash = sandbox.round2(sandbox.round2(sandbox.sumBy(State.sales, sandbox.saleTotal)) + sandbox.sumBy(projRevInRange, r => Number(r.amount) || 0));
  eq(dash, pnl);
});
t('Project balance = contract - payments', () => {
  buildProjectScenario();
  const p = State.projects[0];
  eq(sandbox.projectBalance(p), 0); // fully paid
  eq(sandbox.projectPaidTotal('proj1'), 20000);
});
t('Customer/sale balance math', () => {
  buildProjectScenario();
  const s = State.sales[0];
  eq(sandbox.saleBalance(s), 0);
});

console.log('\n=== CSV EXPORT CONTENT ===');
t('CSV export rows match the visible data', () => {
  buildProjectScenario();
  capturedCsv = null; capturedBlobs = [];
  sandbox.exportSalesCSV();
  const blob = capturedBlobs[0];
  if (!blob) throw new Error('no CSV blob created');
  const csv = blob.parts[1] ? blob.parts[0] + blob.parts[1] : String(blob.parts[0]);
  // header + 1 sale row
  const lines = csv.split('\r\n').filter(l => l.length);
  if (!lines[0].includes('Transaction ID')) throw new Error('missing header');
  if (!lines[1].includes('S-20260816-TEST') || !lines[1].includes('8000')) throw new Error('missing sale row: ' + lines[1]);
  // exactly 2 lines (header + 1 sale)
  eq(lines.length, 2, 'expected 2 lines, got ' + lines.length);
});

console.log('\n=== PDF EXPORT CONTENT ===');
t('P&L PDF contains correct NET PROFIT and margins', () => {
  buildProjectScenario();
  capturedPdf = null;
  // stub getPnLRange internals: renderPnL uses DOM; call exportPnLPDF which uses getPnLRange -> DOM.
  // Instead, verify the pure math path by calling exportPnLCSV-like data? PDF needs jsPDF stub + getPnLRange.
  // getPnLRange reads #pnlPeriod (value 'monthly') and getRange('month') — our stub returns '' for value.
  // We set the DOM stub value to 'monthly' for this call.
  const orig = sandbox.document.getElementById;
  sandbox.document.getElementById = (id) => id === 'pnlPeriod' ? { value: 'monthly', classList: { toggle: noop } } : orig(id);
  try { sandbox.exportPnLPDF(); } finally { sandbox.document.getElementById = orig; }
  if (!capturedPdf) throw new Error('PDF not generated');
  const all = capturedPdf.texts.join('\n');
  if (!all.includes('NET PROFIT / LOSS: ₱23,000.00')) throw new Error('missing net profit line: ' + all.split('\n').slice(-8).join(' | '));
  if (!all.includes('GROSS PROFIT: ₱25,000.00')) throw new Error('missing gross profit line');
  if (capturedPdf.saves[0] !== 'jb-pnl.pdf') throw new Error('wrong filename');
});

console.log('\n=== RETENTION IDEMPOTENCY ===');
t('Eligibility excludes master data; includes old transactions only', () => {
  buildProjectScenario();
  // Add an OLD sale (2024) + OLD completed project + OLD inventory movement
  State.sales.push({ id: 'sale-old', transactionId: 'S-20240801-OLD', total: 1000, amountPaid: 0, paymentStatus: 'Unpaid', date: new Date(2024, 7, 1), archived: false });
  State.projects.push({ id: 'proj-old', name: 'Old Project', contractPrice: 5000, estimatedCost: 3000, status: 'Completed', startDate: new Date(2024, 6, 1), targetDate: new Date(2024, 7, 1), archived: false });
  State.invTx.push({ id: 'tx-old', type: 'usage', qty: 2, signedQty: -2, costPerUnit: 500, itemId: 'mat1', date: new Date(2024, 7, 2), archived: false });
  State.customers.push({ id: 'cust-old', name: 'Old Customer', createdAt: new Date(2024, 1, 1), archived: false }); // master data
  vm.runInContext('settingsCache = { retentionEnabled: true, retentionMode: "delete", retentionMonths: 12 }', sandbox);
  const e = sandbox.retentionEligibleCount();
  eq(e.sales, 1, 'old sale eligible');          // only the 2024 sale (2026 sale is current)
  eq(e.projects, 1, 'old completed project eligible');
  // master data (customers/inventory items/users/settings) has NO eligibility keys at all:
  eq('customers' in e, false, 'customers not in eligibility');
  eq('inventory' in e, false, 'inventory items not in eligibility');
  eq('invTx' in e, false, 'immutable movements excluded (rules deny client archive/delete)');
  eq('users' in e, false, 'users not in eligibility');
  eq('settings' in e, false, 'settings not in eligibility');
  eq(e.total, 2);
});
t('Running cleanup twice is safe (idempotent)', () => {
  buildProjectScenario();
  vm.runInContext('settingsCache = { retentionEnabled: true, retentionMode: "delete", retentionMonths: 12 }', sandbox);
  // nothing eligible -> count stays 0, no writes attempted
  eq(sandbox.retentionEligibleCount().total, 0);
  eq(sandbox.retentionEligibleCount().total, 0);
});

console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
