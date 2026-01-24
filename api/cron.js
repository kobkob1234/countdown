/**
 * FCM Notification Cron Handler for Vercel Serverless
 * 
 * This is a port of tools/push-sender/send-reminders.mjs
 * Key changes:
 * - Uses FCM (admin.messaging) instead of web-push
 * - Reads FCM tokens from users/{uid}/fcmTokens instead of pushSubscriptions
 * - Runs once per invocation (triggered by cron-job.org every minute)
 * 
 * TIMEZONE LIMITATION:
 * This script uses a hardcoded Israel timezone offset (UTC+2) for planner blocks.
 * Events and tasks with explicit datetime are processed in UTC as stored.
 */

const admin = require('firebase-admin');
const crypto = require('node:crypto');
const webPush = require('web-push');

// VAPID keys for web-push fallback (must match frontend notifications.js)
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BL-m24SrurFUNIQxH7S77r1yYShIiCibpw2CbtK8FwYATHzYiR0kQGKzWilEGRHyRK2jxqRPUR_RJoAVUgrO-24';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:kobeamit1@gmail.com';

// Configure web-push if VAPID private key is available
if (VAPID_PRIVATE_KEY) {
    webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Initialize Firebase Admin (only once)
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://countdown-463de-default-rtdb.firebaseio.com'
    });
}

const db = admin.database();

// Configuration
const WINDOW_MS = 90000; // 90 seconds late-allowed window
const APP_URL = process.env.APP_URL || 'https://kobkob1234.github.io/countdown/';

// ============================================
// Helper Functions (ported from send-reminders.mjs)
// ============================================

function hashKey(input) {
    return crypto.createHash('sha256').update(String(input || '')).digest('base64url');
}

function parseIsoMillis(iso) {
    const t = Date.parse(String(iso || ''));
    return Number.isFinite(t) ? t : null;
}

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

    const wallDate = new Date(Date.UTC(year, month - 1, day, h, Number.isFinite(m) ? m : 0, 0, 0));
    const israelOffsetMs = getZoneOffsetMs(wallDate);
    return Number.isNaN(wallDate.getTime()) ? null : wallDate.getTime() - israelOffsetMs;
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

function shouldTrigger(nowMs, targetMs, reminderMinutes) {
    const rem = Number.parseInt(reminderMinutes || '0', 10) || 0;
    if (!rem) return false;
    if (!Number.isFinite(targetMs)) return false;
    const triggerAt = targetMs - rem * 60000;
    return nowMs >= triggerAt && nowMs < triggerAt + WINDOW_MS;
}

// ============================================
// Recurrence Expansion (for recurring tasks)
// ============================================

/**
 * Parse recurrence value into normalized format.
 * Handles:
 *   - String: "daily", "weekly", "biweekly", "monthly", "yearly", "weekdays"
 *   - Object: { type: 'custom', interval: 3, unit: 'days' }
 */
function parseRecurrence(recurrence) {
    if (!recurrence) return null;

    // Handle custom object format
    if (typeof recurrence === 'object' && recurrence.type === 'custom') {
        const interval = Number.parseInt(recurrence.interval, 10);
        const unit = recurrence.unit;
        if (Number.isFinite(interval) && interval > 0 && unit) {
            return { type: 'custom', interval, unit };
        }
        return null;
    }

    // Handle string formats
    if (typeof recurrence === 'string' && recurrence !== 'none') {
        return { type: recurrence };
    }

    return null;
}

/**
 * Advance a date by one recurrence interval.
 */
function advanceByRecurrence(date, parsed) {
    const next = new Date(date);

    switch (parsed.type) {
        case 'daily':
            next.setDate(next.getDate() + 1);
            break;
        case 'weekdays':
            // Skip to next weekday (Sunday=0, Saturday=6 in Israel: Fri=5, Sat=6 are weekend)
            do {
                next.setDate(next.getDate() + 1);
            } while (next.getDay() === 5 || next.getDay() === 6);
            break;
        case 'weekly':
            next.setDate(next.getDate() + 7);
            break;
        case 'biweekly':
            next.setDate(next.getDate() + 14);
            break;
        case 'monthly':
            next.setMonth(next.getMonth() + 1);
            break;
        case 'yearly':
            next.setFullYear(next.getFullYear() + 1);
            break;
        case 'custom':
            if (!parsed.interval || !parsed.unit) return null;
            switch (parsed.unit) {
                case 'days':
                    next.setDate(next.getDate() + parsed.interval);
                    break;
                case 'weeks':
                    next.setDate(next.getDate() + (parsed.interval * 7));
                    break;
                case 'months':
                    next.setMonth(next.getMonth() + parsed.interval);
                    break;
                case 'years':
                    next.setFullYear(next.getFullYear() + parsed.interval);
                    break;
                default:
                    return null;
            }
            break;
        default:
            return null;
    }

    return next;
}

/**
 * Get all upcoming occurrences of a recurring task within the look-ahead window.
 * @param {number} baseDateMs - Original due date in milliseconds
 * @param {string|object} recurrence - Recurrence rule
 * @param {number} fromMs - Start checking from this time
 * @param {number} lookAheadDays - How many days ahead to look (default: 7)
 * @returns {Date[]} Array of occurrence dates within the window
 */
function getUpcomingOccurrences(baseDateMs, recurrence, fromMs, lookAheadDays = 7) {
    const parsed = parseRecurrence(recurrence);
    if (!parsed || !Number.isFinite(baseDateMs)) return [];

    const occurrences = [];
    const maxMs = fromMs + (lookAheadDays * 24 * 60 * 60 * 1000);
    let current = new Date(baseDateMs);

    // Fast-forward past dates before the check window
    // (but we need to account for reminder offset, so start from a bit earlier)
    const earliestTrigger = fromMs - (lookAheadDays * 24 * 60 * 60 * 1000);
    let iterations = 0;
    const MAX_ITERATIONS = 10000; // Safety limit

    while (current.getTime() < earliestTrigger && iterations < MAX_ITERATIONS) {
        const next = advanceByRecurrence(current, parsed);
        if (!next) break;
        current = next;
        iterations++;
    }

    // Collect occurrences within the look-ahead window
    iterations = 0;
    while (current.getTime() <= maxMs && iterations < MAX_ITERATIONS) {
        if (current.getTime() >= earliestTrigger) {
            occurrences.push(new Date(current));
        }
        const next = advanceByRecurrence(current, parsed);
        if (!next) break;
        current = next;
        iterations++;
    }

    return occurrences;
}

// ============================================
// Deduplication (using Firebase)
// ============================================

async function claimOnce(path) {
    const ref = db.ref(path);
    const now = Date.now();
    const SENDING_STALE_MS = 5 * 60 * 1000;

    const res = await ref.transaction((cur) => {
        if (cur?.status === 'sent') return;
        if (cur?.status === 'sending') {
            const ts = Number(cur.ts) || 0;
            if (ts && (now - ts) < SENDING_STALE_MS) return;
        }
        return { status: 'sending', ts: now };
    });
    return { committed: !!res.committed, ref };
}

async function markSent(ref, extra = {}) {
    await ref.set({ status: 'sent', ts: Date.now(), ...extra });
}

// ============================================
// Data Loading
// ============================================

async function loadUsersWithFCMTokens() {
    const snap = await db.ref('users').once('value');
    const users = snap.val() || {};
    const out = [];
    for (const [userId, userData] of Object.entries(users)) {
        // Support both new FCM tokens and legacy VAPID subscriptions
        const fcmTokens = userData?.fcmTokens || {};
        const tokens = Object.keys(fcmTokens).filter(t => t && t.length > 20);

        // Also check legacy pushSubscriptions for backward compatibility
        const pushSubs = userData?.pushSubscriptions || {};

        if (tokens.length === 0 && Object.keys(pushSubs).length === 0) continue;
        out.push({ userId, tokens, pushSubs });
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

// ============================================
// FCM Sending
// ============================================

async function sendFCMToUser(userId, tokens, payload, dedupeKey) {
    if (!tokens || tokens.length === 0) return { sent: 0, failed: 0 };

    const sentHash = hashKey(dedupeKey);
    const sentPath = `users/${userId}/fcmSent/${sentHash}`;

    const { committed, ref } = await claimOnce(sentPath);
    if (!committed) return { skipped: true };

    const message = {
        tokens: tokens,
        notification: {
            title: payload.title,
            body: payload.body,
        },
        data: {
            url: payload.url || APP_URL,
            completeUrl: payload.completeUrl || '',
            tag: payload.tag || 'reminder',
            dedupeKey: dedupeKey,
        },
        android: {
            priority: 'high',
            notification: {
                channelId: 'reminders',
                priority: 'high',
                defaultVibrateTimings: true,
            }
        },
        webpush: {
            headers: {
                Urgency: 'high'
            },
            notification: {
                icon: `${APP_URL}icon-192.png`,
                badge: `${APP_URL}icon-192.png`,
                vibrate: [200, 100, 200],
                requireInteraction: true,
                actions: payload.actions || [
                    { action: 'view', title: 'View' },
                    { action: 'complete', title: 'Done' }
                ]
            }
        }
    };

    try {
        const response = await admin.messaging().sendEachForMulticast(message);
        await markSent(ref, { dedupeKey, successCount: response.successCount });

        // Clean up invalid tokens
        if (response.failureCount > 0) {
            response.responses.forEach((resp, idx) => {
                if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
                    const badToken = tokens[idx];
                    db.ref(`users/${userId}/fcmTokens/${badToken}`).remove().catch((err) => {
                        console.warn('[FCM] Failed to remove invalid token:', badToken, err.message);
                    });
                }
            });
        }

        return { sent: response.successCount, failed: response.failureCount };
    } catch (err) {
        console.error(`[FCM] Error sending to ${userId}:`, err.message);
        return { sent: 0, failed: tokens.length };
    }
}

// ============================================
// VAPID Web Push Sending (Fallback for legacy subscriptions)
// ============================================

async function sendVAPIDPush(userId, pushSubs, payload, dedupeKey) {
    if (!VAPID_PRIVATE_KEY) {
        console.warn('[VAPID] No private key configured - cannot send');
        return { sent: 0, failed: 0 };
    }

    const subscriptions = Object.values(pushSubs || {});
    if (subscriptions.length === 0) return { sent: 0, failed: 0 };

    const sentHash = hashKey(dedupeKey);
    const sentPath = `users/${userId}/pushSent/${sentHash}`;

    const { committed, ref } = await claimOnce(sentPath);
    if (!committed) return { skipped: true };

    const pushPayload = JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: `${APP_URL}icon-192.png`,
        badge: `${APP_URL}icon-192.png`,
        tag: payload.tag || 'reminder',
        data: {
            url: payload.url || APP_URL,
            completeUrl: payload.completeUrl || '',
            dedupeKey: dedupeKey
        },
        actions: payload.actions || [
            { action: 'view', title: 'View' },
            { action: 'complete', title: 'Done' }
        ]
    });

    let sent = 0;
    let failed = 0;

    for (const entry of subscriptions) {
        const sub = entry.sub || entry; // Handle wrapped or raw subscription
        if (!sub?.endpoint) continue;

        try {
            await webPush.sendNotification(sub, pushPayload);
            sent++;
        } catch (err) {
            failed++;
            // Remove expired subscriptions
            if (err.statusCode === 410 || err.statusCode === 404) {
                const key = Object.keys(pushSubs).find(k =>
                    (pushSubs[k].sub?.endpoint || pushSubs[k].endpoint) === sub.endpoint
                );
                if (key) {
                    db.ref(`users/${userId}/pushSubscriptions/${key}`).remove().catch((err) => {
                        console.warn('[VAPID] Failed to remove expired subscription:', key, err.message);
                    });
                }
            }
        }
    }

    await markSent(ref, { dedupeKey, successCount: sent });
    return { sent, failed };
}

// Combined notification sender - tries FCM first, falls back to VAPID
async function sendNotificationToUser(userId, tokens, pushSubs, payload, dedupeKey) {
    // Try FCM first if tokens are available
    if (tokens && tokens.length > 0) {
        return sendFCMToUser(userId, tokens, payload, dedupeKey);
    }

    // Fall back to VAPID push if no FCM tokens but has push subscriptions
    if (pushSubs && Object.keys(pushSubs).length > 0) {
        return sendVAPIDPush(userId, pushSubs, payload, dedupeKey);
    }

    return { sent: 0, failed: 0 };
}

// ============================================
// Main Handler
// ============================================

async function processSharedEvents(sharedEvents, users, nowMs) {
    let sent = 0, skipped = 0, failed = 0;
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
            url: APP_URL,
            actions: [{ action: 'view', title: 'View' }]
        };

        for (const { userId, tokens, pushSubs } of users) {
            const result = await sendNotificationToUser(userId, tokens, pushSubs, payload, dedupeKey);
            if (result.skipped) skipped++;
            else { sent += result.sent; failed += result.failed; }
        }
    }
    return { sent, skipped, failed };
}

async function processSingleTask(task, user, nowMs) {
    let sent = 0, skipped = 0, failed = 0;
    // For recurring tasks: always check (each occurrence is independent)
    // For non-recurring tasks: skip if completed
    if (task.completed && !task.recurrence) return { sent, skipped, failed };

    const reminderMinutes = Number.parseInt(task.reminder || '0', 10) || 0;
    if (!reminderMinutes) return { sent, skipped, failed };

    const baseDueMs = parseIsoMillis(task.dueDate);
    if (!Number.isFinite(baseDueMs)) return { sent, skipped, failed };

    // Get occurrences to check (single date for non-recurring, expanded for recurring)
    const occurrences = task.recurrence
        ? getUpcomingOccurrences(baseDueMs, task.recurrence, nowMs, 7)
        : [new Date(baseDueMs)];

    for (const occurrence of occurrences) {
        const occurrenceMs = occurrence.getTime();
        if (!shouldTrigger(nowMs, occurrenceMs, reminderMinutes)) continue;

        const occurrenceKey = occurrence.toISOString();
        const offset = formatReminderOffset(reminderMinutes);
        const dedupeKey = `task|${user.userId}|${task.id}|${occurrenceKey}|${reminderMinutes}`;
        const payload = {
            title: task.recurrence ? 'Recurring Task Reminder 🔄' : 'Task Reminder 📋',
            body: `${task.title || 'Task'} is due in ${offset}`,
            tag: `task-${task.id}-${occurrenceKey.slice(0, 10)}`,
            url: APP_URL,
            completeUrl: `${APP_URL}?completeTask=${task.id}&user=${user.userId}&occurrence=${encodeURIComponent(occurrenceKey)}`,
        };

        const result = await sendNotificationToUser(user.userId, user.tokens, user.pushSubs, payload, dedupeKey);
        if (result.skipped) skipped++;
        else { sent += result.sent; failed += result.failed; }
    }
    return { sent, skipped, failed };
}

async function processUserTasks(users, nowMs) {
    let sent = 0, skipped = 0, failed = 0;
    for (const user of users) {
        const tasks = await loadTasksForUser(user.userId);
        for (const task of tasks) {
            const result = await processSingleTask(task, user, nowMs);
            sent += result.sent;
            skipped += result.skipped;
            failed += result.failed;
        }
    }
    return { sent, skipped, failed };
}

async function processSinglePlannerBlock(block, user, nowMs) {
    let sent = 0, skipped = 0, failed = 0;
    if (!block || block.completed) return { sent, skipped, failed };

    const reminderMinutes = Number.parseInt(block.reminder || '0', 10) || 0;
    if (!reminderMinutes) return { sent, skipped, failed };

    const startMs = parsePlannerStart(block);
    if (!shouldTrigger(nowMs, startMs, reminderMinutes)) return { sent, skipped, failed };

    const blockKey = block.id || hashKey(`${block.title || ''}|${block.date || ''}|${block.start || ''}`);
    const whenStr = formatPlannerWhen(startMs);
    const dedupeKey = `planner|${user.userId}|${blockKey}|${block.startAt || block.date || ''}|${block.start || ''}|${reminderMinutes}`;
    const payload = {
        title: 'Planner Reminder 📅',
        body: whenStr ? `${block.title || 'Activity'} • ${whenStr}` : `${block.title || 'Activity'} starting soon`,
        tag: `planner-${blockKey}`,
        url: APP_URL,
        actions: [{ action: 'view', title: 'View' }]
    };

    const result = await sendNotificationToUser(user.userId, user.tokens, user.pushSubs, payload, dedupeKey);
    if (result.skipped) skipped++;
    else { sent += result.sent; failed += result.failed; }

    return { sent, skipped, failed };
}

async function processPlannerBlocks(users, nowMs) {
    let sent = 0, skipped = 0, failed = 0;
    for (const user of users) {
        const blocks = await loadPlannerBlocksForUser(user.userId);
        for (const block of blocks) {
            const result = await processSinglePlannerBlock(block, user, nowMs);
            sent += result.sent;
            skipped += result.skipped;
            failed += result.failed;
        }
    }
    return { sent, skipped, failed };
}

async function processSharedSubjectTask(taskId, task, subjectId, allUserIds, users, nowMs) {
    let sent = 0, skipped = 0, failed = 0;
    // For recurring tasks: always check (each occurrence is independent)
    // For non-recurring tasks: skip if completed
    if (!task || (task.completed && !task.recurrence)) return { sent, skipped, failed };

    const reminderMinutes = Number.parseInt(task.reminder || '0', 10) || 0;
    if (!reminderMinutes) return { sent, skipped, failed };

    const baseDueMs = parseIsoMillis(task.dueDate);
    if (!Number.isFinite(baseDueMs)) return { sent, skipped, failed };

    // Get occurrences to check (single date for non-recurring, expanded for recurring)
    const occurrences = task.recurrence
        ? getUpcomingOccurrences(baseDueMs, task.recurrence, nowMs, 7)
        : [new Date(baseDueMs)];

    for (const occurrence of occurrences) {
        const occurrenceMs = occurrence.getTime();
        if (!shouldTrigger(nowMs, occurrenceMs, reminderMinutes)) continue;

        const occurrenceKey = occurrence.toISOString();
        const offset = formatReminderOffset(reminderMinutes);

        for (const userId of allUserIds) {
            const userEntry = users.find(u => u.userId === userId);
            if (!userEntry) continue;

            const dedupeKey = `shared-task|${userId}|${subjectId}|${taskId}|${occurrenceKey}|${reminderMinutes}`;
            const payload = {
                title: task.recurrence ? 'Shared Recurring Task 🔄' : 'Shared Task Reminder 📋',
                body: `${task.title || 'Task'} is due in ${offset}`,
                tag: `shared-task-${taskId}-${occurrenceKey.slice(0, 10)}`,
                url: APP_URL,
                completeUrl: `${APP_URL}?completeTask=${taskId}&user=${userId}&sharedSubject=${subjectId}&occurrence=${encodeURIComponent(occurrenceKey)}`,
            };

            const result = await sendNotificationToUser(userId, userEntry.tokens, userEntry.pushSubs, payload, dedupeKey);
            if (result.skipped) skipped++;
            else { sent += result.sent; failed += result.failed; }
        }
    }
    return { sent, skipped, failed };
}

async function processSharedSubjects(sharedSubjects, users, nowMs) {
    let sent = 0, skipped = 0, failed = 0;
    for (const subject of sharedSubjects) {
        const subjectTasks = subject.tasks || {};
        const owner = subject.owner;
        const members = subject.members || {};
        const allUserIds = [owner, ...Object.keys(members)].filter(Boolean);

        for (const [taskId, task] of Object.entries(subjectTasks)) {
            const result = await processSharedSubjectTask(taskId, task, subject.id, allUserIds, users, nowMs);
            sent += result.sent;
            skipped += result.skipped;
            failed += result.failed;
        }
    }
    return { sent, skipped, failed };
}

async function runCheck() {
    const nowMs = Date.now();
    console.log(`[${new Date(nowMs).toISOString()}] Checking...`);

    const users = await loadUsersWithFCMTokens();
    const sharedEvents = await loadSharedEvents();
    const sharedSubjects = await loadSharedSubjects();

    console.log(`[FCM] Loaded ${users.length} users with tokens`);

    const results = [
        await processSharedEvents(sharedEvents, users, nowMs),
        await processUserTasks(users, nowMs),
        await processPlannerBlocks(users, nowMs),
        await processSharedSubjects(sharedSubjects, users, nowMs)
    ];

    const final = results.reduce((acc, curr) => ({
        sent: acc.sent + curr.sent,
        skipped: acc.skipped + curr.skipped,
        failed: acc.failed + curr.failed
    }), { sent: 0, skipped: 0, failed: 0 });

    console.log(`[${new Date().toISOString()}] Result: Sent ${final.sent}, Skipped ${final.skipped}, Failed ${final.failed}`);
    return final;
}

// ============================================
// Vercel Handler
// ============================================

module.exports = async (req, res) => {
    // Security: Check for API key
    const apiKey = req.query.key || req.headers['x-api-key'];
    const expectedKey = process.env.CRON_API_KEY;

    if (expectedKey && apiKey !== expectedKey) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const result = await runCheck();
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
