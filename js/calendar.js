// ============================================================
// DAILY CALENDAR — month/week/day/list views + day detail + quick add
// ============================================================
let calView = 'month';       // month | week | day | list
let calCursor = new Date();  // current viewed date (month start or selected date)
let dayDetailDate = null;    // selected date for drawer

function renderCalendar() {
  const el = document.getElementById('calContent');
  const today = new Date();
  const d = calCursor;
  const monthLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Build day summary map: dateKey -> {income, expense, count}
  const map = {};
  const keyOf = dt => `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
  activeSales().forEach(s => { const x = tsToDate(s.date); if (x) { const k = keyOf(x); if (!map[k]) map[k] = { income: 0, expense: 0, count: 0 }; map[k].income += saleTotal(s); map[k].count++; } });
  activeExpenses().forEach(e => { const x = tsToDate(e.date); if (x) { const k = keyOf(x); if (!map[k]) map[k] = { income: 0, expense: 0, count: 0 }; map[k].expense += Number(e.amount) || 0; map[k].count++; } });

  const nav = `
    <div class="cal-nav">
      <button onclick="calNav('prev')">◀</button>
      <button onclick="calNav('today')">Today</button>
      <div class="month-name">${monthLabel}</div>
      <button onclick="calNav('next')">▶</button>
      <select onchange="calJumpMonth(this.value)">
        ${monthsOptions(d.getFullYear())}
      </select>
      <select onchange="calJumpYear(this.value)">
        ${yearsOptions(d.getFullYear())}
      </select>
    </div>
    <div class="cal-view-tabs">
      <button class="${calView === 'month' ? 'active' : ''}" onclick="calSetView('month')">Month</button>
      <button class="${calView === 'week' ? 'active' : ''}" onclick="calSetView('week')">Week</button>
      <button class="${calView === 'day' ? 'active' : ''}" onclick="calSetView('day')">Day</button>
      <button class="${calView === 'list' ? 'active' : ''}" onclick="calSetView('list')">List</button>
    </div>`;

  let body = '';
  if (calView === 'month') body = renderMonthView(d, map, today, keyOf);
  else if (calView === 'week') body = renderWeekView(d, map, today, keyOf);
  else if (calView === 'day') body = renderDayView(d, map, today, keyOf);
  else body = renderListView(d, map, keyOf);

  const legend = `
    <div class="cal-legend">
      <span><span class="dot" style="background:var(--green)"></span> Income</span>
      <span><span class="dot" style="background:var(--red)"></span> Expense</span>
      <span><span class="dot" style="background:var(--gray-400)"></span> No activity</span>
      <span>👆 Tap a date for details + quick add</span>
    </div>`;

  el.innerHTML = nav + body + legend;
}

function monthsOptions(curYear) {
  const m = calCursor.getMonth();
  let h = '';
  for (let i = 0; i < 12; i++) {
    const name = new Date(curYear, i, 1).toLocaleDateString('en-US', { month: 'short' });
    h += `<option value="${i}" ${i === m ? 'selected' : ''}>${name}</option>`;
  }
  return h;
}
function yearsOptions(curYear) {
  let h = '';
  for (let y = curYear - 3; y <= curYear + 3; y++) {
    h += `<option value="${y}" ${y === curYear ? 'selected' : ''}>${y}</option>`;
  }
  return h;
}

function calNav(dir) {
  if (calView === 'month') calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + dir, 1);
  else if (calView === 'week') calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth(), calCursor.getDate() + dir * 7);
  else calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth(), calCursor.getDate() + dir);
  renderCalendar();
}
function calJumpMonth(v) { calCursor = new Date(calCursor.getFullYear(), parseInt(v, 10), 1); renderCalendar(); }
function calJumpYear(v) { calCursor = new Date(parseInt(v, 10), calCursor.getMonth(), 1); renderCalendar(); }
function calSetView(v) { calView = v; renderCalendar(); }
function calGotoToday() { calCursor = new Date(); renderCalendar(); }

function isToday(d) {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}
function isSelected(d) {
  return dayDetailDate && d.getFullYear() === dayDetailDate.getFullYear() && d.getMonth() === dayDetailDate.getMonth() && d.getDate() === dayDetailDate.getDate();
}

// ---- MONTH VIEW ----
function renderMonthView(d, map, today, keyOf) {
  const year = d.getFullYear(), month = d.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  // leading blanks
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  // trailing blanks to complete last week
  while (cells.length % 7 !== 0) cells.push(null);

  const dow = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  let html = `<div class="cal-grid">${dow.map(x => `<div class="cal-dow">${x}</div>`).join('')}`;
  cells.forEach(c => {
    if (!c) { html += `<div class="cal-cell" style="visibility:hidden"></div>`; return; }
    const k = keyOf(c);
    const s = map[k];
    const cls = ['cal-cell'];
    if (isToday(c)) cls.push('today');
    if (isSelected(c)) cls.push('selected');
    if (!s) cls.push('no-act');
    const income = s && s.income ? `<div class="c-income">↑ ${fmtMoneyShort(s.income)}</div>` : '';
    const expense = s && s.expense ? `<div class="c-expense">↓ ${fmtMoneyShort(s.expense)}</div>` : '';
    const net = s ? `<div class="c-net" style="color:${(s.income - s.expense) >= 0 ? 'var(--gray-700)' : 'var(--red)'}">${fmtMoneyShort(s.income - s.expense)}</div>` : '';
    const count = s ? `<span class="c-count">${s.count}</span>` : '';
    html += `<div class="${cls.join(' ')}" onclick="openDayDetail(${c.getFullYear()},${c.getMonth()},${c.getDate()})">
      <div class="dnum">${c.getDate()}</div>${income}${expense}${net}${count}</div>`;
  });
  html += '</div>';
  return html;
}

// ---- WEEK VIEW ----
function renderWeekView(d, map, today, keyOf) {
  const dow = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  let html = `<div class="week-grid">`;
  for (let i = 0; i < 7; i++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const k = keyOf(day); const s = map[k];
    const cls = isToday(day) ? 'style="border:2px solid var(--yellow-dark)"' : '';
    html += `<div class="week-day" ${cls} onclick="openDayDetail(${day.getFullYear()},${day.getMonth()},${day.getDate()})">
      <div class="wd-date"><span class="dow">${dow[i]}</span>${day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
      <div class="wd-body">
        <div class="r1">
          <span style="color:var(--green);font-weight:700">In ${fmtMoneyShort(s ? s.income : 0)}</span>
          <span style="color:var(--red);font-weight:700">Out ${fmtMoneyShort(s ? s.expense : 0)}</span>
          <span style="font-weight:800">Net ${fmtMoneyShort(s ? s.income - s.expense : 0)}</span>
          <span class="muted">${s ? s.count + ' txns' : 'No activity'}</span>
        </div>
      </div>
    </div>`;
  }
  html += '</div>';
  return html;
}

// ---- DAY VIEW ----
function renderDayView(d, map, today, keyOf) {
  const k = keyOf(d); const s = map[k];
  const txs = dayTxns(d);
  const incomeTxs = txs.filter(t => t.type === 'income');
  const expenseTxs = txs.filter(t => t.type === 'expense');
  let html = `
    <div class="card">
      <h3>📅 ${fmtDate(d)}</h3>
      <div class="grid grid-4">
        <div class="stat-card green"><div class="lbl">Income</div><div class="val">${fmtMoneyShort(s ? s.income : 0)}</div></div>
        <div class="stat-card red"><div class="lbl">Expenses</div><div class="val">${fmtMoneyShort(s ? s.expense : 0)}</div></div>
        <div class="stat-card yellow"><div class="lbl">Net</div><div class="val">${fmtMoneyShort(s ? s.income - s.expense : 0)}</div></div>
        <div class="stat-card blue"><div class="lbl">Transactions</div><div class="val">${s ? s.count : 0}</div></div>
      </div>
      <div class="flex mt-12">
        <button class="btn btn-yellow btn-sm" onclick="openQuickAdd('income','${dateInputVal(d)}')">+ ADD INCOME</button>
        <button class="btn btn-pink btn-sm" onclick="openQuickAdd('expense','${dateInputVal(d)}')">+ ADD EXPENSE</button>
      </div>
    </div>
    <div class="card"><h3>💰 Income (${incomeTxs.length})</h3><div id="dayIncomeList">${txnCards(incomeTxs)}</div></div>
    <div class="card"><h3>💸 Expenses (${expenseTxs.length})</h3><div id="dayExpenseList">${txnCards(expenseTxs)}</div></div>`;
  return html;
}
function txnCards(txs) {
  if (!txs.length) return emptyState('🗒️', 'No transactions');
  return txs.map(t => `
    <div class="dd-txn ${t.type}">
      <div class="dt-ico">${t.type === 'income' ? '💰' : '💸'}</div>
      <div class="dt-info">
        <div class="dt-title">${escapeHtml(t.title)}</div>
        <div class="dt-sub">${escapeHtml(t.sub)}</div>
      </div>
      <div class="dt-amt">${t.type === 'income' ? '+' : '−'}${fmtMoney(t.amount)}</div>
    </div>`).join('');
}

// ---- LIST VIEW ----
function renderListView(d, map, keyOf) {
  // List all days with activity in current month, newest last -> show in order
  const year = d.getFullYear(), month = d.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let html = `<div class="card"><h3>🗂 All Transactions — ${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3><div class="day-list">`;
  let any = false;
  for (let day = 1; day <= daysInMonth; day++) {
    const dt = new Date(year, month, day);
    const k = keyOf(dt); const s = map[k];
    if (!s) continue;
    any = true;
    html += `<div class="dl-row" onclick="openDayDetail(${year},${month},${day})" style="cursor:pointer">
      <div class="dl-date">${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
      <div style="flex:1"><span style="color:var(--green);font-weight:700">↑ ${fmtMoneyShort(s.income)}</span> · <span style="color:var(--red);font-weight:700">↓ ${fmtMoneyShort(s.expense)}</span></div>
      <div style="font-weight:800">${fmtMoneyShort(s.income - s.expense)}</div>
      <span class="chip">${s.count}</span>
    </div>`;
  }
  if (!any) html += emptyState('🗂️', 'No transactions this month', 'Tap + Income or + Expense to start');
  html += '</div></div>';
  return html;
}

// ---- Day detail drawer ----
function openDayDetail(y, m, d) {
  dayDetailDate = new Date(y, m, d);
  document.getElementById('ddTitle').textContent = fmtDate(dayDetailDate);
  const txs = dayTxns(dayDetailDate);
  const income = sumBy(txs.filter(t => t.type === 'income'), t => t.amount);
  const expense = sumBy(txs.filter(t => t.type === 'expense'), t => t.amount);
  const net = income - expense;
  const count = txs.length;
  document.getElementById('ddIncome').textContent = fmtMoney(income);
  document.getElementById('ddExpense').textContent = fmtMoney(expense);
  document.getElementById('ddNet').textContent = fmtMoney(net);
  document.getElementById('ddNet').style.color = net >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('ddCount').textContent = count;
  document.getElementById('ddSub').textContent = `${fmtDate(dayDetailDate)} · ${count} transactions · Net ${net >= 0 ? 'Profit' : 'Loss'}`;
  document.getElementById('ddTxns').innerHTML = txs.length
    ? txs.map(t => `
      <div class="dd-txn ${t.type}">
        <div class="dt-ico">${t.type === 'income' ? '💰' : '💸'}</div>
        <div class="dt-info">
          <div class="dt-title">${escapeHtml(t.title)}</div>
          <div class="dt-sub">${escapeHtml(t.sub)}</div>
        </div>
        <div class="dt-amt">${t.type === 'income' ? '+' : '−'}${fmtMoney(t.amount)}</div>
        <button class="dt-del" onclick="deleteTxnFromDay('${t.type}','${t.id}')" title="Delete">🗑</button>
      </div>`).join('')
    : emptyState('🗒️', 'No transactions on this day', 'Tap + ADD INCOME or + ADD EXPENSE');
  document.getElementById('dayDetail').classList.add('open');
}
function closeDayDetail() {
  document.getElementById('dayDetail').classList.remove('open');
}
function dayTxns(dt) {
  const txs = [];
  activeSales().forEach(s => {
    const x = tsToDate(s.date);
    if (x && x.getFullYear() === dt.getFullYear() && x.getMonth() === dt.getMonth() && x.getDate() === dt.getDate()) {
      const items = (s.items || []).map(it => it.product || it.name || '').filter(Boolean).join(', ') || s.category || 'Sale';
      txs.push({ type: 'income', id: s.id, title: items, sub: `${s.transactionId || 'SALE'} · ${s.customerName || 'Walk-in'} · ${s.paymentStatus || 'Unpaid'}`, amount: saleTotal(s), del: 'sale' });
    }
  });
  activeExpenses().forEach(e => {
    const x = tsToDate(e.date);
    if (x && x.getFullYear() === dt.getFullYear() && x.getMonth() === dt.getMonth() && x.getDate() === dt.getDate()) {
      txs.push({ type: 'expense', id: e.id, title: e.description || e.category, sub: `${e.expenseId || 'EXP'} · ${e.category || ''} · ${e.supplierName || '—'}`, amount: Number(e.amount) || 0, del: 'expense' });
    }
  });
  txs.sort((a, b) => tsToDate(a.createdAt) - tsToDate(b.createdAt));
  return txs;
}
async function deleteTxnFromDay(type, id) {
  if (!guardWrite()) return;
  if (type === 'sale') deleteSale(id);
  else deleteExpense(id);
}
