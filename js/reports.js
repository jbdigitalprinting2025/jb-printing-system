// ============================================================
// REPORTS — Profit & Loss + Reports center + exports (CSV/Excel/PDF)
// ============================================================

// ==================== PROFIT & LOSS ====================
// ============================================================
// ACCOUNTING MODEL (documented — read before changing numbers)
// ============================================================
// 1) REVENUE        = recorded sales (completed/recognized) in period.
// 2) COGS           = cost of MATERIALS ACTUALLY CONSUMED in period
//                     (inventory movements type 'usage'/'sold' × costPerUnit).
//                     Consumption is recognized at USE time, not purchase time.
// 3) GROSS PROFIT   = Revenue − COGS.
// 4) GROSS MARGIN   = Gross Profit / Revenue × 100.
// 5) OPERATING EXP  = expenses collection MINUS restock-linked acquisition
//                     (expenses carrying `inventoryTransactionId` are inventory
//                     PURCHASES, not period expenses — see 7).
// 6) NET PROFIT     = Gross Profit − Operating Expenses.
// 7) DOUBLE-COUNT PREVENTION:
//    - Inventory RESTOCK (acquisition) writes an expense only as a LINKED record
//      (inventoryTransactionId). That ₱ amount is NOT a P&L expense of the period:
//      it bought an ASSET (inventory). It is shown as a memo line only.
//    - When material is later USED by a sale/project, an inventory movement is
//      created and COGS recognizes the cost ONCE.
//    - Project expenses (project_expenses) are the PROJECT's cost view; the P&L
//      uses inventory movements for COGS so a material is never counted twice.
//    Example: buy ₱5,000 material (restock, memo only) → use ₱3,000 for a project
//    (COGS ₱3,000 recognized once; project expense record shows the ₱3,000 too,
//    but P&L counts it only via COGS — the ₱2,000 still in stock is an asset).
// ============================================================
function getPnLRange() {
  const period = document.getElementById('pnlPeriod').value;
  document.getElementById('pnlCustom').classList.toggle('hidden', period !== 'custom');
  if (period === 'custom') {
    const f = parseDateInput(document.getElementById('pnlFrom').value);
    const t = parseDateInput(document.getElementById('pnlTo').value);
    if (f && t && t >= f) return { from: new Date(f.getFullYear(), f.getMonth(), f.getDate()), to: new Date(t.getFullYear(), t.getMonth(), t.getDate(), 23, 59, 59, 999), period };
    return getRange('month');
  }
  return getRange(period === 'daily' ? 'today' : period === 'weekly' ? 'week' : period === 'monthly' ? 'month' : period === 'yearly' ? 'year' : 'month');
}

// COGS = cost of materials CONSUMED (inventory usage/sold) in the period.
// Uses costPerUnit snapshot stored on each movement; falls back to the item's
// current cost for legacy records. Restock purchases are NOT COGS — they are
// inventory acquisition (and appear as a memo line, excluded from Operating
// Expenses when linked to a restock via inventoryTransactionId).
function cogsForRange(from, to) {
  let total = 0;
  State.invTx.forEach(t => {
    if (t.archived) return;
    if (t.type !== 'usage' && t.type !== 'sold') return;
    const d = tsToDate(t.date);
    if (!d || d.getTime() < from.getTime() || d.getTime() > to.getTime()) return;
    const qty = Math.abs(Number(t.qty) || Number(t.signedQty) || 0);
    let cost = Number(t.costPerUnit);
    if (!cost) {
      const it = State.inventory.find(i => i.id === t.itemId);
      cost = it ? (Number(it.costPerUnit) || 0) : 0;
    }
    total = round2(total + qty * cost);
  });
  return total;
}
// Operating expenses = expenses collection, EXCLUDING restock-linked acquisition
// (those carry inventoryTransactionId and are represented as inventory, not as
// period expense — otherwise materials would be double-counted: once as purchase,
// once as COGS when consumed).
function opExForRange(from, to) {
  return sumBy(activeExpenses().filter(e => {
    const d = tsToDate(e.date);
    if (!d || d.getTime() < from.getTime() || d.getTime() > to.getTime()) return false;
    if (e.inventoryTransactionId) return false; // restock acquisition — not an operating expense
    return true;
  }), e => Number(e.amount) || 0);
}
// Inventory purchases (memo, not part of net profit when consumed later as COGS)
function invPurchasesForRange(from, to) {
  return sumBy(activeExpenses().filter(e => {
    const d = tsToDate(e.date);
    return d && e.inventoryTransactionId && d.getTime() >= from.getTime() && d.getTime() <= to.getTime();
  }), e => Number(e.amount) || 0);
}
// PROJECT REVENUE (reported, not double-counted):
//  - projRev records are created 1:1 from project PAYMENTS (source 'payment',
//    paymentId link, deduped on edit/delete). Summing projRev = money actually
//    collected from projects in the period.
//  - Global Revenue = Sales + Project Revenue. A project should be tracked as a
//    project OR invoiced as a sale — never both — otherwise the same work would
//    be counted twice (the accounting model documented here).
function projRevForRange(from, to) {
  return round2(sumBy(State.projRev.filter(r => {
    if (r.archived) return false;
    const d = tsToDate(r.date || r.createdAt);
    return d && d.getTime() >= from.getTime() && d.getTime() <= to.getTime();
  }), r => Number(r.amount) || 0));
}
function countProjRev(from, to) {
  return State.projRev.filter(r => {
    if (r.archived) return false;
    const d = tsToDate(r.date || r.createdAt);
    return d && d.getTime() >= from.getTime() && d.getTime() <= to.getTime();
  }).length;
}
function revenueForRange(from, to) {
  const sales = activeSales().filter(s => { const d = tsToDate(s.date); return d && d.getTime() >= from.getTime() && d.getTime() <= to.getTime(); });
  return round2(round2(sumBy(sales, saleTotal)) + projRevForRange(from, to));
}

function renderPnL() {
  const range = getPnLRange();
  const sales = activeSales().filter(s => { const d = tsToDate(s.date); return d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime(); });
  const expenses = activeExpenses().filter(e => { const d = tsToDate(e.date); return d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime(); });

  const revenue = revenueForRange(range.from, range.to);
  const salesRev = round2(sumBy(sales, saleTotal));
  const projRev = projRevForRange(range.from, range.to);
  const totalExpenses = round2(sumBy(expenses, e => Number(e.amount) || 0));
  const cogs = cogsForRange(range.from, range.to);
  const invPurchases = invPurchasesForRange(range.from, range.to);
  const opEx = round2(totalExpenses - invPurchases);
  const grossProfit = round2(revenue - cogs);
  const grossMargin = revenue > 0 ? round4((grossProfit / revenue) * 100) : 0;
  const netProfit = round2(grossProfit - opEx);
  const netMargin = revenue > 0 ? round4((netProfit / revenue) * 100) : 0;

  // categorize expenses (for the breakdown card)
  const expByCat = {};
  expenses.forEach(e => { if (e.inventoryTransactionId) return; const c = e.category || 'Other'; expByCat[c] = round2((expByCat[c] || 0) + (Number(e.amount) || 0)); });

  const noData = !sales.length && !expenses.length && !State.projRev.some(r => { const d = tsToDate(r.date || r.createdAt); return d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime(); }) && !State.invTx.some(t => { const d = tsToDate(t.date); return d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime(); });

  const periodLabel = {
    daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly', custom: 'Custom Range'
  }[range.period] || '';

  const html = `
    ${noData ? `<div class="card">${emptyState('📈', 'No sales, expenses, or inventory movements in this period', 'Records will appear here once you add them')}</div>` : ''}
    <div class="grid grid-4 mb-12">
      <div class="stat-card green"><div class="lbl">Revenue</div><div class="val">${fmtMoneyShort(revenue)}</div><div class="note">${sales.length} sales ${projRev > 0 ? '· ' + countProjRev(range.from, range.to) + ' project payments' : ''}</div></div>
      <div class="stat-card blue"><div class="lbl">COGS (Materials Used)</div><div class="val">${fmtMoneyShort(cogs)}</div><div class="note">Inventory consumed</div></div>
      <div class="stat-card ${grossProfit >= 0 ? 'yellow' : 'pink'}"><div class="lbl">Gross Profit</div><div class="val">${fmtMoneyShort(grossProfit)}</div><div class="note">Margin ${grossMargin.toFixed(1)}%</div></div>
      <div class="stat-card ${netProfit >= 0 ? 'yellow' : 'pink'}"><div class="lbl">Net Profit / Loss</div><div class="val">${fmtMoneyShort(netProfit)}</div><div class="note">Net margin ${netMargin.toFixed(1)}%</div></div>
    </div>
    <div class="grid grid-2">
      <div class="card"><h3>🧾 Revenue</h3>
        <div class="set-row"><span class="sr-lbl">Sales / Income (completed &amp; recorded)</span><b>${fmtMoney(salesRev)}</b></div>
        ${projRev > 0 ? `<div class="set-row"><span class="sr-lbl">Project revenue (payments received)</span><b>${fmtMoney(projRev)}</b></div>` : ''}
        <div class="set-row"><span class="sr-lbl">Total Revenue</span><b class="pos">${fmtMoney(revenue)}</b></div>
      </div>
      <div class="card"><h3>🧮 Profit Structure</h3>
        <div class="set-row"><span class="sr-lbl">Revenue</span><span>${fmtMoney(revenue)}</span></div>
        <div class="set-row"><span class="sr-lbl">COGS (materials consumed)</span><span class="neg">− ${fmtMoney(cogs)}</span></div>
        <div class="set-row"><b>GROSS PROFIT</b><b class="${grossProfit >= 0 ? 'pos' : 'neg'}">${fmtMoney(grossProfit)}</b></div>
        <div class="set-row"><span class="sr-lbl">Gross Margin</span><span>${grossMargin.toFixed(1)}%</span></div>
        <div class="set-row"><span class="sr-lbl">Operating Expenses</span><span class="neg">− ${fmtMoney(opEx)}</span></div>
        <div class="set-row"><b>NET PROFIT</b><b class="${netProfit >= 0 ? 'pos' : 'neg'}">${fmtMoney(netProfit)}</b></div>
        <div class="set-row"><span class="sr-lbl">Net Margin</span><span>${netMargin.toFixed(1)}%</span></div>
      </div>
    </div>
    <div class="card"><h3>💸 Operating Expenses</h3>
      <div class="set-row"><span class="sr-lbl">Total expenses recorded</span><span>${fmtMoney(totalExpenses)}</span></div>
      ${invPurchases > 0 ? `<div class="set-row"><span class="sr-lbl">Inventory purchases (restocks — counted as COGS when used, not as period expense)</span><span class="muted">− ${fmtMoney(invPurchases)}</span></div>` : ''}
      <div class="set-row"><b>Operating Expenses (rent, electricity, labor, other)</b><b class="neg">${fmtMoney(opEx)}</b></div>
      <div class="muted mt-8">Rent, Electricity, Internet, Salaries, Transportation, Office supplies and other non-material expenses. Material restocks are excluded here and recognized as COGS when actually consumed — no double counting.</div>
    </div>
    <div class="card"><h3>📊 Operating Expenses by Category</h3>
      <div class="flex flex-wrap">${Object.entries(expByCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<span class="chip yellow">${escapeHtml(c)}: ${fmtMoney(v)}</span>`).join('') || '<span class="muted">No operating expenses in this period</span>'}</div>
    </div>
    <div class="card"><h3>🧾 NET PROFIT = GROSS PROFIT − OPERATING EXPENSES</h3>
      <div class="set-row" style="padding:14px 0"><span class="sr-lbl" style="font-size:15px;font-weight:800">NET PROFIT</span><b class="${netProfit >= 0 ? 'pos' : 'neg'}" style="font-size:20px">${fmtMoney(netProfit)}</b></div>
      <div class="muted">Calculated automatically from actual records. Gross margin is NOT the same as net margin — do not confuse them.</div>
    </div>`;
  document.getElementById('pnlContent').innerHTML = html;
}

function exportPnLCSV() {
  const range = getPnLRange();
  const sales = activeSales().filter(s => { const d = tsToDate(s.date); return d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime(); });
  const expenses = activeExpenses().filter(e => { const d = tsToDate(e.date); return d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime(); });
  const revenue = revenueForRange(range.from, range.to);
  const totalExpenses = round2(sumBy(expenses, e => Number(e.amount) || 0));
  const cogs = cogsForRange(range.from, range.to);
  const invPurchases = invPurchasesForRange(range.from, range.to);
  const opEx = round2(totalExpenses - invPurchases);
  const grossProfit = round2(revenue - cogs);
  const grossMargin = revenue > 0 ? round4((grossProfit / revenue) * 100) : 0;
  const netProfit = round2(grossProfit - opEx);
  const netMargin = revenue > 0 ? round4((netProfit / revenue) * 100) : 0;
  const rows = [
    ['JB Digital Printing — Profit & Loss Report'],
    ['Period', `${fmtDate(range.from)} — ${fmtDate(range.to)}`],
    ['Generated', fmtDateTime(new Date())],
    [''],
    ['Revenue (Sales + Project Revenue)', revenue],
    ['COGS (Materials Consumed)', cogs],
    ['Gross Profit', grossProfit],
    ['Gross Margin %', grossMargin.toFixed(2)],
    ['Operating Expenses', opEx],
    ['NET PROFIT / LOSS', netProfit],
    ['Net Margin %', netMargin.toFixed(2)],
    [''],
    ['Memo: Inventory Purchases (Restocks)', invPurchases],
    [''],
    ['Sales Transactions (' + sales.length + ')'],
    ['Transaction ID', 'Date', 'Customer', 'Items', 'Total', 'Payment Status']
  ];
  sales.forEach(s => rows.push([s.transactionId, fmtDate(s.date), s.customerName || '', (Array.isArray(s.items) ? s.items : []).map(i => i.product).join(', '), saleTotal(s), s.paymentStatus]));
  rows.push([''], ['Expense Transactions (' + expenses.length + ')'], ['Expense ID', 'Date', 'Category', 'Description', 'Amount', 'Supplier']);
  expenses.forEach(e => rows.push([e.expenseId, fmtDate(e.date), e.category, e.description, e.amount, e.supplierName || '']));
  downloadCSV('jb-pnl.csv', rows);
}
function exportPnLPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const range = getPnLRange();
  const sales = activeSales().filter(s => { const d = tsToDate(s.date); return d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime(); });
  const expenses = activeExpenses().filter(e => { const d = tsToDate(e.date); return d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime(); });
  const revenue = revenueForRange(range.from, range.to);
  const cogs = cogsForRange(range.from, range.to);
  const invPurchases = invPurchasesForRange(range.from, range.to);
  const opEx = round2(round2(sumBy(expenses, e => Number(e.amount) || 0)) - invPurchases);
  const grossProfit = round2(revenue - cogs);
  const grossMargin = revenue > 0 ? round4((grossProfit / revenue) * 100) : 0;
  const netProfit = round2(grossProfit - opEx);
  const netMargin = revenue > 0 ? round4((netProfit / revenue) * 100) : 0;
  let y = 20;
  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text('JB Digital Printing — Profit & Loss', 14, y);
  y += 7;
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(`Period: ${fmtDate(range.from)} — ${fmtDate(range.to)}`, 14, y); y += 6;
  doc.text(`Generated: ${fmtDateTime(new Date())}`, 14, y); y += 10;
  doc.setFont('helvetica', 'bold');
  doc.text(`Revenue: ${fmtMoney(revenue)}`, 14, y); y += 6;
  doc.text(`COGS (materials consumed): ${fmtMoney(cogs)}`, 14, y); y += 6;
  doc.text(`GROSS PROFIT: ${fmtMoney(grossProfit)}  (margin ${grossMargin.toFixed(1)}%)`, 14, y); y += 6;
  doc.text(`Operating Expenses: ${fmtMoney(opEx)}`, 14, y); y += 6;
  doc.text(`NET PROFIT / LOSS: ${fmtMoney(netProfit)}  (net margin ${netMargin.toFixed(1)}%)`, 14, y); y += 8;
  doc.setFont('helvetica', 'normal');
  doc.text(`Memo — inventory purchases (restocks): ${fmtMoney(invPurchases)}`, 14, y); y += 12;
  // Sales table
  doc.setFont('helvetica', 'bold'); doc.text(`Sales (${sales.length})`, 14, y); y += 5;
  doc.setFont('helvetica', 'normal');
  sales.slice(0, 30).forEach(s => {
    if (y > 280) { doc.addPage(); y = 20; }
    doc.text(`${s.transactionId || ''}  ${fmtDate(s.date)}  ${s.customerName || ''}  ${fmtMoney(saleTotal(s))}`, 14, y); y += 5;
  });
  y += 6;
  doc.setFont('helvetica', 'bold'); doc.text(`Expenses (${expenses.length})`, 14, y); y += 5;
  doc.setFont('helvetica', 'normal');
  expenses.slice(0, 30).forEach(e => {
    if (y > 280) { doc.addPage(); y = 20; }
    doc.text(`${e.expenseId || ''}  ${fmtDate(e.date)}  ${e.category || ''}  ${e.description || ''}  ${fmtMoney(e.amount)}`, 14, y); y += 5;
  });
  doc.save('jb-pnl.pdf');
}

// ==================== REPORTS CENTER ====================
function getRepRange() {
  const period = document.getElementById('repPeriod').value;
  document.getElementById('repCustom').classList.toggle('hidden', period !== 'custom');
  if (period === 'custom') {
    const f = parseDateInput(document.getElementById('repFrom').value);
    const t = parseDateInput(document.getElementById('repTo').value);
    if (f && t && t >= f) return { from: new Date(f.getFullYear(), f.getMonth(), f.getDate()), to: new Date(t.getFullYear(), t.getMonth(), t.getDate(), 23, 59, 59, 999), period };
    return getRange('month');
  }
  return getRange(period);
}

function renderReports() {
  const range = getRepRange();
  const sales = activeSales().filter(s => { const d = tsToDate(s.date); return d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime(); });
  const expenses = activeExpenses().filter(e => { const d = tsToDate(e.date); return d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime(); });
  const revenue = revenueForRange(range.from, range.to);
  const totalExp = sumBy(expenses, e => e.amount);
  const net = revenue - totalExp;

  // Daily breakdown
  const dayMap = {};
  sales.forEach(s => { const d = tsToDate(s.date); if (d) { const k = dateInputVal(d); dayMap[k] = dayMap[k] || { income: 0, expense: 0, txns: 0 }; dayMap[k].income += saleTotal(s); dayMap[k].txns++; } });
  State.projRev.forEach(r => { const d = tsToDate(r.date || r.createdAt); if (!r.archived && d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime()) { const k = dateInputVal(d); dayMap[k] = dayMap[k] || { income: 0, expense: 0, txns: 0 }; dayMap[k].income += Number(r.amount) || 0; dayMap[k].txns++; } });
  expenses.forEach(e => { const d = tsToDate(e.date); if (d) { const k = dateInputVal(d); dayMap[k] = dayMap[k] || { income: 0, expense: 0, txns: 0 }; dayMap[k].expense += Number(e.amount) || 0; dayMap[k].txns++; } });
  const days = Object.keys(dayMap).sort().reverse();

  // Inventory reports
  const invItems = activeInventory();
  const lowItems = invItems.filter(i => { const c = Number(i.currentStock) || 0; return c > 0 && c <= (Number(i.minStock) || 0); });
  const outItems = invItems.filter(i => (Number(i.currentStock) || 0) <= 0);
  const invValue = sumBy(invItems, i => (Number(i.currentStock) || 0) * (Number(i.costPerUnit) || 0));

  // Projects
  const activeProjs = activeProjects().filter(p => !['Completed', 'Delivered', 'Cancelled'].includes(p.status));
  const completedProjs = activeProjects().filter(p => ['Completed', 'Delivered'].includes(p.status));
  const outstandingProjects = activeProjects().filter(p => p.status !== 'Cancelled' && projectBalance(p) > 0);

  document.getElementById('repContent').innerHTML = `
    <div class="grid grid-3 mb-12">
      <div class="stat-card green"><div class="lbl">Sales Income</div><div class="val sm">${fmtMoney(revenue)}</div><div class="note">${sales.length} sales</div></div>
      <div class="stat-card red"><div class="lbl">Expenses</div><div class="val sm">${fmtMoney(totalExp)}</div><div class="note">${expenses.length} expenses</div></div>
      <div class="stat-card ${net >= 0 ? 'yellow' : 'pink'}"><div class="lbl">Net Profit</div><div class="val sm">${fmtMoney(net)}</div></div>
    </div>

    <div class="card"><h3>📅 Daily Sales & Expenses <span class="sub">${fmtDate(range.from)} — ${fmtDate(range.to)}</span></h3>
      <div class="tbl-wrap"><table class="tbl" style="min-width:500px"><thead><tr><th>Date</th><th class="num">Income</th><th class="num">Expenses</th><th class="num">Net</th><th class="num">Transactions</th></tr></thead>
      <tbody>${days.map(k => {
        const d = dayMap[k];
        const netd = d.income - d.expense;
        return `<tr><td>${escapeHtml(fmtDate(parseDateInput(k)))}</td><td class="num pos">${fmtMoney(d.income)}</td><td class="num neg">${fmtMoney(d.expense)}</td><td class="num ${netd >= 0 ? 'pos' : 'neg'}">${fmtMoney(netd)}</td><td class="num">${d.txns}</td></tr>`;
      }).join('') || `<tr><td colspan="5">${emptyState('📅', 'No transactions in this period')}</td></tr>`}</tbody></table></div>
      <div class="flex mt-8"><button class="btn btn-outline btn-sm" onclick="exportDailyCSV()">⬇ CSV</button>
      <button class="btn btn-outline btn-sm" onclick="exportDailyExcel()">⬇ Excel</button>
      <button class="btn btn-outline btn-sm" onclick="exportDailyPDF()">⬇ PDF</button></div>
    </div>

    <div class="card"><h3>📦 Inventory Report</h3>
      <div class="grid grid-3 mb-8">
        <div class="stat-card blue"><div class="lbl">Total Value</div><div class="val sm">${fmtMoney(invValue)}</div><div class="note">${invItems.length} items</div></div>
        <div class="stat-card orange"><div class="lbl">Low Stock</div><div class="val sm">${lowItems.length}</div></div>
        <div class="stat-card red"><div class="lbl">Out of Stock</div><div class="val sm">${outItems.length}</div></div>
      </div>
      <div class="tbl-wrap"><table class="tbl" style="min-width:520px"><thead><tr><th>Item</th><th>Category</th><th class="num">Stock</th><th>Status</th><th class="num">Cost</th><th class="num">Value</th><th>Supplier</th></tr></thead>
      <tbody>${invItems.map(i => `<tr><td><b>${escapeHtml(i.name)}</b></td><td>${escapeHtml(i.category || '')}</td><td class="num">${fmtNum(i.currentStock)} ${escapeHtml(i.unit || '')}</td><td>${stockBadge(i.currentStock, i.minStock)}</td><td class="num">${fmtMoney(i.costPerUnit)}</td><td class="num">${fmtMoney((Number(i.currentStock) || 0) * (Number(i.costPerUnit) || 0))}</td><td>${escapeHtml(i.supplierName || '—')}</td></tr>`).join('') || `<tr><td colspan="7">${emptyState('📦', 'No inventory items')}</td></tr>`}</tbody></table></div>
    </div>

    <div class="card"><h3>📐 Project Report</h3>
      <div class="grid grid-3 mb-8">
        <div class="stat-card yellow"><div class="lbl">Active Projects</div><div class="val sm">${activeProjs.length}</div></div>
        <div class="stat-card green"><div class="lbl">Completed</div><div class="val sm">${completedProjs.length}</div></div>
        <div class="stat-card red"><div class="lbl">With Outstanding Balance</div><div class="val sm">${outstandingProjects.length}</div><div class="note">Total ${fmtMoney(sumBy(outstandingProjects, p => projectBalance(p)))}</div></div>
      </div>
      <div class="tbl-wrap"><table class="tbl" style="min-width:600px"><thead><tr><th>Project</th><th>Status</th><th class="num">Contract</th><th class="num">Paid</th><th class="num">Balance</th><th class="num">Revenue</th><th class="num">Expenses</th><th class="num">Profit</th><th class="num">Margin</th></tr></thead>
      <tbody>${activeProjects().map(p => {
        const bal = projectBalance(p); const prof = projectProfit(p); const marg = projectProfitMargin(p);
        return `<tr><td><b>${escapeHtml(p.name)}</b></td><td>${statusBadge(p.status)}</td><td class="num">${fmtMoney(p.contractPrice)}</td><td class="num">${fmtMoney(projectPaidTotal(p.id))}</td><td class="num ${bal > 0 ? 'neg' : 'pos'}">${fmtMoney(bal)}</td><td class="num">${fmtMoney(projectRevenueTotal(p.id))}</td><td class="num">${fmtMoney(projectExpenseTotal(p.id))}</td><td class="num ${prof >= 0 ? 'pos' : 'neg'}">${fmtMoney(prof)}</td><td class="num">${marg.toFixed(1)}%</td></tr>`;
      }).join('') || `<tr><td colspan="9">${emptyState('📐', 'No projects yet')}</td></tr>`}</tbody></table></div>
    </div>

    <div class="card"><h3>💰 Outstanding Receivables</h3>
      <div class="tbl-wrap"><table class="tbl" style="min-width:500px"><thead><tr><th>Type</th><th>Customer / Project</th><th class="num">Balance</th><th>Due Info</th></tr></thead>
      <tbody>
        ${activeSales().filter(s => (s.paymentStatus || 'Unpaid') !== 'Paid').map(s => `<tr><td>Sale</td><td>${escapeHtml(s.customerName || 'Walk-in')} — ${escapeHtml(s.transactionId || '')}</td><td class="num neg">${fmtMoney(saleBalance(s))}</td><td>${escapeHtml(fmtDate(s.date))}</td></tr>`).join('')}
        ${activeProjects().filter(p => p.status !== 'Cancelled' && projectBalance(p) > 0).map(p => `<tr><td>Project</td><td>${escapeHtml(p.name)}</td><td class="num neg">${fmtMoney(projectBalance(p))}</td><td>${escapeHtml(p.status)}</td></tr>`).join('')}
        ${!activeSales().some(s => (s.paymentStatus || 'Unpaid') !== 'Paid') && !activeProjects().some(p => p.status !== 'Cancelled' && projectBalance(p) > 0) ? `<tr><td colspan="4">${emptyState('💰', 'No outstanding receivables — nice! 🎉')}</td></tr>` : ''}
      </tbody></table></div>
    </div>
  `;
}

// ---- Daily report exports ----
function exportDailyCSV() {
  const range = getRepRange();
  const sales = activeSales().filter(s => { const d = tsToDate(s.date); return d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime(); });
  const expenses = activeExpenses().filter(e => { const d = tsToDate(e.date); return d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime(); });
  const rows = [['Type', 'ID', 'Date', 'Description', 'Category', 'Amount']];
  sales.forEach(s => rows.push(['Income', s.transactionId, fmtDate(s.date), s.customerName || 'Sale', s.category || '', saleTotal(s)]));
  expenses.forEach(e => rows.push(['Expense', e.expenseId, fmtDate(e.date), e.description || e.category, e.category, e.amount]));
  downloadCSV('jb-daily-report.csv', rows);
}
function exportDailyExcel() {
  const range = getRepRange();
  const sales = activeSales().filter(s => { const d = tsToDate(s.date); return d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime(); });
  const expenses = activeExpenses().filter(e => { const d = tsToDate(e.date); return d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime(); });
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(sales.map(s => ({ 'Transaction ID': s.transactionId, 'Date': fmtDate(s.date), 'Customer': s.customerName, 'Items': (Array.isArray(s.items) ? s.items : []).map(i => i.product).join(', '), 'Total': saleTotal(s), 'Payment': s.paymentStatus, 'Method': s.paymentMethod })));
  XLSX.utils.book_append_sheet(wb, ws1, 'Sales');
  const ws2 = XLSX.utils.json_to_sheet(expenses.map(e => ({ 'Expense ID': e.expenseId, 'Date': fmtDate(e.date), 'Category': e.category, 'Description': e.description, 'Amount': e.amount, 'Supplier': e.supplierName })));
  XLSX.utils.book_append_sheet(wb, ws2, 'Expenses');
  const ws3 = XLSX.utils.json_to_sheet(activeInventory().map(i => ({ 'Item': i.name, 'SKU': i.sku, 'Category': i.category, 'Stock': i.currentStock, 'Unit': i.unit, 'Cost': i.costPerUnit, 'Value': (Number(i.currentStock) || 0) * (Number(i.costPerUnit) || 0), 'Status': (Number(i.currentStock) || 0) <= 0 ? 'OUT' : (Number(i.currentStock) || 0) <= (Number(i.minStock) || 0) ? 'LOW' : 'OK' })));
  XLSX.utils.book_append_sheet(wb, ws3, 'Inventory');
  XLSX.writeFile(wb, 'jb-report.xlsx');
}
function exportDailyPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const range = getRepRange();
  const sales = activeSales().filter(s => { const d = tsToDate(s.date); return d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime(); });
  const expenses = activeExpenses().filter(e => { const d = tsToDate(e.date); return d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime(); });
  const revenue = revenueForRange(range.from, range.to);
  const totalExp = sumBy(expenses, e => e.amount);
  let y = 20;
  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text('JB Digital Printing — Daily Report', 14, y); y += 7;
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(`Period: ${fmtDate(range.from)} — ${fmtDate(range.to)}`, 14, y); y += 6;
  doc.text(`Income: ${fmtMoney(revenue)}   Expenses: ${fmtMoney(totalExp)}   Net: ${fmtMoney(revenue - totalExp)}`, 14, y); y += 10;
  doc.setFont('helvetica', 'bold'); doc.text('Income', 14, y); y += 5; doc.setFont('helvetica', 'normal');
  sales.slice(0, 40).forEach(s => { if (y > 280) { doc.addPage(); y = 20; } doc.text(`${s.transactionId || ''}  ${fmtDate(s.date)}  ${s.customerName || ''}  ${fmtMoney(saleTotal(s))}`, 14, y); y += 5; });
  y += 6;
  doc.setFont('helvetica', 'bold'); doc.text('Expenses', 14, y); y += 5; doc.setFont('helvetica', 'normal');
  expenses.slice(0, 40).forEach(e => { if (y > 280) { doc.addPage(); y = 20; } doc.text(`${e.expenseId || ''}  ${fmtDate(e.date)}  ${e.category || ''}  ${e.description || ''}  ${fmtMoney(e.amount)}`, 14, y); y += 5; });
  doc.save('jb-daily-report.pdf');
}
