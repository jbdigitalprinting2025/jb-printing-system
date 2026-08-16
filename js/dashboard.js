// ============================================================
// DASHBOARD — today/week/month stats, business status, charts
// ============================================================
let dashCharts = [];

function destroyCharts() {
  dashCharts.forEach(c => { try { c.destroy(); } catch (e) {} });
  dashCharts = [];
}

function getDashRange() {
  const period = document.getElementById('dashPeriod').value;
  if (period === 'custom') {
    const f = parseDateInput(document.getElementById('dashFrom').value);
    const t = parseDateInput(document.getElementById('dashTo').value);
    if (f && t && t >= f) return { from: new Date(f.getFullYear(), f.getMonth(), f.getDate()), to: new Date(t.getFullYear(), t.getMonth(), t.getDate(), 23, 59, 59, 999), period };
    showToast('Invalid date range', 'error');
    return getRange('month');
  }
  return getRange(period);
}

function renderDashboard() {
  const range = getDashRange();
  document.getElementById('dashCustomRange').classList.toggle('hidden', document.getElementById('dashPeriod').value !== 'custom');
  const sales = activeSales().filter(s => { const d = tsToDate(s.date); return d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime(); });
  const expenses = activeExpenses().filter(e => { const d = tsToDate(e.date); return d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime(); });

  const totalIncome = sumBy(sales, saleTotal);
  const totalExpenses = sumBy(expenses, e => e.amount);
  const net = totalIncome - totalExpenses;

  // ==== Period cards ====
  const noData = sales.length === 0 && expenses.length === 0;
  const periodCard = `
    <div class="grid grid-3 mb-12">
      <div class="stat-card green"><div class="lbl">Income</div><div class="val">${fmtMoneyShort(totalIncome)}</div><div class="note">${noData ? 'No transactions yet' : sales.length + ' transactions'}</div><div class="ico">💰</div></div>
      <div class="stat-card red"><div class="lbl">Expenses</div><div class="val">${fmtMoneyShort(totalExpenses)}</div><div class="note">${noData ? 'No expenses recorded' : expenses.length + ' transactions'}</div><div class="ico">💸</div></div>
      <div class="stat-card ${net >= 0 ? 'yellow' : 'pink'}"><div class="lbl">Net Profit / Loss</div><div class="val">${fmtMoneyShort(net)}</div><div class="note">${noData ? 'Add your first sale to start' : (net >= 0 ? '▲ Profit' : '▼ Loss')}</div><div class="ico">📈</div></div>
    </div>`;

  // ==== Today / Week / Month quick stats ====
  const t = new Date(); const todayStart = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const weekStart = (() => { const day = (todayStart.getDay() + 6) % 7; return new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() - day); })();
  const monthStart = new Date(t.getFullYear(), t.getMonth(), 1);
  const todayEnd = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate(), 23, 59, 59, 999);
  const weekEnd = todayEnd, monthEnd = todayEnd;
  const agg = (start, end) => {
    const ss = activeSales().filter(s => { const d = tsToDate(s.date); return d && d.getTime() >= start.getTime() && d.getTime() <= end.getTime(); });
    const ee = activeExpenses().filter(e => { const d = tsToDate(e.date); return d && d.getTime() >= start.getTime() && d.getTime() <= end.getTime(); });
    return { i: sumBy(ss, saleTotal), e: sumBy(ee, x => x.amount), n: sumBy(ss, saleTotal) - sumBy(ee, x => x.amount) };
  };
  const today = agg(todayStart, todayEnd), week = agg(weekStart, weekEnd), month = agg(monthStart, monthEnd);
  const periodName = { today: 'Today', yesterday: 'Yesterday', week: 'This Week', lastweek: 'Last Week', month: 'This Month', lastmonth: 'Last Month', quarter: 'This Quarter', year: 'This Year', custom: 'Custom Range' }[range.period] || 'Period';

  const quickStats = `
    <div class="card"><h3>📆 Today · This Week · This Month</h3>
      <div class="grid grid-3">
        <div><div class="lbl" style="font-size:10.5px;font-weight:800;color:var(--gray-500);text-transform:uppercase">Today Net</div><div class="big-num ${today.n >= 0 ? 'pos' : 'neg'}">${fmtMoneyShort(today.n)}</div><div class="muted">In ${fmtMoneyShort(today.i)} · Out ${fmtMoneyShort(today.e)}</div></div>
        <div><div class="lbl" style="font-size:10.5px;font-weight:800;color:var(--gray-500);text-transform:uppercase">Week Net</div><div class="big-num ${week.n >= 0 ? 'pos' : 'neg'}">${fmtMoneyShort(week.n)}</div><div class="muted">In ${fmtMoneyShort(week.i)} · Out ${fmtMoneyShort(week.e)}</div></div>
        <div><div class="lbl" style="font-size:10.5px;font-weight:800;color:var(--gray-500);text-transform:uppercase">Month Net</div><div class="big-num ${month.n >= 0 ? 'pos' : 'neg'}">${fmtMoneyShort(month.n)}</div><div class="muted">In ${fmtMoneyShort(month.i)} · Out ${fmtMoneyShort(month.e)}</div></div>
      </div>
    </div>`;

  // ==== Business status ====
  const invValue = sumBy(activeInventory(), it => (Number(it.currentStock) || 0) * (Number(it.costPerUnit) || 0));
  const lowStock = activeInventory().filter(it => (Number(it.currentStock) || 0) > 0 && (Number(it.currentStock) || 0) <= (Number(it.minStock) || 0));
  const outStock = activeInventory().filter(it => (Number(it.currentStock) || 0) <= 0);
  const activeProjs = activeProjects().filter(p => !['Completed', 'Delivered', 'Cancelled'].includes(p.status));
  const projRevenue = sumBy(activeProjs, p => projectPaidTotal(p.id));
  const projExpenses = sumBy(activeProjs, p => projectExpenseTotal(p.id));
  const projProfit = projRevenue - projExpenses;
  const receivables = round2(sumBy(activeSales().filter(s => (s.paymentStatus || 'Unpaid') !== 'Paid'), s => saleBalance(s)) + sumBy(activeProjects().filter(p => p.status !== 'Cancelled'), p => Math.max(0, projectBalance(p))));

  const bizStatus = `
    <div class="card"><h3>🏪 Business Status</h3>
      <div class="grid grid-3">
        <div class="stat-card blue"><div class="lbl">Inventory Value</div><div class="val sm">${fmtMoneyShort(invValue)}</div><div class="note">${activeInventory().length} items</div><div class="ico">📦</div></div>
        <div class="stat-card orange"><div class="lbl">Low Stock</div><div class="val sm">${lowStock.length} items</div><div class="note"><a href="javascript:void(0)" onclick="go('inventory')">View →</a></div><div class="ico">⚠️</div></div>
        <div class="stat-card red"><div class="lbl">Out of Stock</div><div class="val sm">${outStock.length} items</div><div class="note"><a href="javascript:void(0)" onclick="go('inventory')">View →</a></div><div class="ico">🚫</div></div>
        <div class="stat-card yellow"><div class="lbl">Active Projects</div><div class="val sm">${activeProjs.length}</div><div class="note"><a href="javascript:void(0)" onclick="go('projects')">View →</a></div><div class="ico">📐</div></div>
        <div class="stat-card dark"><div class="lbl">Project Revenue</div><div class="val sm">${fmtMoneyShort(projRevenue)}</div><div class="note">Exp ${fmtMoneyShort(projExpenses)}</div><div class="ico">🏗️</div></div>
        <div class="stat-card ${projProfit >= 0 ? 'green' : 'pink'}"><div class="lbl">Project P/L</div><div class="val sm">${fmtMoneyShort(projProfit)}</div><div class="note">${projProfit >= 0 ? 'Profit' : 'Loss'}</div><div class="ico">🎯</div></div>
        <div class="stat-card pink"><div class="lbl">Outstanding Receivables</div><div class="val sm">${fmtMoneyShort(Math.max(0, receivables))}</div><div class="note">Unpaid sales + project balances</div><div class="ico">🧾</div></div>
      </div>
    </div>`;

  // ==== Charts ====
  const chartsHtml = `
    <div class="grid grid-2">
      <div class="card"><h3>📈 ${escapeHtml(periodName)} Income vs Expenses</h3><div class="chart-box"><canvas id="chartDaily"></canvas></div></div>
      <div class="card"><h3>🗓 Monthly Income vs Expenses</h3><div class="chart-box"><canvas id="chartMonthly"></canvas></div></div>
      <div class="card"><h3>📉 Profit / Loss Trend</h3><div class="chart-box"><canvas id="chartTrend"></canvas></div></div>
      <div class="card"><h3>🏷 Revenue by Category</h3><div class="chart-box"><canvas id="chartRevCat"></canvas></div></div>
      <div class="card"><h3>🧾 Expenses by Category</h3><div class="chart-box"><canvas id="chartExpCat"></canvas></div></div>
      <div class="card"><h3>📦 Inventory Value by Category</h3><div class="chart-box"><canvas id="chartInvVal"></canvas></div></div>
      <div class="card" style="grid-column:1/-1"><h3>📐 Project Profitability</h3><div class="chart-box"><canvas id="chartProj"></canvas></div></div>
    </div>`;

  const quickActions = `
    <div class="card"><h3>⚡ Quick Actions</h3>
      <div class="flex flex-wrap">
        ${canWrite() ? `
        <button class="btn btn-yellow btn-sm" onclick="openSaleModal()">+ Add Sale</button>
        <button class="btn btn-pink btn-sm" onclick="openExpenseModal()">+ Add Expense</button>
        <button class="btn btn-green btn-sm" onclick="openRestockModal()">+ Restock</button>
        <button class="btn btn-blue btn-sm" onclick="openInvTxModal()">+ Use Material</button>
        <button class="btn btn-dark btn-sm" onclick="openProjectModal()">+ Create Project</button>
        <button class="btn btn-outline btn-sm" onclick="openCustomerModal()">+ Add Customer</button>
        <button class="btn btn-outline btn-sm" onclick="openSupplierModal()">+ Add Supplier</button>` : `<span class="muted">Viewer account — view only. Contact your admin to add records.</span>`}
      </div>
    </div>`;

  document.getElementById('dashContent').innerHTML = periodCard + quickStats + bizStatus + quickActions + chartsHtml;
  setTimeout(() => drawDashCharts(sales, expenses, range), 60);
}

// ============ CHARTS ============
function mkChart(canvasId, config) {
  const el = document.getElementById(canvasId);
  if (!el) return null;
  try {
    const c = new Chart(el, config);
    dashCharts.push(c);
    return c;
  } catch (e) { console.error('chart err', canvasId, e); return null; }
}
function moneyTicks(v) {
  return fmtMoneyShort(v);
}

function drawDashCharts(sales, expenses, range) {
  destroyCharts();
  // 1. Daily income vs expenses in range (last 14 days if range is long, else days in range)
  const days = [];
  const start = new Date(range.from); const end = new Date(range.to);
  let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  let count = 0;
  while (cursor <= end && count < 31) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
    count++;
  }
  if (count === 31) { // take last 31 days ending at end
    days.length = 0;
    cursor = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    for (let i = 30; i >= 0; i--) { const d = new Date(cursor); d.setDate(cursor.getDate() - i); days.push(d); }
  }
  const dayLabels = days.map(d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  const dayIn = days.map(d => {
    const dd = d.getTime();
    return sumBy(sales.filter(s => { const x = tsToDate(s.date); return x && x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate(); }), saleTotal);
  });
  const dayOut = days.map(d => sumBy(expenses.filter(e => { const x = tsToDate(e.date); return x && x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate(); }), e => e.amount));

  mkChart('chartDaily', {
    type: 'bar',
    data: { labels: dayLabels, datasets: [
      { label: 'Income', data: dayIn, backgroundColor: 'rgba(46,125,50,.75)', borderRadius: 4 },
      { label: 'Expenses', data: dayOut, backgroundColor: 'rgba(233,69,96,.75)', borderRadius: 4 }
    ]},
    options: chartOpts(true)
  });

  // 2. Monthly income vs expenses (last 12 months)
  const months = [];
  const mNow = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(mNow.getFullYear(), mNow.getMonth() - i, 1);
    months.push(d);
  }
  const mLabels = months.map(d => d.toLocaleDateString('en-US', { month: 'short' }));
  const mIn = months.map(d => sumBy(activeSales().filter(s => { const x = tsToDate(s.date); return x && x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth(); }), saleTotal));
  const mOut = months.map(d => sumBy(activeExpenses().filter(e => { const x = tsToDate(e.date); return x && x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth(); }), e => e.amount));
  mkChart('chartMonthly', {
    type: 'bar',
    data: { labels: mLabels, datasets: [
      { label: 'Income', data: mIn, backgroundColor: 'rgba(46,125,50,.75)', borderRadius: 4 },
      { label: 'Expenses', data: mOut, backgroundColor: 'rgba(233,69,96,.75)', borderRadius: 4 }
    ]},
    options: chartOpts(true)
  });

  // 3. Profit/loss trend — net per day in range
  const netLine = days.map((d, i) => dayIn[i] - dayOut[i]);
  mkChart('chartTrend', {
    type: 'line',
    data: { labels: dayLabels, datasets: [
      { label: 'Net P/L', data: netLine, borderColor: netLine.every(v => v >= 0) ? '#2E7D32' : '#C62828', backgroundColor: 'rgba(255,193,7,.12)', fill: true, tension: .3, pointRadius: 2 }
    ]},
    options: chartOpts(false)
  });

  // 4. Revenue by category
  const revCat = {};
  sales.forEach(s => {
    const items = (Array.isArray(s.items) && s.items.length) ? s.items : [{ category: s.category || 'Other', qty: 1, unitPrice: saleTotal(s) }];
    items.forEach(it => {
      const cat = it.category || 'Other';
      revCat[cat] = (revCat[cat] || 0) + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
    });
  });
  mkChart('chartRevCat', pieChart(revCat));

  // 5. Expenses by category
  const expCat = {};
  expenses.forEach(e => { const c = e.category || 'Other'; expCat[c] = (expCat[c] || 0) + (Number(e.amount) || 0); });
  mkChart('chartExpCat', pieChart(expCat));

  // 6. Inventory value by category
  const invCat = {};
  activeInventory().forEach(it => { const c = it.category || 'Other'; invCat[c] = (invCat[c] || 0) + (Number(it.currentStock) || 0) * (Number(it.costPerUnit) || 0); });
  mkChart('chartInvVal', pieChart(invCat));

  // 7. Project profitability
  const projs = activeProjects().slice(0, 8);
  const pLabels = projs.map(p => p.name);
  const pRev = projs.map(p => projectRevenueTotal(p.id));
  const pExp = projs.map(p => projectExpenseTotal(p.id));
  mkChart('chartProj', {
    type: 'bar',
    data: { labels: pLabels, datasets: [
      { label: 'Revenue', data: pRev, backgroundColor: 'rgba(255,193,7,.8)', borderRadius: 4 },
      { label: 'Expenses', data: pExp, backgroundColor: 'rgba(233,69,96,.8)', borderRadius: 4 },
      { label: 'Profit', data: projs.map((p, i) => pRev[i] - pExp[i]), backgroundColor: 'rgba(46,125,50,.8)', borderRadius: 4 }
    ]},
    options: chartOpts(true)
  });
}
function pieChart(mapObj) {
  const entries = Object.entries(mapObj).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const palette = ['#FFC107', '#E94560', '#2E7D32', '#1565C0', '#EF6C00', '#7B1FA2', '#00838F', '#5D4037', '#9E9E9E', '#C62828'];
  return {
    type: 'doughnut',
    data: { labels: entries.map(e => e[0]), datasets: [{ data: entries.map(e => e[1]), backgroundColor: palette.slice(0, entries.length), borderWidth: 2, borderColor: '#fff' }] },
    options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: { callbacks: { label: c => ' ' + c.label + ': ' + fmtMoney(c.parsed) } } }, maintainAspectRatio: false }
  };
}
function chartOpts(legend) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: legend ? { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } : { display: false },
      tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + fmtMoney(c.parsed.y !== undefined ? c.parsed.y : c.parsed) } }
    },
    scales: legend ? { x: { grid: { display: false }, ticks: { font: { size: 9 } } }, y: { beginAtZero: true, ticks: { callback: v => fmtMoneyShort(v), font: { size: 9 } } } } : { y: { ticks: { callback: v => fmtMoneyShort(v), font: { size: 9 } } } }
  };
}
