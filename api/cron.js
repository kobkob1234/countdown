/**
 * Web Push Notification Cron Handler for Vercel Serverless
 * 
 * This is a synced version of tools/push-sender/send-reminders.mjs
 * Runs once per invocation (triggered by cron-job.org every minute)
 */
/**
 * Push Notification Reminder Sender
 * 
 * TIMEZONE LIMITATION:
 * This script uses a hardcoded Israel timezone offset (UTC+2) for planner blocks.
 * Events and tasks with explicit datetime are processed in UTC as stored.
 * To support multiple timezones, user timezone would need to be stored in Firebase.
 */
const admin = require('firebase-admin');
const webpush = require('web-push');
const crypto = require('crypto');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL || 'https://countdown-463de-default-rtdb.firebaseio.com';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:kobeamit1@gmail.com';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BL-m24SrurFUNIQxH7S77r1yYShIiCibpw2CbtK8FwYATHzYiR0kQGKzWilEGRHyRK2jxqRPUR_RJoAVUgrO-24';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const PUSH_APP_URL = process.env.APP_URL || 'https://kobkob1234.github.io/countdown/';
const TRIGGER_WINDOW_MS = process.env.TRIGGER_WINDOW_MS;
const DRY_RUN = process.env.DRY_RUN;

// Optional: URL of the remind-again API endpoint (hosted on Vercel).
// Set REMIND_AGAIN_API_URL GitHub secret to enable the "Remind me in 10 min" button.
const REMIND_AGAIN_API_URL = (process.env.REMIND_AGAIN_API_URL || '').trim();
const REMIND_AGAIN_DELAY_MINUTES = Number.parseInt(process.env.REMIND_AGAIN_DELAY_MINUTES || '10', 10) || 10;
const REMIND_AGAIN_TOKEN_TTL_MS = 30 * 60 * 1000;        // 30 min (token lifetime)
const REMIND_AGAIN_QUEUE_TTL_MS = 24 * 60 * 60 * 1000;   // 24 h  (queue item lifetime)
const REMIND_AGAIN_SENDING_STALE_MS = 3 * 60 * 1000;     // 3 min (recover orphaned 'sending' items)

if (!VAPID_PRIVATE_KEY) {
  console.warn('[VAPID] No private key configured - cannot send');
}

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

let db;
function ensureInit() {
  if (!admin.apps.length) {
    const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT || '{}';
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountStr);
    } catch (e) {
      throw new Error('Failed to parse FIREBASE_SERVICE_ACCOUNT: ' + e.message);
    }
    
    if (Object.keys(serviceAccount).length === 0) {
      // Fallback to applicationDefault if no service account is provided
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: FIREBASE_DATABASE_URL
      });
    } else {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: FIREBASE_DATABASE_URL
      });
    }
  }
  if (!db) db = admin.database();

  if (VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  }
}

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

// Helper to get offset for a specific date in a specific timezone
function getZoneOffsetMs(dateObj, timeZone = 'Asia/Jerusalem') {
  try {
    const str = dateObj.toLocaleString('en-US', { timeZone, timeZoneName: 'longOffset' });
    const match = str.match(/GMT([+-]\d+)(?::(\d+))?/);
    if (!match) return 0;
    const hours = Number(match[1]);
    const minutes = Number(match[2] || 0);
    return (hours * 60 + (hours < 0 ? -minutes : minutes)) * 60 * 1000;
  } catch (e) {
    // DST-aware fallback for Israel: UTC+2 in winter, UTC+3 in summer
    // Israel DST roughly runs from last Friday of March to last Sunday of October
    const month = dateObj.getMonth(); // 0-indexed
    const isLikelySummer = month >= 3 && month <= 9; // April (3) through October (9)
    return isLikelySummer ? 3 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;
  }
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

  // We interpret the planner date/time to be in Israel Time (Wall Time).
  // First, construct a UTC date with these exact components.
  const wallDate = new Date(Date.UTC(year, month - 1, day, h, Number.isFinite(m) ? m : 0, 0, 0));

  // Find the offset of this time in Israel
  const israelOffsetMs = getZoneOffsetMs(wallDate);

  // Subtract offset to get the actual UTC timestamp
  return Number.isNaN(wallDate.getTime()) ? null : wallDate.getTime() - israelOffsetMs;
}

function formatPlannerWhen(startMs) {
  if (!Number.isFinite(startMs)) return '';
  try {
    return new Date(startMs).toLocaleString('he-IL', {
      timeZone: 'Asia/Jerusalem',
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

function normalizeTaskReminders(reminders, legacyReminder = null) {
  const MAX_REMINDERS = 3;
  const MAX_MINUTES = 10080;
  const source = [];
  if (Array.isArray(reminders)) source.push(...reminders);
  if (legacyReminder !== null && legacyReminder !== undefined && legacyReminder !== '') source.push(legacyReminder);

  const unique = [];
  source.forEach((value) => {
    const minutes = Number.parseInt(value, 10);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > MAX_MINUTES) return;
    if (!unique.includes(minutes)) unique.push(minutes);
  });

  unique.sort((a, b) => a - b);
  return unique.slice(0, MAX_REMINDERS);
}

async function claimOnce(path) {
  const ref = db.ref(path);
  const now = Date.now();
  const SENDING_STALE_MS = 5 * 60 * 1000; // 5 minutes - allow takeover of stale claims
  // Unique run ID to verify we own the claim after transaction
  const runId = `${process.pid}-${now}-${Math.random().toString(36).slice(2, 8)}`;

  const res = await ref.transaction((cur) => {
    // Already sent successfully - skip
    if (cur && cur.status === 'sent') return undefined;

    // Already failed permanently - skip
    if (cur && cur.status === 'failed') return undefined;

    // Another process claimed it - check if stale
    if (cur && cur.status === 'sending') {
      const ts = Number(cur.ts) || 0;
      // If claim is recent, don't take over
      if (ts && (now - ts) < SENDING_STALE_MS) return undefined;
      // Otherwise, take over the stale claim (log it)
      console.log(`[push] Taking over stale claim at ${path} (age: ${Math.round((now - ts) / 1000)}s)`);
    }

    return { status: 'sending', ts: now, runId };
  });

  // Verify we actually own the claim (prevents race where two instances both "committed")
  if (res.committed) {
    const snap = await ref.once('value');
    const val = snap.val();
    if (!val || val.runId !== runId) {
      // Another process won the race
      return { committed: false, ref };
    }
  }

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

// ============================================
// Remind-Again helpers
// ============================================

/**
 * Write a one-time token to Firebase and return the raw token string.
 * Returns null if REMIND_AGAIN_API_URL is not configured.
 */
async function issueRemindAgainToken(userId, context = {}) {
  if (!userId || !REMIND_AGAIN_API_URL) return null;
  const token = crypto.randomBytes(24).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(`remind-again:${token}`).digest('base64url');
  const now = Date.now();
  await db.ref(`users/${userId}/remindAgainTokens/${tokenHash}`).set({
    status: 'pending',
    userId,
    createdAt: now,
    expiresAt: now + REMIND_AGAIN_TOKEN_TTL_MS,
    ...context
  });
  return token;
}

/** Build notification action list, optionally including the snooze button. */
function buildTaskActions(includeRemindAgain) {
  const actions = [{ action: 'view', title: 'View' }];
  if (includeRemindAgain) {
    actions.push({ action: 'remind-again-10', title: 'Remind me again in 10 minutes' });
  }
  actions.push({ action: 'complete', title: 'Done' });
  return actions;
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

async function sendToSubscription({ userId, subKey, subscription, payload, dedupeKey, skipGlobalClaim = false }) {
  // Use per-user claim (not per-subscription) to prevent duplicate notifications
  // across multiple devices for the same reminder
  const sentHash = hashKey(dedupeKey);
  const userSentPath = `users/${userId}/pushSentGlobal/${sentHash}`;
  const perSubPath = `users/${userId}/pushSent/${subKey}/${sentHash}`;

  let globalRef = null;
  if (!skipGlobalClaim) {
    const { committed: globalClaimed, ref: gRef } = await claimOnce(userSentPath);
    if (!globalClaimed) return { skipped: true };
    globalRef = gRef;
  } else {
    globalRef = db.ref(userSentPath);
  }

  // Also claim per-subscription path for backward compat / cleanup
  const { committed, ref } = await claimOnce(perSubPath);
  if (!committed) {
    // Per-sub already sent — mark global as sent too
    if (!skipGlobalClaim) await markSent(globalRef, { dedupeKey, subKey });
    return { skipped: true };
  }

  if (isDryRun) {
    console.log(`[DRY_RUN] Would send to user=${userId} sub=${subKey.slice(0, 8)}...`);
    await markSent(ref, { dryRun: true, dedupeKey });
    if (!skipGlobalClaim) await markSent(globalRef, { dryRun: true, dedupeKey, subKey });
    return { ok: true, dryRun: true };
  }

  // Retry logic for transient failures
  const MAX_RETRIES = 3;
  const RETRY_STATUS_CODES = [429, 500, 502, 503, 504];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload), {
        headers: {
          'Urgency': 'high'
        }
      });
      await markSent(ref, { dedupeKey, attempt });
      if (!skipGlobalClaim) await markSent(globalRef, { dedupeKey, subKey, attempt });
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
      if (!skipGlobalClaim) await markFailed(globalRef, statusCode || null, { message, dedupeKey, subKey, attempts: attempt });
      console.warn(`[push] Failed user=${userId} sub=${subKey.slice(0, 8)}... status=${statusCode || 'unknown'} msg=${message.slice(0, 100)}`);

      // Cleanup expired subscriptions (410 Gone / 404 Not Found)
      if (statusCode === 410 || statusCode === 404) {
        console.log(`[push] Removing expired subscription for user=${userId}`);
        await db.ref(`users/${userId}/pushSubscriptions/${subKey}`).remove().catch((e) => {
          console.warn('[push] Failed to remove expired sub:', e.message);
        });
      }
      return { ok: false, statusCode, message };
    }
  }
}

async function sendNotificationToUser(userId, subs, payload, dedupeKey) {
  let sentAny = false;
  let skippedAny = false;
  let failed = 0;
  let sent = 0;

  // Claim global lock ONCE per user so we don't spam if this function is called concurrently
  const sentHash = hashKey(dedupeKey);
  const userSentPath = `users/${userId}/pushSentGlobal/${sentHash}`;
  const { committed: globalClaimed, ref: globalRef } = await claimOnce(userSentPath);
  
  if (!globalClaimed) {
    return { sentAny: false, skippedAny: true, failed: 0, sent: 0 };
  }

  // Send to ALL VAPID subscriptions (don't break on first)
  if (subs && subs.length > 0) {
    const results = await Promise.allSettled(
      subs.map(({ subKey, sub }) =>
        sendToSubscription({ userId, subKey, subscription: sub, payload, dedupeKey, skipGlobalClaim: true })
      )
    );
    for (const r of results) {
      const v = r.status === 'fulfilled' ? r.value : null;
      if (!v) { failed += 1; continue; }
      if (v.ok) { sentAny = true; sent += 1; }
      else if (v.skipped) { skippedAny = true; }
      else { failed += 1; }
    }
  }

  if (sentAny) {
    await markSent(globalRef, { dedupeKey, sentAny: true });
  } else if (!skippedAny) {
    // If we failed to send to anything and weren't just skipping dupes, 
    // remove the global claim so we can retry next minute
    await globalRef.remove().catch(() => {});
  }

  return { sentAny, skippedAny, failed, sent };
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
    if (process.env.PUSH_TARGET_USER && userId !== process.env.PUSH_TARGET_USER) continue;
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
    ensureInit();
  const nowMs = Date.now();
  console.log(`[${new Date(nowMs).toISOString()}] Checking...`);

  const users = await loadUsersWithSubscriptions();
  const sharedEvents = await loadSharedEvents();
  const sharedSubjects = await loadSharedSubjects();

  // Log subscription details for debugging
  const totalSubs = users.reduce((sum, u) => sum + u.subs.length, 0);
  console.log(`[push] Loaded ${users.length} users with ${totalSubs} total subscriptions`);
  users.forEach(u => console.log(`[push]   - ${u.userId}: ${u.subs.length} subscription(s)`));

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
      title: evt.name || 'Event',
      body: `Event reminder: Starts in ${offset}`,
      tag: `event-${evt.id}`,
      dedupeKey,
      url: buildUrl('/', {}),
      requireInteraction: true,
      renotify: true,
      actions: [{ action: 'view', title: 'View' }]
    };

    for (const { userId, subs } of users) {
      const res = await sendNotificationToUser(userId, subs, payload, dedupeKey);
      if (res.sentAny) sent += res.sent;
      else if (res.skippedAny) skipped += 1;
      failed += res.failed;
    }
  }

  // Per-user tasks -> user subscriptions only
  for (const { userId, subs } of users) {
    const tasks = await loadTasksForUser(userId);
    for (const task of tasks) {
      if (task.completed) continue;
      const reminderMinutesList = normalizeTaskReminders(task.reminders, task.reminder);
      if (!reminderMinutesList.length) continue;
      const dueMs = parseIsoMillis(task.dueDate);

      for (const reminderMinutes of reminderMinutesList) {
        if (!shouldTrigger(nowMs, dueMs, reminderMinutes)) continue;

        const offset = formatReminderOffset(reminderMinutes);
        // Normalize dueDate to ISO to match client-side dedupe key format
        const dueDateIso = new Date(task.dueDate).toISOString();
        const dedupeKey = `task|${userId}|${task.id}|${dueDateIso}|${reminderMinutes}`;

        // Issue a one-time remind-again token (no-op if REMIND_AGAIN_API_URL not set)
        let remindAgainToken = null;
        try {
          remindAgainToken = await issueRemindAgainToken(userId, {
            type: 'task',
            taskId: task.id,
            occurrence: dueDateIso,
            baseDedupeKey: dedupeKey,
            baseUrl: APP_URL.toString(),
            title: task.title || 'Task'
          });
        } catch (e) {
          console.warn('[remind-again] Failed to issue token for task:', e.message);
        }

        const payload = {
          title: task.title || 'Task',
          body: (task.recurrence ? 'Recurring task reminder: ' : 'Task reminder: ') + `Due in ${offset}`,
          tag: `task-${task.id}-${reminderMinutes}`,
          dedupeKey,
          url: buildUrl('/', {}),
          completeUrl: buildUrl('/', { completeTask: task.id, user: userId }),
          requireInteraction: true,
          renotify: true,
          actions: buildTaskActions(!!remindAgainToken),
          ...(remindAgainToken ? {
            remindAgainToken,
            remindAgainEndpoint: REMIND_AGAIN_API_URL,
            remindAgainUserId: userId,
            remindAgainTaskId: task.id,
            remindAgainSubjectId: '',
            remindAgainOccurrence: dueDateIso,
            remindAgainMinutes: String(REMIND_AGAIN_DELAY_MINUTES)
          } : {})
        };

        const res = await sendNotificationToUser(userId, subs, payload, dedupeKey);
        if (res.sentAny) sent += res.sent;
        else if (res.skippedAny) skipped += 1;
        failed += res.failed;
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
      const title = block.title || 'פעילות';
      const body = whenStr
        ? `Planner reminder: ${whenStr}`
        : `Planner reminder: מתחיל בקרוב`;
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

      const res = await sendNotificationToUser(userId, subs, payload, dedupeKey);
      if (res.sentAny) sent += res.sent;
      else if (res.skippedAny) skipped += 1;
      failed += res.failed;
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
      const reminderMinutesList = normalizeTaskReminders(task.reminders, task.reminder);
      if (!reminderMinutesList.length) continue;
      const dueMs = parseIsoMillis(task.dueDate);
      const sharedDueDateIso = new Date(task.dueDate).toISOString();

      for (const reminderMinutes of reminderMinutesList) {
        if (!shouldTrigger(nowMs, dueMs, reminderMinutes)) continue;

        const offset = formatReminderOffset(reminderMinutes);
        // Send to each user who has active access to this shared subject
        for (const userId of allUsers) {
          // Verify user still has access (owner always has access, members must be active)
          if (userId !== owner) {
            const memberEntry = members[userId];
            // Skip removed/inactive members
            if (!memberEntry || memberEntry === false || memberEntry.removed) continue;
          }
          const userEntry = users.find(u => u.userId === userId);
          if (!userEntry) continue;

          const dedupeKey = `shared-task|${userId}|${subject.id}|${taskId}|${sharedDueDateIso}|${reminderMinutes}`;

          // Issue a one-time remind-again token
          let remindAgainToken = null;
          try {
            remindAgainToken = await issueRemindAgainToken(userId, {
              type: 'shared-task',
              taskId,
              subjectId: subject.id,
              occurrence: sharedDueDateIso,
              baseDedupeKey: dedupeKey,
              baseUrl: APP_URL.toString(),
              title: task.title || 'Task'
            });
          } catch (e) {
            console.warn('[remind-again] Failed to issue token for shared task:', e.message);
          }

          const payload = {
            title: task.title || 'Task',
            body: `Shared task reminder: Due in ${offset}`,
            tag: `shared-task-${taskId}-${reminderMinutes}`,
            dedupeKey,
            url: buildUrl('/', {}),
            completeUrl: buildUrl('/', { completeTask: taskId, user: userId, sharedSubject: subject.id }),
            requireInteraction: true,
            renotify: true,
            actions: buildTaskActions(!!remindAgainToken),
            ...(remindAgainToken ? {
              remindAgainToken,
              remindAgainEndpoint: REMIND_AGAIN_API_URL,
              remindAgainUserId: userId,
              remindAgainTaskId: taskId,
              remindAgainSubjectId: subject.id,
              remindAgainOccurrence: sharedDueDateIso,
              remindAgainMinutes: String(REMIND_AGAIN_DELAY_MINUTES)
            } : {})
          };
          const res = await sendNotificationToUser(userId, userEntry.subs, payload, dedupeKey);
          if (res.sentAny) sent += res.sent;
          else if (res.skippedAny) skipped += 1;
          failed += res.failed;
        }
      }
    }
  }

  // Process remind-again queue (snoozed reminders from previous notifications)
  const raResult = await processRemindAgainQueue(users, nowMs);
  sent += raResult.sent;
  skipped += raResult.skipped;
  failed += raResult.failed;

  console.log(`[${new Date().toISOString()}] Result: Sent ${sent}, Skipped ${skipped}, Failed ${failed}`);
}

// ============================================
// Remind-Again Queue Processor
// Reads Firebase remindAgainQueue written by api/remind-again.js
// and sends snoozed notifications via VAPID web-push.
// ============================================
async function processRemindAgainQueue(users, nowMs) {
  let sent = 0, skipped = 0, failed = 0;

  for (const { userId, subs } of users) {
    const queueSnap = await db.ref(`users/${userId}/remindAgainQueue`).once('value');
    const queueItems = queueSnap.val() || {};

    // Recover any items stuck in 'sending' from a crashed prior run
    for (const [queueId, item] of Object.entries(queueItems)) {
      if (!item || item.status !== 'sending') continue;
      const updatedAt = Number(item.updatedAt) || 0;
      if (!updatedAt || (nowMs - updatedAt) <= REMIND_AGAIN_SENDING_STALE_MS) continue;
      await db.ref(`users/${userId}/remindAgainQueue/${queueId}`).transaction((cur) => {
        if (!cur || cur.status !== 'sending') return;
        if ((nowMs - (Number(cur.updatedAt) || 0)) <= REMIND_AGAIN_SENDING_STALE_MS) return;
        return { ...cur, status: 'pending', updatedAt: nowMs };
      }).catch(() => {});
      queueItems[queueId] = { ...item, status: 'pending', updatedAt: nowMs };
    }

    for (const [queueId, item] of Object.entries(queueItems)) {
      if (!item || item.status !== 'pending') continue;

      const dueAt = Number(item.dueAt) || 0;
      if (dueAt > nowMs) continue;

      const expiresAt = Number(item.expiresAt) || 0;
      const itemRef = db.ref(`users/${userId}/remindAgainQueue/${queueId}`);

      if (expiresAt && expiresAt < nowMs) {
        await itemRef.update({ status: 'expired', updatedAt: nowMs }).catch(() => {});
        skipped++;
        continue;
      }

      // Atomic claim — prevents double-send across overlapping workflow runs
      const claim = await itemRef.transaction((cur) => {
        if (!cur || cur.status !== 'pending') return;
        if ((Number(cur.dueAt) || 0) > nowMs) return;
        const curExpires = Number(cur.expiresAt) || 0;
        if (curExpires && curExpires < nowMs) return { ...cur, status: 'expired', updatedAt: nowMs };
        return { ...cur, status: 'sending', updatedAt: nowMs };
      });
      if (!claim.committed) continue;
      const currentItem = claim.snapshot.val() || {};
      if (currentItem.status !== 'sending') { skipped++; continue; }

      // Load the task to verify it's still active
      let task = null;
      try {
        if (currentItem.type === 'shared-task' && currentItem.subjectId && currentItem.taskId) {
          const snap = await db.ref(`sharedSubjects/${currentItem.subjectId}/tasks/${currentItem.taskId}`).once('value');
          task = snap.val();
        } else if (currentItem.taskId) {
          const snap = await db.ref(`users/${userId}/tasks/${currentItem.taskId}`).once('value');
          task = snap.val();
        }
      } catch (e) {
        console.warn('[remind-again] Failed to load task:', e.message);
      }

      if (!task || (task.completed && !task.recurrence)) {
        await itemRef.update({ status: 'cancelled', updatedAt: Date.now(), reason: 'task_not_active' }).catch(() => {});
        skipped++;
        continue;
      }

      const taskTitle = task.title || currentItem.title || 'Task';
      const occurrenceKey = currentItem.occurrence || (task.dueDate ? new Date(task.dueDate).toISOString() : '');
      const dedupeBase = currentItem.baseDedupeKey || `remind-again|${userId}|${currentItem.taskId || ''}|${occurrenceKey}`;
      const dedupeKey = `${dedupeBase}|again|${queueId}`;

      // Issue a new token so the user can snooze the snoozed reminder too
      let remindAgainToken = null;
      try {
        remindAgainToken = await issueRemindAgainToken(userId, {
          type: currentItem.type || 'task',
          taskId: currentItem.taskId,
          subjectId: currentItem.subjectId || '',
          occurrence: occurrenceKey,
          baseDedupeKey: dedupeKey,
          baseUrl: currentItem.baseUrl || APP_URL.toString(),
          title: taskTitle
        });
      } catch (e) {
        console.warn('[remind-again] Failed to issue follow-up token:', e.message);
      }

      const baseUrl = currentItem.baseUrl || APP_URL.toString();
      const completeParams = new URLSearchParams({ completeTask: String(currentItem.taskId || ''), user: userId });
      if (currentItem.subjectId) completeParams.set('sharedSubject', String(currentItem.subjectId));
      if (occurrenceKey) completeParams.set('occurrence', occurrenceKey);

      const payload = {
        title: taskTitle,
        body: `Snoozed reminder: Due in 10 minutes`,
        tag: `remind-again-${currentItem.taskId || queueId}`,
        dedupeKey,
        url: baseUrl,
        completeUrl: `${new URL('?', APP_URL).href.replace('?', '')}?${completeParams.toString()}`,
        requireInteraction: true,
        renotify: true,
        actions: buildTaskActions(!!remindAgainToken),
        ...(remindAgainToken ? {
          remindAgainToken,
          remindAgainEndpoint: REMIND_AGAIN_API_URL,
          remindAgainUserId: userId,
          remindAgainTaskId: String(currentItem.taskId || ''),
          remindAgainSubjectId: String(currentItem.subjectId || ''),
          remindAgainOccurrence: occurrenceKey,
          remindAgainMinutes: String(REMIND_AGAIN_DELAY_MINUTES)
        } : {})
      };

      if (subs.length === 0) {
        await itemRef.update({ status: 'failed', updatedAt: Date.now(), reason: 'no_subscriptions' }).catch(() => {});
        failed++;
        continue;
      }

      const res = await sendNotificationToUser(userId, subs, payload, dedupeKey);
      const anyOk = res.sentAny;
      const anySkipped = res.skippedAny;

      if (anyOk || anySkipped) {
        await itemRef.update({ status: 'sent', sentAt: Date.now(), updatedAt: Date.now() }).catch(() => {});
        if (anyOk) sent++; else skipped++;
      } else {
        await itemRef.update({ status: 'failed', updatedAt: Date.now(), reason: 'send_failed' }).catch(() => {});
        failed++;
      }
    }
  }

  if (sent + failed > 0) {
    console.log(`[remind-again] Queue: Sent ${sent}, Skipped ${skipped}, Failed ${failed}`);
  }
  return { sent, skipped, failed };
}

async function cleanupOldPushSent() {
  // Clean up pushSent and pushSentGlobal records older than 7 days
  const CLEANUP_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  const cutoffTs = Date.now() - CLEANUP_AGE_MS;

  try {
    const usersSnap = await db.ref('users').once('value');
    const users = usersSnap.val() || {};
    let cleaned = 0;

    for (const [userId, userData] of Object.entries(users)) {
      // Clean per-subscription records
      const pushSent = userData?.pushSent || {};
      for (const [subKey, records] of Object.entries(pushSent)) {
        for (const [recordKey, record] of Object.entries(records || {})) {
          if (record?.ts && record.ts < cutoffTs) {
            await db.ref(`users/${userId}/pushSent/${subKey}/${recordKey}`).remove().catch((e) => {
              console.warn('[cleanup] Failed to remove sent record:', e.message);
            });
            cleaned++;
          }
        }
      }
      // Clean global per-user records
      const pushSentGlobal = userData?.pushSentGlobal || {};
      for (const [recordKey, record] of Object.entries(pushSentGlobal)) {
        if (record?.ts && record.ts < cutoffTs) {
          await db.ref(`users/${userId}/pushSentGlobal/${recordKey}`).remove().catch((e) => {
            console.warn('[cleanup] Failed to remove global sent record:', e.message);
          });
          cleaned++;
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


// ============================================
module.exports = async (req, res) => {
    // Security: Check for API key (MANDATORY)
    const apiKey = req.query.key || req.headers['x-api-key'];
    const expectedKey = process.env.CRON_API_KEY;

    if (!expectedKey || !apiKey || apiKey !== expectedKey) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const result = await runCheck();
        
        // Cleanup old pushSent records (run occasionally to prevent DB bloat)
        try {
            await cleanupOldPushSent();
        } catch (e) {
            console.warn('Cleanup error:', e);
        }
        
        res.status(200).json({
            ok: true,
            timestamp: new Date().toISOString(),
            ...result
        });
    } catch (err) {
        console.error('Cron error:', err);
        res.status(500).json({ error: err.message });
    }
};
