// ============================================================
// REPORTS — Profit & Loss + Reports center + exports (CSV/Excel/PDF)
// ============================================================

// ==================== PROFIT & LOSS ====================
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

function renderPnL() {
  const range = getPnLRange();
  const sales = activeSales().filter(s => { const d = tsToDate(s.date); return d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime(); });
  const expenses = activeExpenses().filter(e => { const d = tsToDate(e.date); return d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime(); });

  const revenue = sumBy(sales, saleTotal);
  const totalExpenses = sumBy(expenses, e => e.amount);

  // categorize expenses
  const expByCat = {};
  expenses.forEach(e => { const c = e.category || 'Other'; expByCat[c] = (expByCat[c] || 0) + (Number(e.amount) || 0); });
  const materialCosts = sumBy(expenses.filter(e => ['Materials', 'Ink', 'Tarpaulin', 'Sticker Material', 'DTF Film', 'DTF Powder', 'Sublimation Paper', 'Vinyl'].includes(e.category)), e => e.amount);
  const laborCosts = sumBy(expenses.filter(e => ['Salary/Labor'].includes(e.category)), e => e.amount);
  const opExpenses = sumBy(expenses.filter(e => ['Electricity', 'Water', 'Rent', 'Internet', 'Delivery', 'Transportation', 'Maintenance', 'Printer Repair', 'Equipment', 'Marketing', 'Office Supplies'].includes(e.category)), e => e.amount);
  const projExpenses = sumBy(expenses.filter(e => e.projectId), e => e.amount);
  const otherExpenses = totalExpenses - materialCosts - laborCosts - opExpenses;

  const netProfit = revenue - totalExpenses;
  const grossMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const periodLabel = {
    daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly', custom: 'Custom Range'
  }[range.period] || '';

  const html = `
    <div class="grid grid-4 mb-12">
      <div class="stat-card green"><div class="lbl">Revenue</div><div class="val">${fmtMoneyShort(revenue)}</div><div class="note">${sales.length} sales</div></div>
      <div class="stat-card red"><div class="lbl">Total Expenses</div><div class="val">${fmtMoneyShort(totalExpenses)}</div><div class="note">${expenses.length} expenses</div></div>
      <div class="stat-card ${netProfit >= 0 ? 'yellow' : 'pink'}"><div class="lbl">Net Profit / Loss</div><div class="val">${fmtMoneyShort(netProfit)}</div><div class="note">${netProfit >= 0 ? 'Profit' : 'Loss'}</div></div>
      <div class="stat-card blue"><div class="lbl">Net Profit Margin</div><div class="val">${netMargin.toFixed(1)}%</div><div class="note">Gross margin ${grossMargin.toFixed(1)}%</div></div>
    </div>
    <div class="grid grid-2">
      <div class="card"><h3>🧾 Revenue</h3>
        <div class="set-row"><span class="sr-lbl">Sales / Income</span><b>${fmtMoney(revenue)}</b></div>
        <div class="set-row"><span class="sr-lbl">Total Revenue</span><b class="pos">${fmtMoney(revenue)}</b></div>
      </div>
      <div class="card"><h3>💸 Expenses</h3>
        <div class="set-row"><span class="sr-lbl">Material Costs</span><span>${fmtMoney(materialCosts)}</span></div>
        <div class="set-row"><span class="sr-lbl">Labor Costs</span><span>${fmtMoney(laborCosts)}</span></div>
        <div class="set-row"><span class="sr-lbl">Operating Expenses</span><span>${fmtMoney(opExpenses)}</span></div>
        <div class="set-row"><span class="sr-lbl">Project Expenses</span><span>${fmtMoney(projExpenses)}</span></div>
        <div class="set-row"><span class="sr-lbl">Other Expenses</span><span>${fmtMoney(Math.max(0, otherExpenses))}</span></div>
        <div class="set-row"><b>Total Expenses</b><b class="neg">${fmtMoney(totalExpenses)}</b></div>
      </div>
    </div>
    <div class="card"><h3>🧾 Net Profit / Loss</h3>
      <div class="set-row" style="padding:14px 0"><span class="sr-lbl" style="font-size:15px;font-weight:800">NET PROFIT = REVENUE − EXPENSES</span><b class="${netProfit >= 0 ? 'pos' : 'neg'}" style="font-size:20px">${fmtMoney(netProfit)}</b></div>
      <div class="muted">Calculated automatically from actual records. Never entered manually.</div>
    </div>
    <div class="card"><h3>📊 Expenses by Category</h3>
      <div class="flex flex-wrap">${Object.entries(expByCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<span class="chip yellow">${escapeHtml(c)}: ${fmtMoney(v)}</span>`).join('') || '<span class="muted">No expenses in this period</span>'}</div>
    </div>`;
  document.getElementById('pnlContent').innerHTML = html;
}

function exportPnLCSV() {
  const range = getPnLRange();
  const sales = activeSales().filter(s => { const d = tsToDate(s.date); return d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime(); });
  const expenses = activeExpenses().filter(e => { const d = tsToDate(e.date); return d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime(); });
  const revenue = sumBy(sales, saleTotal);
  const totalExpenses = sumBy(expenses, e => e.amount);
  const net = revenue - totalExpenses;
  const rows = [
    ['JB Digital Printing — Profit & Loss Report'],
    ['Period', `${fmtDate(range.from)} — ${fmtDate(range.to)}`],
    [''],
    ['Revenue (Sales)', revenue],
    ['Total Expenses', totalExpenses],
    ['NET PROFIT / LOSS', net],
    [''],
    ['Sales Transactions'],
    ['Transaction ID', 'Date', 'Customer', 'Items', 'Total', 'Payment Status']
  ];
  sales.forEach(s => rows.push([s.transactionId, fmtDate(s.date), s.customerName || '', (s.items || []).map(i => i.product).join(', '), saleTotal(s), s.paymentStatus]));
  rows.push([''], ['Expense Transactions'], ['Expense ID', 'Date', 'Category', 'Description', 'Amount', 'Supplier']);
  expenses.forEach(e => rows.push([e.expenseId, fmtDate(e.date), e.category, e.description, e.amount, e.supplierName || '']));
  downloadCSV('jb-pnl.csv', rows);
}
function exportPnLPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const range = getPnLRange();
  const sales = activeSales().filter(s => { const d = tsToDate(s.date); return d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime(); });
  const expenses = activeExpenses().filter(e => { const d = tsToDate(e.date); return d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime(); });
  const revenue = sumBy(sales, saleTotal);
  const totalExpenses = sumBy(expenses, e => e.amount);
  const net = revenue - totalExpenses;
  let y = 20;
  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text('JB Digital Printing — Profit & Loss', 14, y);
  y += 7;
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(`Period: ${fmtDate(range.from)} — ${fmtDate(range.to)}`, 14, y); y += 6;
  doc.text(`Generated: ${fmtDateTime(new Date())}`, 14, y); y += 10;
  doc.setFont('helvetica', 'bold');
  doc.text(`Revenue: ${fmtMoney(revenue)}`, 14, y); y += 6;
  doc.text(`Expenses: ${fmtMoney(totalExpenses)}`, 14, y); y += 6;
  doc.text(`NET PROFIT / LOSS: ${fmtMoney(net)}`, 14, y); y += 6;
  doc.setFont('helvetica', 'normal');
  doc.text(`Profit margin: ${revenue > 0 ? ((net / revenue) * 100).toFixed(1) : 0}%`, 14, y); y += 12;
  // Sales table
  doc.setFont('helvetica', 'bold'); doc.text('Sales', 14, y); y += 5;
  doc.setFont('helvetica', 'normal');
  sales.slice(0, 30).forEach(s => {
    if (y > 280) { doc.addPage(); y = 20; }
    doc.text(`${s.transactionId || ''}  ${fmtDate(s.date)}  ${s.customerName || ''}  ${fmtMoney(saleTotal(s))}`, 14, y); y += 5;
  });
  y += 6;
  doc.setFont('helvetica', 'bold'); doc.text('Expenses', 14, y); y += 5;
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
  const revenue = sumBy(sales, saleTotal);
  const totalExp = sumBy(expenses, e => e.amount);
  const net = revenue - totalExp;

  // Daily breakdown
  const dayMap = {};
  sales.forEach(s => { const d = tsToDate(s.date); if (d) { const k = dateInputVal(d); dayMap[k] = dayMap[k] || { income: 0, expense: 0, txns: 0 }; dayMap[k].income += saleTotal(s); dayMap[k].txns++; } });
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
  const ws1 = XLSX.utils.json_to_sheet(sales.map(s => ({ 'Transaction ID': s.transactionId, 'Date': fmtDate(s.date), 'Customer': s.customerName, 'Items': (s.items || []).map(i => i.product).join(', '), 'Total': saleTotal(s), 'Payment': s.paymentStatus, 'Method': s.paymentMethod })));
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
  const revenue = sumBy(sales, saleTotal);
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
