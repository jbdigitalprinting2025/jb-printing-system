/**
 * JB Digital Printing — Cloud Functions (Admin SDK)
 *
 * Server-side pieces that CANNOT run in the browser:
 *  1. scheduledRetention — daily 2:00 AM Asia/Manila; PERMANENTLY DELETES
 *     historical transaction data older than the retention period (default 12
 *     months). Idempotent, per-collection failure handling, logs every run.
 *  2. removeUser (callable) — admin removes a user: deletes the Firebase Auth
 *     account (real revocation) and marks users/{uid} removed.
 *  3. restoreBackup (callable) — admin full restore via Admin SDK: can replace
 *     immutable collections (inventory_transactions) that the browser cannot.
 *
 * NOTE: scheduled functions require the Firebase Blaze (pay-as-you-go) plan.
 * Deployment: firebase deploy --only functions
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const TZ = 'Asia/Manila';

// ---- shared helpers ----
function daysAgoStartOfDay(days, tz) {
  // Current date in the given timezone, minus N days, at 00:00 local.
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [y, m, d] = parts.split('-').map(Number);
  const cutoff = new Date(Date.UTC(y, m - 1, d - days));
  return cutoff;
}
function getRetentionConfig() {
  // Defaults: 12 months, permanent delete, enabled.
  return {
    enabled: true,
    months: 12,
    mode: 'delete',
    deleteProjectHistory: true
  };
}
async function isAdminUser(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    return doc.exists && doc.data().role === 'admin' && doc.data().removed !== true;
  } catch (e) { return false; }
}

// =====================================================================
// 1) SCHEDULED RETENTION — permanent deletion of old transaction data
// =====================================================================
// Runs every day 02:00 Asia/Manila. Deletes ONLY historical transactions:
//   sales, expenses, payments, project_revenue, project_expenses,
//   inventory_transactions, and COMPLETED/DELIVERED projects older than the
//   cutoff. Master data (inventory items, customers, suppliers, users,
//   settings, active projects) is NEVER touched.
// Idempotent: deletes by query on the cutoff; a second run finds nothing.
exports.scheduledRetention = functions.pubsub.schedule('0 2 * * *').timeZone(TZ).onRun(async () => {
  const cfg = getRetentionConfig();
  if (!cfg.enabled || cfg.mode !== 'delete') {
    console.log('retention disabled or not in delete mode — skipping');
    return null;
  }
  const cutoff = daysAgoStartOfDay(cfg.months * 30.4375, TZ); // ~365.25 days
  const log = { ranAt: new Date().toISOString(), cutoff: cutoff.toISOString(), deleted: {} };
  const summary = [];

  const collections = [
    { name: 'sales', field: 'date' },
    { name: 'expenses', field: 'date' },
    { name: 'payments', field: 'date' },
    { name: 'project_revenue', field: 'date' },
    { name: 'project_expenses', field: 'date' },
    { name: 'inventory_transactions', field: 'date' }
  ];

  for (const { name, field } of collections) {
    try {
      let deleted = 0;
      // Loop in batches; movement history can be large.
      for (;;) {
        const snap = await db.collection(name)
          .where(field, '<', cutoff)
          .limit(500)
          .get();
        if (snap.empty) break;
        const batch = db.batch();
        snap.forEach(d => batch.delete(d.ref));
        await batch.commit();
        deleted += snap.size;
        log.deleted[name] = deleted;
      }
      summary.push(`${name}:${deleted}`);
    } catch (e) {
      // One collection failing must not abort the rest — record and continue.
      console.error(`retention ${name} failed`, e);
      summary.push(`${name}:ERROR`);
    }
  }

  // Completed/Delivered projects older than cutoff (project master records).
  try {
    const oldProjs = await db.collection('projects')
      .where('status', 'in', ['Completed', 'Delivered'])
      .limit(1000)
      .get();
    let n = 0;
    const batch = db.batch();
    oldProjs.forEach(p => {
      const d = p.data();
      const ref = d.endDate || d.targetDate || d.createdAt;
      const ts = ref && ref.toDate ? ref.toDate() : ref ? new Date(ref) : null;
      if (ts && ts.getTime() < cutoff.getTime()) {
        batch.delete(p.ref);
        n++;
      }
    });
    if (n > 0) await batch.commit();
    log.deleted.projects = n;
    summary.push(`projects:${n}`);
  } catch (e) {
    console.error('retention projects failed', e);
    summary.push('projects:ERROR');
  }

  // Log the cleanup event (audit-like record, admin-readable).
  try {
    await db.collection('audit_logs').add({
      action: 'retention',
      recordType: 'system',
      recordId: 'scheduled',
      userId: 'system',
      userName: 'Scheduled Cleanup',
      details: { summary: summary.join(', '), cutoff: log.cutoff },
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) { console.error('retention audit log failed', e); }

  console.log('retention run complete', JSON.stringify(log));
  return null;
});

// =====================================================================
// 2) removeUser (callable) — REAL account revocation
// =====================================================================
exports.removeUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  if (!(await isAdminUser(context.auth.uid))) throw new functions.https.HttpsError('permission-denied', 'Admin only.');
  const uid = data && data.uid;
  if (!uid || typeof uid !== 'string') throw new functions.https.HttpsError('invalid-argument', 'uid required.');
  if (uid === context.auth.uid) throw new functions.https.HttpsError('failed-precondition', 'Cannot remove yourself.');

  const results = {};
  // 1) Delete the Firebase Auth account (real revocation — login impossible).
  try {
    await admin.auth().deleteUser(uid);
    results.auth = 'deleted';
  } catch (e) {
    results.auth = 'error:' + (e.message || e.code);
  }
  // 2) Mark the users doc removed (rules already block access either way).
  try {
    await db.collection('users').doc(uid).update({
      removed: true,
      removedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    results.userDoc = 'marked-removed';
  } catch (e) {
    results.userDoc = 'error:' + (e.message || e.code);
  }
  // 3) Audit trail.
  try {
    await db.collection('audit_logs').add({
      action: 'deleted',
      recordType: 'user',
      recordId: uid,
      userId: context.auth.uid,
      userName: 'admin',
      details: { removedBy: context.auth.uid, results },
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) { console.error('removeUser audit failed', e); }
  return results;
});

// =====================================================================
// 3) restoreBackup (callable) — FULL server-side restore
// =====================================================================
// The browser CANNOT replace immutable collections (inventory_transactions).
// This Admin-SDK restore can: it wipes and rewrites every collection in the
// backup, including movement history, with full authorization checks.
exports.restoreBackup = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  if (!(await isAdminUser(context.auth.uid))) throw new functions.https.HttpsError('permission-denied', 'Admin only.');

  let backup = data && data.backup;
  if (typeof backup === 'string') {
    try { backup = JSON.parse(backup); } catch (e) { throw new functions.https.HttpsError('invalid-argument', 'Backup payload is not valid JSON.'); }
  }
  if (!backup || !Array.isArray(backup.sales) || !Array.isArray(backup.expenses)) {
    throw new functions.https.HttpsError('invalid-argument', 'Not a valid backup structure (sales + expenses arrays required).');
  }

  const report = { startedAt: new Date().toISOString(), restored: {}, skipped: [] };
  const stripId = (item) => { const { id, ...rest } = item || {}; return rest; };
  const writeCollection = async (name, list) => {
    if (!Array.isArray(list)) return 0;
    let n = 0;
    for (let i = 0; i < list.length; i += 450) {
      const batch = db.batch();
      list.slice(i, i + 450).forEach(item => {
        const { id, ...rest } = item || {};
        const ref = id ? db.collection(name).doc(String(id)) : db.collection(name).doc();
        batch.set(ref, stripId(rest), { merge: true });
      });
      await batch.commit();
      n += Math.min(450, list.length - i);
    }
    return n;
  };

  // 1) Pre-restore snapshot is handled by the client (download + cloud copy).
  // 2) Wipe ALL replaceable collections (Admin SDK ignores rules).
  const wipe = async (name) => {
    for (;;) {
      const snap = await db.collection(name).limit(500).get();
      if (snap.empty) return;
      const batch = db.batch();
      snap.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  };
  const wipeList = ['sales', 'expenses', 'payments', 'project_revenue', 'project_expenses',
    'inventory', 'inventory_transactions', 'customers', 'suppliers', 'projects'];
  for (const c of wipeList) {
    try { await wipe(c); } catch (e) { report.skipped.push(c + ':wipe-failed'); }
  }

  // 3) Restore in dependency-safe order (masters first).
  const order = [
    ['inventory', 'inventory'],
    ['customers', 'customers'],
    ['suppliers', 'suppliers'],
    ['sales', 'sales'],
    ['expenses', 'expenses'],
    ['payments', 'payments'],
    ['project_revenue', 'project_revenue'],
    ['project_expenses', 'project_expenses'],
    ['projects', 'projects'],
    ['inventory_transactions', 'inventory_transactions']
  ];
  for (const [key, coll] of order) {
    try {
      report.restored[coll] = await writeCollection(coll, backup[key]);
    } catch (e) {
      report.skipped.push(coll + ':' + (e.message || 'error'));
    }
  }
  // 4) Settings (merge). Users/auth are NOT restored (auth accounts cannot be
  //    recreated from Firestore docs).
  try {
    if (backup.settings) await db.collection('settings').doc('main').set(backup.settings, { merge: true });
  } catch (e) { report.skipped.push('settings'); }

  // 5) Verification + audit.
  const verify = {};
  for (const [key, coll] of order) {
    try {
      const snap = await db.collection(coll).limit(100000).get();
      verify[coll] = { restored: report.restored[coll] || 0, found: snap.size };
    } catch (e) { verify[coll] = { error: e.message }; }
  }
  report.verified = verify;
  report.finishedAt = new Date().toISOString();
  try {
    await db.collection('audit_logs').add({
      action: 'restore',
      recordType: 'system',
      recordId: 'server',
      userId: context.auth.uid,
      userName: 'admin',
      details: { report },
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) { console.error('restore audit failed', e); }
  return report;
});
