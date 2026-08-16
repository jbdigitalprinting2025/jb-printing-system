// ============================================================
// DB LAYER — Firebase init, auth, roles, Firestore helpers, audit
// ============================================================
let db, auth;
let currentUser = null;        // firebase user
let currentUserDoc = null;    // {role, name, email}
let appReady = false;

function initFirebase() {
  const app = firebase.initializeApp(FIREBASE_CONFIG);
  auth = firebase.auth();
  db = firebase.firestore();
  db.settings({ ignoreUndefinedProperties: true });
  // Offline persistence: app keeps working with no internet; syncs on reconnect.
  // Fails silently if another tab already owns the cache (still works in-memory).
  try {
    db.enablePersistence({ synchronizeTabs: true }).catch(err => {
      if (err && err.code !== 'failed-precondition') console.warn('persistence disabled', err);
    });
  } catch (e) { console.warn('persistence unavailable', e); }

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      await loadUserDoc();
      if (!appReady) { enterApp(); }
      else { updateTopBar(); }
    } else {
      currentUser = null; currentUserDoc = null;
      showLogin();
    }
  });
}

// ---- Double-submission guard (prevents duplicate transactions) ----
let _busy = false;
function busyStart() {
  if (_busy) { showToast('Please wait — still saving...', 'info'); return false; }
  _busy = true;
  return true;
}
function busyEnd() { _busy = false; }

async function loadUserDoc() {
  try {
    const snap = await db.collection(COLL.users).doc(currentUser.uid).get();
    // Owner emails are ALWAYS admin (safety net)
    const forcedRole = (ADMIN_EMAILS || []).includes((currentUser.email || '').toLowerCase()) ? 'admin' : null;
    if (snap.exists) {
      currentUserDoc = snap.data();
      // Account deactivated by admin — rules already deny all business data;
      // sign out with a clear message so the user isn't left on an empty shell.
      if (currentUserDoc.removed === true) {
        currentUserDoc = null;
        await auth.signOut().catch(() => {});
        if (typeof showToast === 'function') showToast('This account has been deactivated. Contact the administrator.', 'error');
        return;
      }
      if (forcedRole && currentUserDoc.role !== forcedRole) {
        currentUserDoc.role = forcedRole;
        await db.collection(COLL.users).doc(currentUser.uid).update({ role: forcedRole, updatedAt: nowTS() }).catch(() => {});
      }
    } else {
      // First-ever user becomes admin; otherwise viewer by default
      let role = forcedRole || 'viewer';
      if (!forcedRole) {
        try {
          const countSnap = await db.collection(COLL.users).limit(1).get();
          if (countSnap.empty) role = 'admin';
        } catch (e) { /* rules may be locked; keep viewer */ }
      }
      const userData = {
        uid: currentUser.uid,
        email: currentUser.email || '',
        name: (currentUser.displayName || currentUser.email || 'User').split('@')[0],
        role: role,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await db.collection(COLL.users).doc(currentUser.uid).set(userData);
      currentUserDoc = userData;
    }
  } catch (e) {
    console.error('loadUserDoc error', e);
    // Permission denied on create = the rules refuse this account (e.g. it was
    // previously removed and its record no longer exists). Do NOT fall back to
    // viewer with business access — sign out instead.
    if (e && (e.code === 'permission-denied' || /permission|denied/i.test(e.message || ''))) {
      currentUserDoc = null;
      await auth.signOut().catch(() => {});
      if (typeof showToast === 'function') showToast('Account not authorized. Contact the administrator.', 'error');
      return;
    }
    currentUserDoc = { uid: currentUser.uid, email: currentUser.email, name: currentUser.email, role: 'viewer' };
  }
}

// ---- Role helpers ----
function isAdmin() { return currentUserDoc && currentUserDoc.role === 'admin'; }
function canWrite() { return currentUserDoc && (currentUserDoc.role === 'admin' || currentUserDoc.role === 'staff'); }
function canView() { return !!currentUserDoc; }

function guardWrite() {
  if (!canWrite()) { showToast('Viewer account — view only', 'error'); return false; }
  return true;
}
function guardAdmin() {
  if (!isAdmin()) { showToast('Admin access required', 'error'); return false; }
  return true;
}

// ---- Generic Firestore helpers ----
function nowTS() { return firebase.firestore.FieldValue.serverTimestamp(); }
function newId() { return db.collection('_ids').doc().id; }

// ---- Offline guard ----
// With offline persistence enabled, a plain Firestore write gets QUEUED and
// syncs later — the UI would show "failed" while the write secretly succeeds,
// and a retry would then DUPLICATE the record on reconnect. So for critical
// financial writes we check connectivity FIRST and refuse to queue.
let _online = typeof navigator !== 'undefined' ? navigator.onLine : true;
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('online', () => { _online = true; });
  window.addEventListener('offline', () => { _online = false; });
}
function isOffline() { return _online === false; }
function guardOnline() {
  if (isOffline()) {
    showToast('Network connection unavailable. Transaction not saved — reconnect and try again.', 'error');
    return false;
  }
  return true;
}

// Guaranteed-unique business transaction IDs.
// Base = Firestore auto doc id (globally unique, generated client-side without a write).
// Display ID = prefix + date + short slice of the unique doc id (human-readable, still unique).
function genBizId(prefix, date) {
  const uid = newId(); // unique Firestore id (never collides)
  const d = date || new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `${prefix}-${ymd}-${uid.slice(0, 6).toUpperCase()}`;
}
// Ensure a display id is unique against an existing list (belt & suspenders)
function uniqueBizId(prefix, date, existingIds) {
  let id = genBizId(prefix, date);
  let tries = 0;
  while (existingIds && existingIds.includes(id) && tries < 5) { id = genBizId(prefix, date); tries++; }
  return id;
}

// ---- Audit log ----
async function logAudit(action, recordType, recordId, prevValue = null, newValue = null) {
  if (!currentUser) return;
  try {
    await db.collection(COLL.audit).add({
      userId: currentUser.uid,
      userName: currentUserDoc ? (currentUserDoc.name || currentUser.email) : currentUser.email,
      userRole: currentUserDoc ? currentUserDoc.role : 'unknown',
      action: action,             // created | edited | deleted | restock | usage | adjustment | payment | retention | ...
      recordType: recordType,
      recordId: recordId,
      prevValue: prevValue ? JSON.stringify(prevValue) : null,
      newValue: newValue ? JSON.stringify(newValue) : null,
      createdAt: nowTS()
    });
  } catch (e) { console.error('audit error', e); }
}

// ---- Settings ----
let settingsCache = null;
async function getSettings() {
  if (settingsCache) return settingsCache;
  const snap = await db.collection(COLL.settings).doc('main').get();
  settingsCache = snap.exists ? snap.data() : null;
  return settingsCache;
}
async function loadSettings(force = false) {
  if (force) settingsCache = null;
  await getSettings();
}
async function saveSettings(data) {
  const merged = { ...(settingsCache || {}), ...data, updatedAt: nowTS() };
  await db.collection(COLL.settings).doc('main').set(merged, { merge: true });
  settingsCache = merged;
  return merged;
}
function bizName() {
  return (settingsCache && settingsCache.businessName) ? settingsCache.businessName : APP_NAME;
}
function currencySymbol() {
  return (settingsCache && settingsCache.currency) ? settingsCache.currency : DEFAULT_CURRENCY;
}

// ---- Categories (stored per business) ----
async function getCategories() {
  const s = await getSettings();
  return {
    sales: (s && s.saleCategories) || DEFAULT_SALE_CATEGORIES,
    expenses: (s && s.expenseCategories) || DEFAULT_EXPENSE_CATEGORIES
  };
}

// ---- Retention helpers ----
function getRetentionConfig() {
  const s = settingsCache || {};
  return {
    enabled: s.retentionEnabled !== false,
    mode: (s.retentionMode || 'archive'),
    months: parseInt(s.retentionMonths || 12, 10)
  };
}
