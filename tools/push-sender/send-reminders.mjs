import admin from 'firebase-admin';
import webpush from 'web-push';
import crypto from 'crypto';
import { setTimeout as sleep } from 'timers/promises';

const {
  FIREBASE_DATABASE_URL,
  GOOGLE_APPLICATION_CREDENTIALS,
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  PUSH_APP_URL,
  PUSH_TARGET_USER,
  TRIGGER_WINDOW_MS,
  DRY_RUN,
  LOOP_SECONDS
} = process.env;

if (!FIREBASE_DATABASE_URL) throw new Error('Missing env FIREBASE_DATABASE_URL');
if (!GOOGLE_APPLICATION_CREDENTIALS) throw new Error('Missing env GOOGLE_APPLICATION_CREDENTIALS');
if (!VAPID_SUBJECT) throw new Error('Missing env VAPID_SUBJECT');
if (!VAPID_PUBLIC_KEY) throw new Error('Missing env VAPID_PUBLIC_KEY');
if (!VAPID_PRIVATE_KEY) throw new Error('Missing env VAPID_PRIVATE_KEY');

function normalizeAppUrl(input) {
  const u = new URL(input || 'http://localhost/');
  u.hash = '';
  u.search = '';
  if (!u.pathname.endsWith('/')) u.pathname = `${u.pathname}/`;
  return u;
}

const APP_URL = normalizeAppUrl(PUSH_APP_URL);
const WINDOW_MS = Number.parseInt(TRIGGER_WINDOW_MS || '90000', 10); // default: 90s late-allowed window
const isDryRun = String(DRY_RUN || '').toLowerCase() === 'true';

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: FIREBASE_DATABASE_URL
});

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const db = admin.database();

function isValidSubscription(sub) {
  return sub && typeof sub.endpoint === 'string' && sub.keys && sub.keys.p256dh && sub.keys.auth;
}

function hashKey(input) {
  return crypto.createHash('sha256').update(String(input || '')).digest('base64url');
}

function parseIsoMillis(iso) {
  const t = Date.parse(String(iso || ''));
  return Number.isFinite(t) ? t : null;
}

function formatReminderOffset(minutes) {
  const m = Number(minutes) || 0;
  if (m >= 10080) {
    const weeks = Math.round(m / 10080);
    return weeks === 1 ? '1 week' : `${weeks} weeks`;
  }
  if (m >= 1440) {
    const days = Math.round(m / 1440);
    return days === 1 ? '1 day' : `${days} days`;
  }
  if (m >= 60) {
    const hours = Math.round(m / 60);
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  return m === 1 ? '1 minute' : `${m} minutes`;
}

async function claimOnce(path) {
  const ref = db.ref(path);
  const res = await ref.transaction((cur) => {
    if (cur) return; // already claimed
    return { status: 'sending', ts: Date.now() };
  });
  return { committed: !!res.committed, ref };
}

async function markSent(ref, extra = {}) {
  await ref.set({ status: 'sent', ts: Date.now(), ...extra });
}

async function markFailed(ref, extra = {}) {
  await ref.set({ status: 'failed', ts: Date.now(), ...extra });
}

function buildUrl(pathname = '/', params = {}) {
  const rawPath = String(pathname || '.');
  const relPath = rawPath === '/' ? '.' : rawPath.replace(/^\/+/, '') || '.';
  const u = new URL(relPath, APP_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') continue;
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

async function sendToSubscription({ userId, subKey, subscription, payload, dedupeKey }) {
  const sentHash = hashKey(dedupeKey);
  const sentPath = `users/${userId}/pushSent/${subKey}/${sentHash}`;

  const { committed, ref } = await claimOnce(sentPath);
  if (!committed) return { skipped: true };

  if (isDryRun) {
    await markSent(ref, { dryRun: true, dedupeKey });
    return { ok: true, dryRun: true };
  }

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    await markSent(ref, { dedupeKey });
    return { ok: true };
  } catch (err) {
    const statusCode = err?.statusCode;
    const message = err?.message || String(err);
    await markFailed(ref, { statusCode: statusCode || null, message, dedupeKey });

    // Cleanup expired subscriptions (410 Gone / 404 Not Found)
    if (statusCode === 410 || statusCode === 404) {
      await db.ref(`users/${userId}/pushSubscriptions/${subKey}`).remove().catch(() => {});
    }
    return { ok: false, statusCode, message };
  }
}

function shouldTrigger(nowMs, targetMs, reminderMinutes) {
  const rem = Number.parseInt(reminderMinutes || '0', 10) || 0;
  if (!rem) return false;
  if (!Number.isFinite(targetMs)) return false;
  const triggerAt = targetMs - rem * 60000;
  return nowMs >= triggerAt && nowMs < triggerAt + WINDOW_MS;
}

async function loadUsersWithSubscriptions() {
  const snap = await db.ref('users').once('value');
  const users = snap.val() || {};
  const out = [];
  for (const [userId, userData] of Object.entries(users)) {
    if (PUSH_TARGET_USER && userId !== PUSH_TARGET_USER) continue;
    const pushSubs = userData?.pushSubscriptions || {};
    const subs = [];
    for (const [subKey, entry] of Object.entries(pushSubs)) {
      const sub = entry?.sub;
      if (isValidSubscription(sub)) subs.push({ subKey, sub });
    }
    if (subs.length === 0) continue;
    out.push({ userId, subs });
  }
  return out;
}

async function loadTasksForUser(userId) {
  const snap = await db.ref(`users/${userId}/tasks`).once('value');
  const data = snap.val() || {};
  return Object.entries(data).map(([id, t]) => ({ id, ...(t || {}) }));
}

async function loadSharedSubjects() {
  const snap = await db.ref('sharedSubjects').once('value');
  const data = snap.val() || {};
  return Object.entries(data).map(([id, s]) => ({ id, ...(s || {}) }));
}

async function loadSharedEvents() {
  const snap = await db.ref('events').once('value');
  const data = snap.val() || {};
  return Object.entries(data).map(([id, e]) => ({ id, ...(e || {}) }));
}

async function runCheck() {
  const nowMs = Date.now();
  console.log(`[${new Date(nowMs).toISOString()}] Checking...`);

  const users = await loadUsersWithSubscriptions();
  const sharedEvents = await loadSharedEvents();
  const sharedSubjects = await loadSharedSubjects();

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  // Shared events -> all users/subscriptions
  for (const evt of sharedEvents) {
    const reminderMinutes = Number.parseInt(evt.reminder || '0', 10) || 0;
    const eventTimeMs = parseIsoMillis(evt.date);
    if (!shouldTrigger(nowMs, eventTimeMs, reminderMinutes)) continue;

    const offset = formatReminderOffset(reminderMinutes);
    const payload = {
      title: 'Event Reminder ⏰',
      body: `${evt.name || 'Event'} starts in ${offset}`,
      tag: `event-${evt.id}`,
      url: buildUrl('/', {}),
      requireInteraction: true,
      renotify: true,
      actions: [{ action: 'view', title: 'View' }]
    };

    const dedupeKey = `event|${evt.id}|${evt.date}|${reminderMinutes}`;
    await Promise.allSettled(users.flatMap(({ userId, subs }) =>
      subs.map(({ subKey, sub }) =>
        sendToSubscription({ userId, subKey, subscription: sub, payload, dedupeKey })
      )
    )).then((results) => {
      for (const r of results) {
        const v = r.status === 'fulfilled' ? r.value : null;
        if (!v) { failed += 1; continue; }
        if (v.skipped) skipped += 1;
        else if (v.ok) sent += 1;
        else failed += 1;
      }
    });
  }

  // Per-user tasks -> user subscriptions only
  for (const { userId, subs } of users) {
    const tasks = await loadTasksForUser(userId);
    for (const task of tasks) {
      if (task.completed) continue;
      const reminderMinutes = Number.parseInt(task.reminder || '0', 10) || 0;
      const dueMs = parseIsoMillis(task.dueDate);
      if (!shouldTrigger(nowMs, dueMs, reminderMinutes)) continue;

      const offset = formatReminderOffset(reminderMinutes);
      const dueStr = task.dueDate ? new Date(dueMs).toLocaleString() : '';
      const payload = {
        title: `Task Reminder 📋`,
        body: `${task.title || 'Task'} is due in ${offset}${dueStr ? ` (due: ${dueStr})` : ''}`,
        tag: `task-${task.id}`,
        url: buildUrl('/', {}),
        completeUrl: buildUrl('/', { completeTask: task.id, user: userId }),
        requireInteraction: true,
        renotify: true,
        actions: [
          { action: 'view', title: 'View' },
          { action: 'complete', title: 'Done' }
        ]
      };

      const dedupeKey = `task|${userId}|${task.id}|${task.dueDate}|${reminderMinutes}`;
      const results = await Promise.allSettled(
        subs.map(({ subKey, sub }) =>
          sendToSubscription({ userId, subKey, subscription: sub, payload, dedupeKey })
        )
      );

      for (const r of results) {
        const v = r.status === 'fulfilled' ? r.value : null;
        if (!v) { failed += 1; continue; }
        if (v.skipped) skipped += 1;
        else if (v.ok) sent += 1;
        else failed += 1;
      }
    }
  }

  // Shared subject tasks -> send to owner and all shared users
  for (const subject of sharedSubjects) {
    const subjectTasks = subject.tasks || {};
    const owner = subject.owner;
    const members = subject.members || {};
    const allUsers = [owner, ...Object.keys(members)].filter(Boolean);
    
    for (const [taskId, task] of Object.entries(subjectTasks)) {
      if (!task || task.completed) continue;
      const reminderMinutes = Number.parseInt(task.reminder || '0', 10) || 0;
      const dueMs = parseIsoMillis(task.dueDate);
      if (!shouldTrigger(nowMs, dueMs, reminderMinutes)) continue;

      const offset = formatReminderOffset(reminderMinutes);
      const dueStr = task.dueDate ? new Date(dueMs).toLocaleString() : '';
      
      // Send to each user who has access to this shared subject
      for (const userId of allUsers) {
        const userEntry = users.find(u => u.userId === userId);
        if (!userEntry) continue;
        
        const payload = {
          title: `Shared Task Reminder 📋`,
          body: `${task.title || 'Task'} is due in ${offset}${dueStr ? ` (due: ${dueStr})` : ''}`,
          tag: `shared-task-${taskId}`,
          url: buildUrl('/', {}),
          completeUrl: buildUrl('/', { completeTask: taskId, user: userId, sharedSubject: subject.id }),
          requireInteraction: true,
          renotify: true,
          actions: [
            { action: 'view', title: 'View' },
            { action: 'complete', title: 'Done' }
          ]
        };

        const dedupeKey = `shared-task|${subject.id}|${taskId}|${task.dueDate}|${reminderMinutes}`;
        const results = await Promise.allSettled(
          userEntry.subs.map(({ subKey, sub }) =>
            sendToSubscription({ userId, subKey, subscription: sub, payload, dedupeKey })
          )
        );

        for (const r of results) {
          const v = r.status === 'fulfilled' ? r.value : null;
          if (!v) { failed += 1; continue; }
          if (v.skipped) skipped += 1;
          else if (v.ok) sent += 1;
          else failed += 1;
        }
      }
    }
  }

  console.log(`[${new Date().toISOString()}] Result: Sent ${sent}, Skipped ${skipped}, Failed ${failed}`);
}

async function main() {
  const loopSeconds = Number(LOOP_SECONDS) || 0;
  
  if (loopSeconds > 0) {
    const start = Date.now();
    const end = start + (loopSeconds * 1000);
    console.log(`Starting loop for ${loopSeconds} seconds...`);
    
    while (Date.now() < end) {
      try {
        await runCheck();
      } catch (e) {
        console.error('Error in runCheck:', e);
      }
      
      if (Date.now() + 30000 < end) {
        await sleep(30000); // Wait 30s before next check
      } else {
        break;
      }
    }
  } else {
    await runCheck();
  }

  // Cleanup
  try {
    if (typeof db.goOffline === 'function') db.goOffline();
  } catch {}
  try {
    await admin.app().delete();
  } catch {}
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
