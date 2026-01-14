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

function parsePlannerStart(block) {
  if (!block) return null;
  // Fix #7: Prefer ISO8601 startAt if available (includes timezone)
  if (block.startAt) {
    const ts = parseIsoMillis(block.startAt);
    if (Number.isFinite(ts)) return ts;
  }
  if (!block.date || !block.start) return null;
  const parts = String(block.date).split('-').map(Number);
  if (parts.length !== 3) return null;
  const [year, month, day] = parts;
  if (!year || !month || !day) return null;
  const [h, m] = String(block.start).split(':').map(Number);
  if (!Number.isFinite(h)) return null;
  // Use UTC to avoid server timezone interpretation
  // Client stores local time as if it were UTC, so we parse it the same way
  // This isn't perfect but is consistent across server runs
  const dt = new Date(Date.UTC(year, month - 1, day, h, Number.isFinite(m) ? m : 0, 0, 0));
  // Apply common timezone offset for Israel (UTC+2/+3)
  // Better solution: store user's timezone in Firebase
  const israelOffsetMs = 2 * 60 * 60 * 1000; // UTC+2 for standard time
  return Number.isNaN(dt.getTime()) ? null : dt.getTime() - israelOffsetMs;
}

function formatPlannerWhen(startMs) {
  if (!Number.isFinite(startMs)) return '';
  try {
    return new Date(startMs).toLocaleString('he-IL', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return new Date(startMs).toISOString();
  }
}

function isImportedEvent(evt) {
  if (!evt) return false;
  if (evt.externalId) return true;
  return typeof evt.notes === 'string' && evt.notes.includes('[Imported');
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
    // Fix #10: Allow retrying transient failures (status != 'sent')
    if (cur && cur.status === 'sent') return; // already sent successfully
    if (cur && cur.status === 'sending') return; // another process is handling it
    return { status: 'sending', ts: Date.now() };
  });
  return { committed: !!res.committed, ref };
}

async function markSent(ref, extra = {}) {
  await ref.set({ status: 'sent', ts: Date.now(), ...extra });
}

// Fix #10: Mark as transient (retryable) for 5xx errors, failed only for permanent 4xx
async function markFailed(ref, statusCode, extra = {}) {
  const isPermanent = statusCode === 404 || statusCode === 410;
  const status = isPermanent ? 'failed' : 'transient';
  await ref.set({ status, ts: Date.now(), ...extra });
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
    console.log(`[DRY_RUN] Would send to user=${userId} sub=${subKey.slice(0, 8)}...`);
    await markSent(ref, { dryRun: true, dedupeKey });
    return { ok: true, dryRun: true };
  }

  // Retry logic for transient failures
  const MAX_RETRIES = 3;
  const RETRY_STATUS_CODES = [429, 500, 502, 503, 504];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      await markSent(ref, { dedupeKey, attempt });
      if (attempt > 1) {
        console.log(`[push] Success on attempt ${attempt} for user=${userId}`);
      }
      return { ok: true };
    } catch (err) {
      const statusCode = err?.statusCode;
      const message = err?.message || String(err);

      // Check if this is a retryable error
      if (RETRY_STATUS_CODES.includes(statusCode) && attempt < MAX_RETRIES) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
        console.log(`[push] Retry ${attempt}/${MAX_RETRIES} in ${delay}ms for user=${userId} (status=${statusCode})`);
        await sleep(delay);
        continue;
      }

      // Non-retryable or max retries reached
      await markFailed(ref, statusCode || null, { message, dedupeKey, attempts: attempt });
      console.warn(`[push] Failed user=${userId} sub=${subKey.slice(0, 8)}... status=${statusCode || 'unknown'} msg=${message.slice(0, 100)}`);

      // Cleanup expired subscriptions (410 Gone / 404 Not Found)
      if (statusCode === 410 || statusCode === 404) {
        console.log(`[push] Removing expired subscription for user=${userId}`);
        await db.ref(`users/${userId}/pushSubscriptions/${subKey}`).remove().catch(() => { });
      }
      return { ok: false, statusCode, message };
    }
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

async function loadPlannerBlocksForUser(userId) {
  const snap = await db.ref(`users/${userId}/plannerBlocks`).once('value');
  const data = snap.val();
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  return [];
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
    if (isImportedEvent(evt) && !evt.reminderUserSet) continue;
    const reminderMinutes = Number.parseInt(evt.reminder || '0', 10) || 0;
    const eventTimeMs = parseIsoMillis(evt.date);
    if (!shouldTrigger(nowMs, eventTimeMs, reminderMinutes)) continue;

    const offset = formatReminderOffset(reminderMinutes);
    const dedupeKey = `event|${evt.id}|${evt.date}|${reminderMinutes}`;
    const payload = {
      title: 'Event Reminder ⏰',
      body: `${evt.name || 'Event'} starts in ${offset}`,
      tag: `event-${evt.id}`,
      dedupeKey,
      url: buildUrl('/', {}),
      requireInteraction: true,
      renotify: true,
      actions: [{ action: 'view', title: 'View' }]
    };

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
      const dedupeKey = `task|${userId}|${task.id}|${task.dueDate}|${reminderMinutes}`;
      const payload = {
        title: `Task Reminder 📋`,
        body: `${task.title || 'Task'} is due in ${offset}${dueStr ? ` (due: ${dueStr})` : ''}`,
        tag: `task-${task.id}`,
        dedupeKey,
        url: buildUrl('/', {}),
        completeUrl: buildUrl('/', { completeTask: task.id, user: userId }),
        requireInteraction: true,
        renotify: true,
        actions: [
          { action: 'view', title: 'View' },
          { action: 'complete', title: 'Done' }
        ]
      };

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

  // Per-user planner blocks -> user subscriptions only
  for (const { userId, subs } of users) {
    const blocks = await loadPlannerBlocksForUser(userId);
    for (const block of blocks) {
      if (!block || block.completed) continue;
      const reminderMinutes = Number.parseInt(block.reminder || '0', 10) || 0;
      if (!reminderMinutes) continue;
      const startMs = parsePlannerStart(block);
      if (!shouldTrigger(nowMs, startMs, reminderMinutes)) continue;

      const blockKey = block.id || hashKey(`${block.title || ''}|${block.date || ''}|${block.start || ''}`);
      const whenStr = formatPlannerWhen(startMs);
      // Fix #12: Consistent English title like other notifications
      const title = 'Planner Reminder 📅';
      const body = whenStr
        ? `${block.title || 'פעילות'} • ${whenStr}`
        : `${block.title || 'פעילות'} מתחיל בקרוב`;
      const dedupeKey = `planner|${userId}|${blockKey}|${block.startAt || block.date || ''}|${block.start || ''}|${reminderMinutes}`;
      const payload = {
        title,
        body,
        tag: `planner-${blockKey}`,
        dedupeKey,
        url: buildUrl('/', {}),
        requireInteraction: true,
        renotify: true,
        actions: [{ action: 'view', title: 'View' }]
      };

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

        const dedupeKey = `shared-task|${userId}|${subject.id}|${taskId}|${task.dueDate}|${reminderMinutes}`;
        const payload = {
          title: `Shared Task Reminder 📋`,
          body: `${task.title || 'Task'} is due in ${offset}${dueStr ? ` (due: ${dueStr})` : ''}`,
          tag: `shared-task-${taskId}`,
          dedupeKey,
          url: buildUrl('/', {}),
          completeUrl: buildUrl('/', { completeTask: taskId, user: userId, sharedSubject: subject.id }),
          requireInteraction: true,
          renotify: true,
          actions: [
            { action: 'view', title: 'View' },
            { action: 'complete', title: 'Done' }
          ]
        };
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

async function cleanupOldPushSent() {
  // Clean up pushSent records older than 7 days to prevent database bloat
  const CLEANUP_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  const cutoffTs = Date.now() - CLEANUP_AGE_MS;

  try {
    const usersSnap = await db.ref('users').once('value');
    const users = usersSnap.val() || {};
    let cleaned = 0;

    for (const [userId, userData] of Object.entries(users)) {
      const pushSent = userData?.pushSent || {};
      for (const [subKey, records] of Object.entries(pushSent)) {
        for (const [recordKey, record] of Object.entries(records || {})) {
          if (record?.ts && record.ts < cutoffTs) {
            await db.ref(`users/${userId}/pushSent/${subKey}/${recordKey}`).remove().catch(() => { });
            cleaned++;
          }
        }
      }
    }

    if (cleaned > 0) {
      console.log(`[cleanup] Removed ${cleaned} old pushSent records`);
    }
  } catch (e) {
    console.warn('[cleanup] Error cleaning pushSent:', e.message);
  }
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
        await sleep(15000); // Wait 15s before next check for better precision
      } else {
        break;
      }
    }
  } else {
    await runCheck();
  }

  // Cleanup old pushSent records (run occasionally to prevent DB bloat)
  try {
    await cleanupOldPushSent();
  } catch (e) {
    console.warn('Cleanup error:', e);
  }

  // Cleanup Firebase connection
  try {
    if (typeof db.goOffline === 'function') db.goOffline();
  } catch { }
  try {
    await admin.app().delete();
  } catch { }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
