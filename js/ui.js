// ============================================================
// UI HELPERS — formatting, modal, toast, shared render utils
// ============================================================
const _fmtCache = new Map();

// Format money: ₱1,250.00
function fmtMoney(n) {
  const v = Number(n) || 0;
  const s = currencySymbol();
  return s + v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtMoneyShort(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1000000) return currencySymbol() + (v / 1000000).toFixed(2) + 'M';
  if (Math.abs(v) >= 1000) return currencySymbol() + (v / 1000).toFixed(1) + 'k';
  return currencySymbol() + v.toFixed(0);
}
function fmtDate(d) {
  if (!d) return '—';
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt)) return '—';
  return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
function fmtDateShort(d) {
  if (!d) return '—';
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt)) return '—';
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtDateTime(d) {
  if (!d) return '—';
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt)) return '—';
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
         dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function fmtNum(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
function dateInputVal(d) {
  if (!d) return '';
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt)) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseDateInput(v) {
  if (!v) return null;
  const parts = v.split('-');
  if (parts.length !== 3) return null;
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
}
// Firestore Timestamp -> Date (safe)
function tsToDate(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (ts.toDate) return ts.toDate();
  if (typeof ts === 'string' || typeof ts === 'number') return new Date(ts);
  if (ts.seconds) return new Date(ts.seconds * 1000);
  return null;
}
function tsToInput(ts) {
  return dateInputVal(tsToDate(ts));
}

// ---- Date ranges ----
function getRange(period) {
  const now = new Date();
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOfDay(now);
  const endOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
  const startOfWeek = d => { const day = (d.getDay() + 6) % 7; return addDays(startOfDay(d), -day); }; // Monday
  const startOfMonth = d => new Date(d.getFullYear(), d.getMonth(), 1);
  const startOfQuarter = d => new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
  const startOfYear = d => new Date(d.getFullYear(), 0, 1);
  const lastDayOfMonth = d => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

  let from, to;
  switch (period) {
    case 'today': from = startOfDay(now); to = endOfDay(now); break;
    case 'yesterday': from = addDays(today, -1); to = endOfDay(addDays(today, -1)); break;
    case 'week': from = startOfWeek(now); to = endOfDay(now); break;
    case 'lastweek': from = addDays(startOfWeek(now), -7); to = endOfDay(addDays(startOfWeek(now), -1)); break;
    case 'month': from = startOfMonth(now); to = endOfDay(now); break;
    case 'lastmonth': from = addMonths(startOfMonth(now), -1); to = lastDayOfMonth(addMonths(startOfMonth(now), -1)); break;
    case 'quarter': from = startOfQuarter(now); to = endOfDay(now); break;
    case 'year': from = startOfYear(now); to = endOfDay(now); break;
    case 'custom': break;
    default: from = startOfMonth(now); to = endOfDay(now);
  }
  return { from, to };
}

// ---- Toast ----
function showToast(msg, type = 'info') {
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  const icons = { success: '✅', error: '⚠️', info: 'ℹ️' };
  el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${escapeHtml(msg)}</span>`;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, 2600);
}

// ---- Modal ----
function openModal(title, bodyHTML, footHTML = '') {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHTML;
  document.getElementById('modalFoot').innerHTML = footHTML;
  document.getElementById('modalOverlay').classList.add('show');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
}
function confirmModal(title, message, onYes, yesLabel = 'Confirm', danger = true) {
  openModal(title,
    `<p style="font-size:14px;color:var(--gray-700);line-height:1.5">${escapeHtml(message)}</p>`,
    `<button class="btn btn-gray btn-sm" onclick="closeModal()">Cancel</button>
     <button class="btn ${danger ? 'btn-pink' : 'btn-green'} btn-sm" id="confirmYesBtn">${escapeHtml(yesLabel)}</button>`
  );
  document.getElementById('confirmYesBtn').onclick = () => { closeModal(); onYes(); };
}
function confirmDelete(message, onYes) {
  confirmModal('⚠️ Delete Record', message, onYes, 'Delete', true);
}

// ---- Escape ----
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- Badge helpers ----
function statusBadge(status) {
  const map = {
    'Paid': 'green', 'Partial': 'orange', 'Unpaid': 'red',
    'Quotation': 'gray', 'Pending': 'blue', 'In Production': 'orange',
    'Completed': 'green', 'Delivered': 'blue', 'Cancelled': 'red'
  };
  const cls = map[status] || 'gray';
  return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
}
function paymentBadge(p) {
  return statusBadge(p);
}
function stockBadge(current, min) {
  const c = Number(current) || 0;
  const m = Number(min) || 0;
  if (c <= 0) return '<span class="stock-pill out">● OUT OF STOCK</span>';
  if (c <= m) return '<span class="stock-pill low">● LOW STOCK</span>';
  return '<span class="stock-pill ok">● OK</span>';
}

// ---- Empty state ----
function emptyState(icon, txt, sub = '') {
  return `<div class="empty-state"><div class="es-ico">${icon}</div><div class="es-txt">${escapeHtml(txt)}</div>${sub ? `<div class="es-sub">${escapeHtml(sub)}</div>` : ''}</div>`;
}

// ---- Toggle pagination ----
function makePager(total, page, perPage, cbName) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return '';
  let h = `<div class="flex flex-wrap mt-8" style="justify-content:center;gap:6px">`;
  for (let i = 1; i <= pages; i++) {
    const active = i === page ? 'style="background:var(--yellow);border-color:var(--yellow)"' : '';
    h += `<button class="btn btn-outline btn-sm" ${active} onclick="${cbName}(${i})">${i}</button>`;
  }
  h += `</div>`;
  return h;
}
