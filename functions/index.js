/**
 * JB Digital Printing — Scheduled Data Retention Cleanup
 * ======================================================
 * WHY THIS EXISTS
 * The in-app retention check only runs while an admin's browser is open.
 * For TRUE automatic cleanup, a server-side job must run even when no one
 * is logged in. This Cloud Function runs daily (Asia/Manila 02:00) and
 * archives or deletes records older than the configured retention period,
 * using the SAME policy as the app (Settings → Data Retention).
 *
 * REQUIREMENTS TO DEPLOY (one time, needs the paid Firebase Blaze plan):
 *   1. npm install -g firebase-tools        (or npx firebase-tools)
 *   2. firebase login
 *   3. firebase use jb-digitalprinting
 *   4. firebase deploy --only functions
 *   5. In Firebase Console → Functions, the schedule appears automatically:
 *      "retentionCleanup" every day 02:00 Asia/Manila.
 * If you do NOT deploy this, the app still cleans up whenever an admin
 * signs in (Settings → Data Retention → Run Cleanup Now), but cleanup will
 * NOT happen on days nobody opens the app.
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const MONTHS = ['sales', 'expenses', 'payments', 'inventory_transactions', 'project_revenue', 'project_expenses'];
// Project master records: only completed/delivered projects are retention candidates.
const PROJECT_STATUSES_ELIGIBLE = ['Completed', 'Delivered'];

function tsOf(doc, field) {
  const v = doc.get(field) || doc.get('createdAt');
  if (!v) return null;
  if (v instanceof admin.firestore.Timestamp) return v.toDate();
  if (typeof v === 'string' || typeof v === 'number') return new Date(v);
  return null;
}

async function processCollection(coll, cutoff, mode) {
  let processed = 0;
  // Stream in pages; Firestore limits per query, so loop with pagination.
  let last = null;
  for (let page = 0; page < 200; page++) {
    let q = db.collection(coll).where('archived', '==', false).limit(400);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    const batch = db.batch();
    let used = 0;
    snap.forEach(doc => {
      const d = tsOf(doc, 'date');
      if (d && d.getTime() < cutoff.getTime()) {
        if (mode === 'delete') batch.delete(doc.ref);
        else batch.update(doc.ref, { archived: true, archivedAt: admin.firestore.FieldValue.serverTimestamp() });
        used++; processed++;
      }
      last = doc;
    });
    if (used > 0) await batch.commit();
    if (snap.size < 400) break;
  }
  return processed;
}

exports.retentionCleanup = functions.pubsub
  .schedule('0 2 * * *')
  .timeZone('Asia/Manila')
  .onRun(async () => {
    const settingsSnap = await db.collection('settings').doc('main').get().catch(() => null);
    const s = settingsSnap && settingsSnap.exists ? settingsSnap.data() : {};
    if (s.retentionEnabled === false || s.retentionMode === 'disabled') {
      console.log('Retention disabled — nothing to do.');
      return null;
    }
    const mode = s.retentionMode === 'delete' ? 'delete' : 'archive';
    const months = parseInt(s.retentionMonths || 12, 10);
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    cutoff.setHours(0, 0, 0, 0);

    const report = {};
    for (const coll of MONTHS) {
      try { report[coll] = await processCollection(coll, cutoff, mode); }
      catch (e) { console.error('retention error on', coll, e.message); report[coll] = -1; }
    }
    // Completed/delivered projects
    try {
      let processed = 0;
      const projSnap = await db.collection('projects').where('archived', '==', false).limit(400).get();
      const batch = db.batch();
      projSnap.forEach(doc => {
        const status = doc.get('status');
        if (!PROJECT_STATUSES_ELIGIBLE.includes(status)) return;
        const d = tsOf(doc, 'endDate') || tsOf(doc, 'targetDate') || tsOf(doc, 'createdAt');
        if (d && d.getTime() < cutoff.getTime()) {
          if (mode === 'delete') batch.delete(doc.ref);
          else batch.update(doc.ref, { archived: true, archivedAt: admin.firestore.FieldValue.serverTimestamp() });
          processed++;
        }
      });
      if (processed > 0) await batch.commit();
      report.projects = processed;
    } catch (e) { console.error('retention error on projects', e.message); report.projects = -1; }

    // Audit trail of the cleanup (append-only)
    const total = Object.values(report).reduce((a, b) => a + (b > 0 ? b : 0), 0);
    await db.collection('audit_logs').add({
      userId: 'system', userName: 'Scheduled Cleanup', userRole: 'system',
      action: 'retention', recordType: 'bulk', recordId: 'scheduled',
      prevValue: null, newValue: JSON.stringify({ mode, months, cutoff: cutoff.toISOString(), report }),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});
    console.log('Retention cleanup done', JSON.stringify(report));
    return null;
  });
