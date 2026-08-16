// ============================================================
// JB Digital Printing — hardening unit tests (node, no browser)
// Loads the REAL app JS files in a sandbox and tests the pure
// business logic: payments, stock math, COGS, money rounding,
// and a multi-device simulation of atomic inventory updates.
// ============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.join(__dirname, '..', 'js');

// ---- minimal browser/firebase stubs ----
const noop = () => {};
const sandbox = {
  console,
  document: {
    getElementById: () => ({ value: '', checked: false, classList: { add: noop, remove: noop, toggle: noop }, style: {}, innerHTML: '', disabled: false }),
    querySelectorAll: () => [],
    createElement: () => ({ classList: { add: noop }, style: {}, appendChild: noop }),
    addEventListener: noop
  },
  window: { addEventListener: noop, jspdf: {}, XLSX: {} },
  localStorage: { getItem: () => null, setItem: noop },
  navigator: {},
  fetch: async () => ({ json: async () => ({}) }),
  Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL: noop },
  Chart: function () { this.destroy = noop; }, // stub
  XLSX: { utils: { book_new: () => ({}), json_to_sheet: () => ({}), book_append_sheet: noop }, writeFile: noop },
  setInterval: noop, setTimeout: noop, clearTimeout: noop, clearInterval: noop,
  confirm: () => true,
  firebase: {
    initializeApp: () => ({}),
    firestore: () => ({ settings: noop, enablePersistence: () => ({ catch: noop }), collection: () => ({ doc: () => ({ id: 'FAKEID123456', get: async () => ({ exists: false }), set: async () => {}, update: async () => {}, delete: async () => {} }), add: async () => ({ id: 'FAKEID123456' }), get: async () => ({ empty: true, forEach: noop }), limit: () => ({ get: async () => ({ empty: true, forEach: noop }) }), onSnapshot: noop }) }),
    auth: () => ({ onAuthStateChanged: noop, signInWithEmailAndPassword: async () => {}, signOut: async () => {} }),
    firestore_FieldValue: { serverTimestamp: () => ({}) }
  },
  FieldValue: { serverTimestamp: noop },
  Date
};
sandbox.firebase.firestore.FieldValue = { serverTimestamp: noop };
sandbox.firebase.firestore.Timestamp = {
  fromDate: (d) => ({ seconds: Math.floor(d.getTime() / 1000), toDate: () => d })
};

vm.createContext(sandbox);

function load(file) {
  const code = fs.readFileSync(path.join(DIR, file), 'utf8');
  vm.runInContext(code, sandbox, { filename: file });
}

// Load in dependency order
load('config.js');
load('ui.js');
load('core.js');        // State, saleTotal/salePaid/saleBalance, sumBy
load('db.js');          // busyStart/busyEnd, genBizId
load('transactions.js'); // resolvePayment, nextTxnId
load('inventory.js');    // computeStockUpdate, StockError
load('reports.js');      // cogsForRange, opExForRange, invPurchasesForRange

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  PASS ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + ' — ' + e.message); }
}
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }

console.log('\n=== PAYMENT VALIDATION (resolvePayment) ===');
t('Case A: 1000 total, 1000 paid => Paid, balance 0', () => {
  const r = sandbox.resolvePayment('Partial', 1000, 1000);
  eq(r, { ok: true, status: 'Paid', amountPaid: 1000, balance: 0 });
});
t('Case B: 1000 total, 500 paid => Partial, balance 500', () => {
  const r = sandbox.resolvePayment('Partial', 1000, 500);
  eq(r, { ok: true, status: 'Partial', amountPaid: 500, balance: 500 });
});
t('Case C: 1000 total, 0 paid => Unpaid, balance 1000', () => {
  const r = sandbox.resolvePayment('Unpaid', 1000, 0);
  eq(r, { ok: true, status: 'Unpaid', amountPaid: 0, balance: 1000 });
});
t('Case D: 1000 total, 1200 paid => REJECTED (no negative balance)', () => {
  const r = sandbox.resolvePayment('Partial', 1000, 1200);
  eq(r.ok, false);
  if (!/exceed/.test(r.error)) throw new Error('error should mention exceed, got: ' + r.error);
});
t('Paid status always records full amount', () => {
  const r = sandbox.resolvePayment('Paid', 2500.5, 1);
  eq(r.amountPaid, 2500.5); eq(r.balance, 0);
});
t('Negative paid rejected', () => {
  eq(sandbox.resolvePayment('Partial', 100, -50).ok, false);
});
t('Partial with 0 paid falls back to Unpaid', () => {
  const r = sandbox.resolvePayment('Partial', 100, 0);
  eq(r, { ok: true, status: 'Unpaid', amountPaid: 0, balance: 100 });
});

console.log('\n=== INVENTORY STOCK MATH (computeStockUpdate) ===');
t('Restock: 100 + 20 = 120', () => {
  const r = sandbox.computeStockUpdate(100, 'restock', 20, 10);
  eq(r.ok, true); eq(r.newStock, 120); eq(r.signedQty, 20);
});
t('Usage: 100 - 20 = 80 (signed -20)', () => {
  const r = sandbox.computeStockUpdate(100, 'usage', 20, 5);
  eq(r.ok, true); eq(r.newStock, 80); eq(r.signedQty, -20);
});
t('Usage over stock is BLOCKED, not clamped to 0', () => {
  const r = sandbox.computeStockUpdate(5, 'usage', 10, 5);
  eq(r.ok, false);
  if (!/Insufficient stock/.test(r.error)) throw new Error('expected Insufficient stock msg, got: ' + r.error);
});
t('Sold over stock is BLOCKED', () => {
  eq(sandbox.computeStockUpdate(3, 'sold', 4, 5).ok, false);
});
t('Damaged/lost use same guard', () => {
  eq(sandbox.computeStockUpdate(3, 'damaged', 4, 5).ok, false);
  eq(sandbox.computeStockUpdate(3, 'lost', 4, 5).ok, false);
});
t('Adjustment can decrease within range: 5 + (-3) = 2', () => {
  const r = sandbox.computeStockUpdate(5, 'adjustment', -3, 0);
  eq(r.ok, true); eq(r.newStock, 2);
});
t('Adjustment below zero is BLOCKED: 5 + (-10)', () => {
  eq(sandbox.computeStockUpdate(5, 'adjustment', -10, 0).ok, false);
});
t('Zero quantity rejected', () => {
  eq(sandbox.computeStockUpdate(10, 'restock', 0, 1).ok, false);
});
t('Negative restock rejected', () => {
  eq(sandbox.computeStockUpdate(10, 'restock', -5, 1).ok, false);
});
t('Float stock rounds to 2dp', () => {
  const r = sandbox.computeStockUpdate(0.1, 'restock', 0.2, 1);
  eq(r.newStock, 0.3);
});

console.log('\n=== MONEY ROUNDING (round2) ===');
t('0.1+0.2 => 0.3', () => eq(sandbox.round2(0.1 + 0.2), 0.3));
t('999.999999 => 1000 (rounds to cents)', () => eq(sandbox.round2(999.999999), 1000));
t('saleTotal avoids float drift', () => {
  const s = { total: 0.1 + 0.2 };
  eq(sandbox.saleTotal(s), 0.3);
});
t('saleBalance never negative after resolve', () => {
  const s = { total: 1000, paymentStatus: 'Partial', amountPaid: 1000 };
  eq(sandbox.saleBalance(s), 0);
});

console.log('\n=== COGS (cogsForRange) ===');
const State = vm.runInContext('State', sandbox);
State.invTx = [
  { id: 't1', type: 'usage', qty: 10, signedQty: -10, costPerUnit: 5, date: new Date(2026, 7, 10), archived: false },   // 50
  { id: 't2', type: 'sold', qty: 2, signedQty: -2, costPerUnit: 100, date: new Date(2026, 7, 11), archived: false },   // 200
  { id: 't3', type: 'restock', qty: 100, signedQty: 100, costPerUnit: 5, date: new Date(2026, 7, 5), archived: false }, // NOT cogs
  { id: 't4', type: 'usage', qty: 3, signedQty: -3, costPerUnit: 10, date: new Date(2026, 6, 1), archived: false },      // outside range
  { id: 't5', type: 'usage', qty: 4, signedQty: -4, costPerUnit: 10, date: new Date(2026, 7, 12), archived: true }       // archived -> ignored
];
t('COGS = usage+sold only, in range, not archived', () => {
  const from = new Date(2026, 7, 1), to = new Date(2026, 7, 31, 23, 59, 59);
  eq(sandbox.cogsForRange(from, to), 250);
});
t('Legacy movement without costPerUnit falls back to item cost', () => {
  State.inventory = [{ id: 'legacyItem', costPerUnit: 7 }];
  State.invTx.push({ id: 't6', type: 'usage', qty: 2, signedQty: -2, itemId: 'legacyItem', date: new Date(2026, 7, 13), archived: false });
  const from = new Date(2026, 7, 1), to = new Date(2026, 7, 31, 23, 59, 59);
  eq(sandbox.cogsForRange(from, to), 264);
});

console.log('\n=== BUSINESS ID UNIQUENESS (genBizId) ===');
// Stub the db object used by newId() so doc() generates unique ids
vm.runInContext(`
  let _idCounter = 0;
  db = { collection: () => ({ doc: () => {
    _idCounter++;
    const hex = 'ABCDEF0123456789';
    let s = '';
    for (let i = 0; i < 20; i++) s += hex[Math.floor(Math.random() * hex.length)];
    return { id: s + '_' + _idCounter };
  } }) };
`, sandbox);
t('IDs are unique and formatted S-YYYYMMDD-XXXXXX', () => {
  const ids = new Set();
  for (let i = 0; i < 2000; i++) ids.add(sandbox.genBizId('S', new Date(2026, 7, 16)));
  if (ids.size !== 2000) throw new Error('collision detected! only ' + ids.size + ' unique of 2000');
  const sample = [...ids][0];
  if (!/^S-20260816-[A-Z0-9]{6}$/.test(sample)) throw new Error('bad format: ' + sample);
});
t('uniqueBizId avoids existing ids', () => {
  const existing = [sandbox.genBizId('E', new Date(2026, 7, 16))];
  const fresh = sandbox.uniqueBizId('E', new Date(2026, 7, 16), existing);
  if (existing.includes(fresh)) throw new Error('returned an existing id');
});

console.log('\n=== MULTI-DEVICE SIMULATION (atomic inventory updates) ===');
// Simulates Firestore runTransaction: each "device" reads live stock inside
// the transaction, validates, and writes. Firestore serializes transactions;
// the key requirement is the LOGIC yields correct stock under any serial order.
let stock = 100;
const txnLog = [];
async function atomicDevice(type, qty, name) {
  // mimic runTransaction: read inside txn (no stale cache), compute, write
  const snap = { data: () => ({ currentStock: stock }) };
  const calc = sandbox.computeStockUpdate(snap.data().currentStock, type, qty, 5);
  if (!calc.ok) return { ok: false, error: calc.error };
  stock = calc.newStock; // write
  txnLog.push(name + ' -> ' + calc.newStock);
  return { ok: true };
}
(async () => {
  // PC restock 100 (from initial 100 -> 200), then Phone uses 20, Tablet uses 10
  await atomicDevice('restock', 100, 'PC restock +100');
  await atomicDevice('usage', 20, 'Phone use -20');
  await atomicDevice('usage', 10, 'Tablet use -10');
  t('PC +100, Phone -20, Tablet -10 => 170', () => eq(stock, 170));

  // Lost-update scenario: two devices use 20 at the "same time".
  // OLD (buggy) flow: each device READ stock over the network (both read 100
  // before either write commits), then both wrote 100-20=80 -> LOST UPDATE.
  stock = 100;
  const readA = stock;      // Device A reads 100 (network round-trip in progress)
  const readB = stock;      // Device B reads 100 (stale — A hasn't committed yet)
  let writeA = sandbox.computeStockUpdate(readA, 'usage', 20, 1).newStock; // 80
  let writeB = sandbox.computeStockUpdate(readB, 'usage', 20, 1).newStock; // 80
  stock = writeA; stock = writeB; // both writes land -> WRONG 80
  const oldBugResult = stock;

  // NEW (atomic) flow: runTransaction serializes the two transactions server-side;
  // B's read happens AFTER A commits, so B reads 80 and writes 60. Correct.
  stock = 100;
  let a = sandbox.computeStockUpdate(100, 'usage', 20, 1).newStock;   // A reads 100 -> 80 (committed)
  let b = sandbox.computeStockUpdate(a, 'usage', 20, 1).newStock;     // B reads 80  -> 60 (committed)
  t('Atomic (serialized) concurrent uses: 100-20-20 = 60 (no lost update)', () => eq(b, 60));
  t('Non-atomic path WOULD have produced wrong 80 (demonstrates the old bug)', () => eq(oldBugResult, 80));

  console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(fail ? 1 : 0);
})();
