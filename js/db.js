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

// Firestore doc ref that will hold a new record — returns {ref, id} using a
// client-generated unique id (no write needed to reserve it).
function newDocRef(collection) {
  const ref = db.collection(collection).doc();
  return { ref, id: ref.id };
}

async function fsGet(collection, id) {
  const snap = await db.collection(collection).doc(id).get();
  return snap.exists ? snap.data() : null;
}

async function fsSet(collection, id, data, merge = false) {
  const doc = db.collection(collection).doc(id);
  if (merge) { await doc.set(data, { merge: true }); }
  else { await doc.set(data); }
  return id;
}

async function fsUpdate(collection, id, data) {
  await db.collection(collection).doc(id).update(data);
}

async function fsDelete(collection, id) {
  await db.collection(collection).doc(id).delete();
}

// Real-time subscription helper: returns unsubscribe fn
function onColl(collection, cb, errCb) {
  return db.collection(collection)
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      const items = [];
      snap.forEach(d => items.push({ id: d.id, ...d.data() }));
      cb(items);
    }, err => { console.error('snapshot error', collection, err); if (errCb) errCb(err); });
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
