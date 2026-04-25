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

function normalizeAppUrl(rawUrl) {
    const fallback = 'https://kobkob1234.github.io/countdown/';
    const value = String(rawUrl || '').trim();
    if (!value) return fallback;

    try {
        const parsed = new URL(value);

        // Prevent accidental GitHub Pages root links that lead to 404 for project pages.
        if (parsed.hostname === 'kobkob1234.github.io' && (parsed.pathname === '/' || parsed.pathname === '')) {
            parsed.pathname = '/countdown/';
        }

        if (!parsed.pathname.endsWith('/')) parsed.pathname += '/';
        return parsed.toString();
    } catch {
        return fallback;
    }
}

const APP_URL = normalizeAppUrl(process.env.APP_URL || 'https://kobkob1234.github.io/countdown/');
const REMIND_AGAIN_DELAY_MINUTES = Number.parseInt(process.env.REMIND_AGAIN_DELAY_MINUTES || '10', 10) || 10;
const REMIND_AGAIN_TOKEN_TTL_MS = Number.parseInt(process.env.REMIND_AGAIN_TOKEN_TTL_MS || '', 10) || (30 * 60 * 1000);
const REMIND_AGAIN_QUEUE_TTL_MS = Number.parseInt(process.env.REMIND_AGAIN_QUEUE_TTL_MS || '', 10) || (24 * 60 * 60 * 1000);
const REMIND_AGAIN_ACTION_ID = 'remind-again-10';
const REMIND_AGAIN_ACTION_LABEL = 'Remind me again in 10 minutes';
const REMIND_AGAIN_ACK_TITLE = 'Reminder scheduled';
const REMIND_AGAIN_ACK_BODY = 'We will remind you again in 10 minutes.';

const VERCEL_BASE_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
const API_BASE_URL = (process.env.API_BASE_URL || VERCEL_BASE_URL || '').replace(/\/$/, '');
const REMIND_AGAIN_API_URL = (process.env.REMIND_AGAIN_API_URL || (API_BASE_URL ? `${API_BASE_URL}/api/remind-again` : '')).trim();

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

function shouldTrigger(nowMs, targetMs, reminderMinutes) {
    const rem = Number.parseInt(reminderMinutes || '0', 10) || 0;
    if (!rem) return false;
    if (!Number.isFinite(targetMs)) return false;
    const triggerAt = targetMs - rem * 60000;
    return nowMs >= triggerAt && nowMs < triggerAt + WINDOW_MS;
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

function stringifyDataMap(map) {
    const out = {};
    Object.entries(map || {}).forEach(([key, value]) => {
        if (value === null || value === undefined) return;
        if (typeof value === 'string') out[key] = value;
        else out[key] = JSON.stringify(value);
    });
    return out;
}

async function issueRemindAgainToken(userId, context = {}) {
    if (!userId || !REMIND_AGAIN_API_URL) return null;
    const token = crypto.randomBytes(24).toString('base64url');
    const tokenHash = hashKey(`remind-again:${token}`);
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

function buildTaskActions(includeRemindAgain) {
    const actions = [{ action: 'view', title: 'View' }];
    if (includeRemindAgain) {
        actions.push({ action: REMIND_AGAIN_ACTION_ID, title: REMIND_AGAIN_ACTION_LABEL });
    }
    actions.push({ action: 'complete', title: 'Done' });
    return actions;
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
        const remindAgainQueue = userData?.remindAgainQueue || {};
        const hasPendingRemindAgain = Object.values(remindAgainQueue).some((entry) => entry && entry.status === 'pending');

        if (tokens.length === 0 && Object.keys(pushSubs).length === 0 && !hasPendingRemindAgain) continue;
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

// Load tokens for a specific user by ID (for shared subjects where user might not be in main list)
async function loadUserTokensById(userId) {
    try {
        const snap = await db.ref(`users/${userId}`).once('value');
        const userData = snap.val();
        if (!userData) return { userId, tokens: [], pushSubs: {} };
        
        const fcmTokens = userData.fcmTokens || {};
        const tokens = Object.keys(fcmTokens).filter(t => t && t.length > 20);
        const pushSubs = userData.pushSubscriptions || {};
        
        return { userId, tokens, pushSubs };
    } catch (err) {
        console.warn(`[FCM] Failed to load tokens for user ${userId}:`, err.message);
        return { userId, tokens: [], pushSubs: {} };
    }
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

    const extraData = stringifyDataMap(payload.data || {});
    const actionList = Array.isArray(payload.actions) && payload.actions.length
        ? payload.actions
        : [
            { action: 'view', title: 'View' },
            { action: 'complete', title: 'Done' }
        ];

    const message = {
        tokens: tokens,
        // Data-first payload avoids browser-managed notification clicks on some Android/FCM paths.
        data: {
            title: payload.title || 'Task Reminder',
            body: payload.body || '',
            icon: `${APP_URL}icon-192.png`,
            vibrate: JSON.stringify([200, 100, 200]),
            renotify: 'true',
            requireInteraction: 'true',
            actions: JSON.stringify(actionList),
            url: payload.url || APP_URL,
            completeUrl: payload.completeUrl || '',
            tag: payload.tag || 'reminder',
            dedupeKey: dedupeKey,
            ...extraData,
        },
        // Data-only: no android.notification to avoid system-managed notification
        // that would bypass the service worker's click handler.
        android: {
            priority: 'high'
        },
        webpush: {
            headers: {
                Urgency: 'high'
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

    const extraData = payload.data || {};

    const pushPayload = JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: `${APP_URL}icon-192.png`,
        badge: `${APP_URL}icon-192.png`,
        tag: payload.tag || 'reminder',
        data: {
            url: payload.url || APP_URL,
            completeUrl: payload.completeUrl || '',
            dedupeKey: dedupeKey,
            ...extraData
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

// Combined notification sender - prefers Web Push, falls back to FCM
async function sendNotificationToUser(userId, tokens, pushSubs, payload, dedupeKey) {
    const hasPushSubs = !!(pushSubs && Object.keys(pushSubs).length > 0);
    const hasFCMTokens = !!(tokens && tokens.length > 0);

    // Prefer Web Push subscriptions first to keep click handling bound to the active site SW.
    if (hasPushSubs) {
        const webPushResult = await sendVAPIDPush(userId, pushSubs, payload, dedupeKey);
        const sentCount = Number(webPushResult?.sent) || 0;

        if (sentCount > 0 || !hasFCMTokens) {
            return webPushResult;
        }

        console.warn(`[Notify] Web Push sent 0 for ${userId.slice(0, 8)}..., trying FCM fallback`);
        return sendFCMToUser(userId, tokens, payload, dedupeKey);
    }

    // Use FCM if no Web Push subscriptions are available.
    if (hasFCMTokens) {
        return sendFCMToUser(userId, tokens, payload, dedupeKey);
    }

    // Log when user has no notification tokens at all
    console.warn(`[Notify] User ${userId.slice(0, 8)}... has no FCM tokens or VAPID subscriptions - cannot send notification`);
    return { sent: 0, failed: 0, noTokens: true };
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

    const reminderMinutesList = normalizeTaskReminders(task.reminders, task.reminder);
    if (!reminderMinutesList.length) return { sent, skipped, failed };

    const baseDueMs = parseIsoMillis(task.dueDate);
    if (!Number.isFinite(baseDueMs)) return { sent, skipped, failed };

    // Get occurrences to check (single date for non-recurring, expanded for recurring)
    const occurrences = task.recurrence
        ? getUpcomingOccurrences(baseDueMs, task.recurrence, nowMs, 7)
        : [new Date(baseDueMs)];

    for (const occurrence of occurrences) {
        const occurrenceMs = occurrence.getTime();
        const occurrenceKey = occurrence.toISOString();
        for (const reminderMinutes of reminderMinutesList) {
            if (!shouldTrigger(nowMs, occurrenceMs, reminderMinutes)) continue;

            const offset = formatReminderOffset(reminderMinutes);
            const dedupeKey = `task|${user.userId}|${task.id}|${occurrenceKey}|${reminderMinutes}`;
            const canNotifyUser = (Array.isArray(user.tokens) && user.tokens.length > 0)
                || (user.pushSubs && Object.keys(user.pushSubs).length > 0);

            let remindAgainToken = null;
            if (canNotifyUser) {
                try {
                    remindAgainToken = await issueRemindAgainToken(user.userId, {
                        type: 'task',
                        taskId: task.id,
                        occurrence: occurrenceKey,
                        baseDedupeKey: dedupeKey,
                        baseUrl: APP_URL,
                        title: task.title || 'Task'
                    });
                } catch (err) {
                    console.warn('[RemindAgain] Failed to issue token for personal task:', err.message || err);
                }
            }

            const payload = {
                title: task.recurrence ? 'Recurring Task Reminder 🔄' : 'Task Reminder 📋',
                body: `${task.title || 'Task'} is due in ${offset}`,
                tag: `task-${task.id}-${occurrenceKey.slice(0, 10)}-${reminderMinutes}`,
                url: APP_URL,
                completeUrl: `${APP_URL}?completeTask=${task.id}&user=${user.userId}&occurrence=${encodeURIComponent(occurrenceKey)}`,
                actions: buildTaskActions(!!remindAgainToken),
                data: remindAgainToken ? {
                    remindAgainToken,
                    remindAgainEndpoint: REMIND_AGAIN_API_URL,
                    remindAgainUserId: user.userId,
                    remindAgainTaskId: task.id,
                    remindAgainSubjectId: '',
                    remindAgainOccurrence: occurrenceKey,
                    remindAgainMinutes: String(REMIND_AGAIN_DELAY_MINUTES),
                    remindAgainAckTitle: REMIND_AGAIN_ACK_TITLE,
                    remindAgainAckBody: REMIND_AGAIN_ACK_BODY
                } : {}
            };

            const result = await sendNotificationToUser(user.userId, user.tokens, user.pushSubs, payload, dedupeKey);
            if (result.skipped) skipped++;
            else { sent += result.sent; failed += result.failed; }
        }
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

async function processSharedSubjectTask(taskId, task, subjectId, allUserIds, usersCache, nowMs) {
    let sent = 0, skipped = 0, failed = 0, noTokensCount = 0;
    
    // For recurring tasks: ALWAYS check (notifications are independent of completion)
    // Recurring task reminders fire regardless of whether any occurrence is completed
    // For non-recurring tasks: skip if completed
    if (!task) return { sent, skipped, failed, noTokensCount };
    if (task.completed && !task.recurrence) return { sent, skipped, failed, noTokensCount };

    const reminderMinutesList = normalizeTaskReminders(task.reminders, task.reminder);
    if (!reminderMinutesList.length) return { sent, skipped, failed, noTokensCount };

    const baseDueMs = parseIsoMillis(task.dueDate);
    if (!Number.isFinite(baseDueMs)) return { sent, skipped, failed, noTokensCount };

    // Get occurrences to check (single date for non-recurring, expanded for recurring)
    const occurrences = task.recurrence
        ? getUpcomingOccurrences(baseDueMs, task.recurrence, nowMs, 7)
        : [new Date(baseDueMs)];

    for (const occurrence of occurrences) {
        const occurrenceMs = occurrence.getTime();
        const occurrenceKey = occurrence.toISOString();
        for (const reminderMinutes of reminderMinutesList) {
            if (!shouldTrigger(nowMs, occurrenceMs, reminderMinutes)) continue;

            const offset = formatReminderOffset(reminderMinutes);

            for (const userId of allUserIds) {
                // First try to find user in pre-loaded cache
                let userEntry = usersCache.find(u => u.userId === userId);

                // If not in cache, load tokens on-demand for this specific user
                // This ensures shared subject members without pre-loaded tokens still get checked
                if (!userEntry) {
                    userEntry = await loadUserTokensById(userId);
                }

                const dedupeKey = `shared-task|${userId}|${subjectId}|${taskId}|${occurrenceKey}|${reminderMinutes}`;

                const canNotifyUser = (Array.isArray(userEntry.tokens) && userEntry.tokens.length > 0)
                    || (userEntry.pushSubs && Object.keys(userEntry.pushSubs).length > 0);

                let remindAgainToken = null;
                if (canNotifyUser) {
                    try {
                        remindAgainToken = await issueRemindAgainToken(userId, {
                            type: 'shared-task',
                            taskId,
                            subjectId,
                            occurrence: occurrenceKey,
                            baseDedupeKey: dedupeKey,
                            baseUrl: APP_URL,
                            title: task.title || 'Task'
                        });
                    } catch (err) {
                        console.warn('[RemindAgain] Failed to issue token for shared task:', err.message || err);
                    }
                }

                const payload = {
                    title: task.recurrence ? 'Shared Recurring Task 🔄' : 'Shared Task Reminder 📋',
                    body: `${task.title || 'Task'} is due in ${offset}`,
                    tag: `shared-task-${taskId}-${occurrenceKey.slice(0, 10)}-${reminderMinutes}`,
                    url: APP_URL,
                    completeUrl: `${APP_URL}?completeTask=${taskId}&user=${userId}&sharedSubject=${subjectId}&occurrence=${encodeURIComponent(occurrenceKey)}`,
                    actions: buildTaskActions(!!remindAgainToken),
                    data: remindAgainToken ? {
                        remindAgainToken,
                        remindAgainEndpoint: REMIND_AGAIN_API_URL,
                        remindAgainUserId: userId,
                        remindAgainTaskId: taskId,
                        remindAgainSubjectId: subjectId,
                        remindAgainOccurrence: occurrenceKey,
                        remindAgainMinutes: String(REMIND_AGAIN_DELAY_MINUTES),
                        remindAgainAckTitle: REMIND_AGAIN_ACK_TITLE,
                        remindAgainAckBody: REMIND_AGAIN_ACK_BODY
                    } : {}
                };

                const result = await sendNotificationToUser(userId, userEntry.tokens, userEntry.pushSubs, payload, dedupeKey);
                if (result.skipped) skipped++;
                else if (result.noTokens) noTokensCount++;
                else { sent += result.sent; failed += result.failed; }
            }
        }
    }
    return { sent, skipped, failed, noTokensCount };
}

async function processSharedSubjects(sharedSubjects, users, nowMs) {
    let sent = 0, skipped = 0, failed = 0, noTokensCount = 0;
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
            noTokensCount += result.noTokensCount || 0;
        }
    }
    
    if (noTokensCount > 0) {
        console.log(`[Shared] ${noTokensCount} notification(s) could not be sent - users have no registered tokens`);
    }
    
    return { sent, skipped, failed };
}

async function loadTaskForRemindAgain(userId, queueItem) {
    if (!queueItem) return null;
    const type = queueItem.type || (queueItem.subjectId ? 'shared-task' : 'task');

    if (type === 'shared-task' && queueItem.subjectId && queueItem.taskId) {
        const snap = await db.ref(`sharedSubjects/${queueItem.subjectId}/tasks/${queueItem.taskId}`).once('value');
        return snap.val() || null;
    }

    if (queueItem.taskId) {
        const snap = await db.ref(`users/${userId}/tasks/${queueItem.taskId}`).once('value');
        return snap.val() || null;
    }

    return null;
}

async function processRemindAgainQueue(users, nowMs) {
    let sent = 0, skipped = 0, failed = 0;

    for (const user of users) {
        const queueSnap = await db.ref(`users/${user.userId}/remindAgainQueue`).once('value');
        const queueItems = queueSnap.val() || {};

        for (const [queueId, queueItem] of Object.entries(queueItems)) {
            if (!queueItem || queueItem.status !== 'pending') continue;

            const dueAt = Number(queueItem.dueAt) || 0;
            if (dueAt > nowMs) continue;

            const expiresAt = Number(queueItem.expiresAt) || 0;
            const itemRef = db.ref(`users/${user.userId}/remindAgainQueue/${queueId}`);

            if (expiresAt && expiresAt < nowMs) {
                await itemRef.update({ status: 'expired', updatedAt: nowMs }).catch(() => { });
                skipped++;
                continue;
            }

            const claim = await itemRef.transaction((cur) => {
                if (!cur || cur.status !== 'pending') return;
                const curDueAt = Number(cur.dueAt) || 0;
                if (curDueAt > nowMs) return;
                const curExpiresAt = Number(cur.expiresAt) || 0;
                if (curExpiresAt && curExpiresAt < nowMs) {
                    return { ...cur, status: 'expired', updatedAt: nowMs };
                }
                return { ...cur, status: 'sending', updatedAt: nowMs };
            });

            if (!claim.committed) continue;

            const currentItem = claim.snapshot.val() || {};
            if (currentItem.status !== 'sending') {
                skipped++;
                continue;
            }

            try {
                const task = await loadTaskForRemindAgain(user.userId, currentItem);
                if (!task || (task.completed && !task.recurrence)) {
                    await itemRef.update({ status: 'cancelled', updatedAt: Date.now(), reason: 'task_not_active' });
                    skipped++;
                    continue;
                }

                const occurrenceKey = currentItem.occurrence || (task.dueDate ? new Date(task.dueDate).toISOString() : '');
                const dedupeBase = currentItem.baseDedupeKey || `remind-again|${user.userId}|${currentItem.taskId || ''}|${occurrenceKey}`;
                const dedupeKey = `${dedupeBase}|again|${queueId}`;
                const title = task.title || currentItem.title || 'Task';

                let remindAgainToken = null;
                const canNotifyUser = (Array.isArray(user.tokens) && user.tokens.length > 0)
                    || (user.pushSubs && Object.keys(user.pushSubs).length > 0);

                if (canNotifyUser) {
                    try {
                        remindAgainToken = await issueRemindAgainToken(user.userId, {
                            type: currentItem.type || (currentItem.subjectId ? 'shared-task' : 'task'),
                            taskId: currentItem.taskId,
                            subjectId: currentItem.subjectId || '',
                            occurrence: occurrenceKey,
                            baseDedupeKey: dedupeKey,
                            baseUrl: currentItem.baseUrl || APP_URL,
                            title
                        });
                    } catch (err) {
                        console.warn('[RemindAgain] Failed to issue follow-up token:', err.message || err);
                    }
                }

                const type = currentItem.type || (currentItem.subjectId ? 'shared-task' : 'task');
                const completeParams = new URLSearchParams({
                    completeTask: String(currentItem.taskId || ''),
                    user: user.userId
                });
                if (currentItem.subjectId) completeParams.set('sharedSubject', String(currentItem.subjectId));
                if (occurrenceKey) completeParams.set('occurrence', occurrenceKey);

                const payload = {
                    title: type === 'shared-task' ? 'Shared Task Reminder 📋' : 'Task Reminder 📋',
                    body: `${title} — snoozed reminder`,
                    tag: `remind-again-${currentItem.taskId || queueId}`,
                    url: currentItem.baseUrl || APP_URL,
                    completeUrl: `${APP_URL}?${completeParams.toString()}`,
                    actions: buildTaskActions(!!remindAgainToken),
                    data: remindAgainToken ? {
                        remindAgainToken,
                        remindAgainEndpoint: REMIND_AGAIN_API_URL,
                        remindAgainUserId: user.userId,
                        remindAgainTaskId: String(currentItem.taskId || ''),
                        remindAgainSubjectId: String(currentItem.subjectId || ''),
                        remindAgainOccurrence: occurrenceKey,
                        remindAgainMinutes: String(REMIND_AGAIN_DELAY_MINUTES),
                        remindAgainAckTitle: REMIND_AGAIN_ACK_TITLE,
                        remindAgainAckBody: REMIND_AGAIN_ACK_BODY
                    } : {}
                };

                const result = await sendNotificationToUser(user.userId, user.tokens, user.pushSubs, payload, dedupeKey);

                if (result.noTokens) {
                    await itemRef.update({ status: 'failed', updatedAt: Date.now(), reason: 'no_tokens' });
                    failed++;
                    continue;
                }

                if (result.skipped) {
                    await itemRef.update({ status: 'sent', sentAt: Date.now(), updatedAt: Date.now(), skipped: true });
                    skipped++;
                    continue;
                }

                if ((result.sent || 0) > 0) {
                    await itemRef.update({
                        status: 'sent',
                        sentAt: Date.now(),
                        updatedAt: Date.now(),
                        successCount: result.sent || 0,
                        failedCount: result.failed || 0
                    });
                    sent += result.sent || 0;
                    failed += result.failed || 0;
                    continue;
                }

                await itemRef.update({ status: 'failed', updatedAt: Date.now(), reason: 'send_failed' });
                failed += Math.max(1, result.failed || 0);
            } catch (err) {
                await itemRef.update({ status: 'failed', updatedAt: Date.now(), reason: err.message || 'unknown_error' }).catch(() => { });
                failed++;
            }
        }
    }

    return { sent, skipped, failed };
}

async function cleanupRemindAgainArtifacts(nowMs = Date.now()) {
    const TOKEN_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
    const queueKeepMs = REMIND_AGAIN_QUEUE_TTL_MS;
    const usersSnap = await db.ref('users').once('value');
    const users = usersSnap.val() || {};

    for (const [userId, userData] of Object.entries(users)) {
        const tokens = userData?.remindAgainTokens || {};
        for (const [tokenHash, tokenData] of Object.entries(tokens)) {
            const expiresAt = Number(tokenData?.expiresAt) || 0;
            const usedAt = Number(tokenData?.usedAt) || 0;
            const createdAt = Number(tokenData?.createdAt) || 0;
            const tooOldUsed = usedAt && (nowMs - usedAt > TOKEN_KEEP_MS);
            const tooOldPending = !usedAt && createdAt && (nowMs - createdAt > TOKEN_KEEP_MS);
            if ((expiresAt && expiresAt < nowMs) || tooOldUsed || tooOldPending) {
                await db.ref(`users/${userId}/remindAgainTokens/${tokenHash}`).remove().catch(() => { });
            }
        }

        const queue = userData?.remindAgainQueue || {};
        for (const [queueId, queueData] of Object.entries(queue)) {
            const status = String(queueData?.status || '');
            const terminal = status === 'sent' || status === 'failed' || status === 'expired' || status === 'cancelled';
            const updatedAt = Number(queueData?.updatedAt) || Number(queueData?.sentAt) || Number(queueData?.requestedAt) || 0;
            const expiresAt = Number(queueData?.expiresAt) || 0;
            const pendingExpired = status === 'pending' && expiresAt && expiresAt < nowMs;
            if (pendingExpired || (terminal && updatedAt && (nowMs - updatedAt > queueKeepMs)) || (expiresAt && expiresAt < nowMs - queueKeepMs)) {
                await db.ref(`users/${userId}/remindAgainQueue/${queueId}`).remove().catch(() => { });
            }
        }
    }
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
        await processSharedSubjects(sharedSubjects, users, nowMs),
        await processRemindAgainQueue(users, nowMs)
    ];

    const final = results.reduce((acc, curr) => ({
        sent: acc.sent + curr.sent,
        skipped: acc.skipped + curr.skipped,
        failed: acc.failed + curr.failed
    }), { sent: 0, skipped: 0, failed: 0 });

    console.log(`[${new Date().toISOString()}] Result: Sent ${final.sent}, Skipped ${final.skipped}, Failed ${final.failed}`);

    await cleanupRemindAgainArtifacts(nowMs).catch((err) => {
        console.warn('[RemindAgain] Cleanup failed:', err.message || err);
    });

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
