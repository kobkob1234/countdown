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
const crypto = require('crypto');

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
        return 2 * 60 * 60 * 1000; // Fallback to UTC+2
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
// Deduplication (using Firebase)
// ============================================

async function claimOnce(path) {
    const ref = db.ref(path);
    const now = Date.now();
    const SENDING_STALE_MS = 5 * 60 * 1000;

    const res = await ref.transaction((cur) => {
        if (cur && cur.status === 'sent') return;
        if (cur && cur.status === 'sending') {
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
                    db.ref(`users/${userId}/fcmTokens/${badToken}`).remove().catch(() => { });
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
// Main Handler
// ============================================

async function runCheck() {
    const nowMs = Date.now();
    console.log(`[${new Date(nowMs).toISOString()}] Checking...`);

    const users = await loadUsersWithFCMTokens();
    const sharedEvents = await loadSharedEvents();
    const sharedSubjects = await loadSharedSubjects();

    console.log(`[FCM] Loaded ${users.length} users with tokens`);

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    // Shared events -> all users
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

        for (const { userId, tokens } of users) {
            const result = await sendFCMToUser(userId, tokens, payload, dedupeKey);
            if (result.skipped) skipped++;
            else { sent += result.sent; failed += result.failed; }
        }
    }

    // Per-user tasks
    for (const { userId, tokens } of users) {
        const tasks = await loadTasksForUser(userId);
        for (const task of tasks) {
            if (task.completed) continue;
            const reminderMinutes = Number.parseInt(task.reminder || '0', 10) || 0;
            const dueMs = parseIsoMillis(task.dueDate);
            if (!shouldTrigger(nowMs, dueMs, reminderMinutes)) continue;

            const offset = formatReminderOffset(reminderMinutes);
            const dedupeKey = `task|${userId}|${task.id}|${task.dueDate}|${reminderMinutes}`;
            const payload = {
                title: 'Task Reminder 📋',
                body: `${task.title || 'Task'} is due in ${offset}`,
                tag: `task-${task.id}`,
                url: APP_URL,
                completeUrl: `${APP_URL}?completeTask=${task.id}&user=${userId}`,
            };

            const result = await sendFCMToUser(userId, tokens, payload, dedupeKey);
            if (result.skipped) skipped++;
            else { sent += result.sent; failed += result.failed; }
        }
    }

    // Per-user planner blocks
    for (const { userId, tokens } of users) {
        const blocks = await loadPlannerBlocksForUser(userId);
        for (const block of blocks) {
            if (!block || block.completed) continue;
            const reminderMinutes = Number.parseInt(block.reminder || '0', 10) || 0;
            if (!reminderMinutes) continue;
            const startMs = parsePlannerStart(block);
            if (!shouldTrigger(nowMs, startMs, reminderMinutes)) continue;

            const blockKey = block.id || hashKey(`${block.title || ''}|${block.date || ''}|${block.start || ''}`);
            const whenStr = formatPlannerWhen(startMs);
            const dedupeKey = `planner|${userId}|${blockKey}|${block.startAt || block.date || ''}|${block.start || ''}|${reminderMinutes}`;
            const payload = {
                title: 'Planner Reminder 📅',
                body: whenStr ? `${block.title || 'Activity'} • ${whenStr}` : `${block.title || 'Activity'} starting soon`,
                tag: `planner-${blockKey}`,
                url: APP_URL,
                actions: [{ action: 'view', title: 'View' }]
            };

            const result = await sendFCMToUser(userId, tokens, payload, dedupeKey);
            if (result.skipped) skipped++;
            else { sent += result.sent; failed += result.failed; }
        }
    }

    // Shared subject tasks
    for (const subject of sharedSubjects) {
        const subjectTasks = subject.tasks || {};
        const owner = subject.owner;
        const members = subject.members || {};
        const allUserIds = [owner, ...Object.keys(members)].filter(Boolean);

        for (const [taskId, task] of Object.entries(subjectTasks)) {
            if (!task || task.completed) continue;
            const reminderMinutes = Number.parseInt(task.reminder || '0', 10) || 0;
            const dueMs = parseIsoMillis(task.dueDate);
            if (!shouldTrigger(nowMs, dueMs, reminderMinutes)) continue;

            const offset = formatReminderOffset(reminderMinutes);

            for (const userId of allUserIds) {
                const userEntry = users.find(u => u.userId === userId);
                if (!userEntry) continue;

                const dedupeKey = `shared-task|${userId}|${subject.id}|${taskId}|${task.dueDate}|${reminderMinutes}`;
                const payload = {
                    title: 'Shared Task Reminder 📋',
                    body: `${task.title || 'Task'} is due in ${offset}`,
                    tag: `shared-task-${taskId}`,
                    url: APP_URL,
                    completeUrl: `${APP_URL}?completeTask=${taskId}&user=${userId}&sharedSubject=${subject.id}`,
                };

                const result = await sendFCMToUser(userId, userEntry.tokens, payload, dedupeKey);
                if (result.skipped) skipped++;
                else { sent += result.sent; failed += result.failed; }
            }
        }
    }

    console.log(`[${new Date().toISOString()}] Result: Sent ${sent}, Skipped ${skipped}, Failed ${failed}`);
    return { sent, skipped, failed };
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
