// ============================================
// Notifications Module
// ============================================

import { AppState, $, NOTIFY_KEYS, NOTIFY_TTL_MS } from './state.js';
import { db, ref, set, remove } from './firebase-config.js';
import { delay, sha256Base64Url, isIOS, isStandalone, isPushSupported } from './utils.js';

// VAPID public key for web push
const PUSH_VAPID_PUBLIC_KEY = "BL-m24SrurFUNIQxH7S77r1yYShIiCibpw2CbtK8FwYATHzYiR0kQGKzWilEGRHyRK2jxqRPUR_RJoAVUgrO-24";
const PUSH_LOCAL_USER_KEY = 'countdown_push_subscription_user';

const NOTIFICATION_ICON = './icon-192.png';
const NOTIFICATION_BADGE = './icon-192.png';

// ============================================
// Service Worker Registration
// ============================================

export async function getPushRegistration() {
    if (!('serviceWorker' in navigator)) return null;
    return await navigator.serviceWorker.getRegistration();
}

export async function ensurePushRegistration() {
    if (!('serviceWorker' in navigator)) return null;
    const existing = await getPushRegistration();
    if (existing) return existing;
    return await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
}

// ============================================
// Push Subscription Helpers
// ============================================

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
}

async function savePushSubscriptionForUser(userId, subscription) {
    if (!userId) return;
    if (!subscription) return;
    const key = await sha256Base64Url(subscription.endpoint);
    const payload = {
        sub: subscription.toJSON(),
        ua: navigator.userAgent,
        createdAt: Date.now()
    };
    await set(ref(db, `users/${userId}/pushSubscriptions/${key}`), payload);
}

async function removePushSubscriptionForUser(userId, subscription) {
    if (!userId) return;
    if (!subscription) return;
    const key = await sha256Base64Url(subscription.endpoint);
    await remove(ref(db, `users/${userId}/pushSubscriptions/${key}`));
}

// ============================================
// System Notifications
// ============================================

export async function showSystemNotification(title, options = {}) {
    if (!("Notification" in window)) return false;
    if (Notification.permission !== 'granted') return false;

    const merged = {
        icon: NOTIFICATION_ICON,
        badge: NOTIFICATION_BADGE,
        vibrate: [200, 100, 200],
        requireInteraction: true,
        silent: false,
        ...options
    };
    merged.data = { url: window.location.href, ...(options.data || {}) };

    // Prefer Service Worker notifications (more reliable on mobile)
    if (window.isSecureContext && 'serviceWorker' in navigator) {
        try {
            const reg = await getPushRegistration();
            if (reg && typeof reg.showNotification === 'function') {
                await reg.showNotification(title, merged);
                return true;
            }
        } catch (e) { }

        try {
            const reg = await Promise.race([ensurePushRegistration(), delay(1500).then(() => null)]);
            if (reg && typeof reg.showNotification === 'function') {
                await reg.showNotification(title, merged);
                return true;
            }
        } catch (e) {
            console.warn('[Notification] Service Worker registration failed:', e);
        }
    }

    // Fallback: direct Notification API
    try {
        new Notification(title, merged);
        return true;
    } catch (e) {
        console.warn('[Notification] new Notification failed:', e);
        return false;
    }
}

// ============================================
// Reminder Sound
// ============================================

// Audio context for generating notification tones (works offline)
let audioContext = null;

function getAudioContext() {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('[Audio] Web Audio API not supported:', e);
            return null;
        }
    }
    return audioContext;
}

// Generate a pleasant notification tone using Web Audio API
// This works offline and doesn't require external resources
export function playReminderSound() {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
        // Resume audio context if suspended (required after user interaction)
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const now = ctx.currentTime;
        const volume = 0.3;

        // Create a pleasant two-tone notification sound
        const frequencies = [830, 1046]; // G5, C6 - pleasing upward interval
        const duration = 0.15;
        const gap = 0.08;

        frequencies.forEach((freq, i) => {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            oscillator.type = 'sine';
            oscillator.frequency.value = freq;

            const startTime = now + i * (duration + gap);

            // Envelope: quick attack, sustain, quick release
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01);
            gainNode.gain.setValueAtTime(volume, startTime + duration - 0.02);
            gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
        });
    } catch (e) {
        console.log('[Audio] Play failed:', e.message);
    }
}

// ============================================
// Notify Button UI
// ============================================

async function syncExistingSubscriptionToCurrentUser() {
    if (!isPushSupported()) return;
    if (!PUSH_VAPID_PUBLIC_KEY) return;

    const currentUser = AppState.currentUser;

    try {
        const reg = await getPushRegistration();
        if (!reg) return;
        let sub = await reg.pushManager.getSubscription();

        // Auto-resubscribe if permission granted but no subscription
        if (!sub && (Notification.permission === 'granted')) {
            try {
                const appServerKey = urlBase64ToUint8Array(PUSH_VAPID_PUBLIC_KEY);
                sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey });
                console.log('[Push] Auto-resubscribed');
            } catch (e) {
                console.warn('[Push] Auto-resubscribe failed:', e);
                return;
            }
        }

        if (!sub) return;
        const prevUser = localStorage.getItem(PUSH_LOCAL_USER_KEY);
        if (prevUser && prevUser !== currentUser) {
            await removePushSubscriptionForUser(prevUser, sub).catch(() => { });
        }
        await savePushSubscriptionForUser(currentUser, sub);
        localStorage.setItem(PUSH_LOCAL_USER_KEY, currentUser);
    } catch (e) {
        console.warn('[Push] Sync failed:', e);
    }
}

export async function refreshNotifyButton() {
    const notifyBtn = $('notifyBtn');
    const currentUser = AppState.currentUser;

    if (!notifyBtn) return;

    if (!("Notification" in window)) {
        notifyBtn.textContent = "🔕";
        notifyBtn.title = "Notifications are not supported in this browser";
        notifyBtn.disabled = true;
        notifyBtn.setAttribute('aria-disabled', 'true');
        notifyBtn.classList.remove('notify-enabled');
        return;
    }

    if (!window.isSecureContext) {
        notifyBtn.textContent = "🔒";
        notifyBtn.title = "Notifications require HTTPS (or localhost)";
        notifyBtn.disabled = true;
        notifyBtn.setAttribute('aria-disabled', 'true');
        notifyBtn.classList.remove('notify-enabled');
        return;
    }

    if (isIOS() && !isStandalone()) {
        notifyBtn.textContent = "📲";
        notifyBtn.title = "On iPhone/iPad: install this app (Add to Home Screen) to enable notifications";
        notifyBtn.disabled = false;
        notifyBtn.removeAttribute('aria-disabled');
        notifyBtn.setAttribute('aria-pressed', 'false');
        notifyBtn.classList.remove('notify-enabled');
        return;
    }

    notifyBtn.disabled = false;
    notifyBtn.removeAttribute('aria-disabled');

    const perm = Notification.permission;
    if (perm === 'denied') {
        notifyBtn.textContent = "🔕";
        notifyBtn.title = "Notifications blocked (enable in browser settings)";
        notifyBtn.classList.remove('notify-enabled');
        return;
    }

    if (isPushSupported()) {
        try {
            const reg = await getPushRegistration();
            const sub = reg ? await reg.pushManager.getSubscription() : null;
            if (sub && perm === 'granted') {
                notifyBtn.textContent = "🔔";
                notifyBtn.title = `✅ Push enabled for "${currentUser}" (works when closed) - click to disable`;
                notifyBtn.setAttribute('aria-pressed', 'true');
                notifyBtn.classList.add('notify-enabled');
                return;
            }
        } catch { }

        notifyBtn.textContent = "🔕";
        notifyBtn.title = perm === 'granted'
            ? "Click to enable push (works when closed)"
            : "Click to enable notifications";
        notifyBtn.setAttribute('aria-pressed', 'false');
        notifyBtn.classList.remove('notify-enabled');
        return;
    }

    // No push support - basic notifications
    if (perm === 'granted') {
        notifyBtn.textContent = "🔔";
        notifyBtn.title = "Notifications enabled (only while app is open)";
        notifyBtn.setAttribute('aria-pressed', 'true');
        notifyBtn.classList.add('notify-enabled');
    } else {
        notifyBtn.textContent = "🔕";
        notifyBtn.title = "Click to enable notifications";
        notifyBtn.setAttribute('aria-pressed', 'false');
        notifyBtn.classList.remove('notify-enabled');
    }
}

async function toggleNotificationsFromUser() {
    const currentUser = AppState.currentUser;

    if (!("Notification" in window)) {
        alert("Notifications aren't supported in this browser.");
        return;
    }
    if (!window.isSecureContext) {
        alert("Notifications require HTTPS (GitHub Pages is OK) or localhost.");
        return;
    }
    if (isIOS() && !isStandalone()) {
        alert("On iPhone/iPad, notifications require installing the PWA:\nShare → Add to Home Screen → open the app from the home screen, then enable notifications.");
        return;
    }
    if (Notification.permission === 'denied') {
        alert("Notifications are blocked for this site. Enable them in browser/OS settings and reload.");
        return;
    }

    const perm = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();

    if (perm !== 'granted') {
        await refreshNotifyButton();
        return;
    }

    if (!isPushSupported()) {
        showSystemNotification("Notifications enabled ✅", { body: "You'll get reminders while this app is open.", requireInteraction: false }).catch(() => { });
        await refreshNotifyButton();
        return;
    }

    if (!PUSH_VAPID_PUBLIC_KEY) {
        alert("To enable push while closed, set PUSH_VAPID_PUBLIC_KEY in the code and run a push-sender backend.");
        await refreshNotifyButton();
        return;
    }

    const reg = await ensurePushRegistration();
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
        const ok = confirm(`Push is enabled for "${currentUser}".\n\nDisable it on this device?`);
        if (!ok) return;
        await removePushSubscriptionForUser(currentUser, existing).catch(() => { });
        await existing.unsubscribe().catch(() => { });
        localStorage.removeItem(PUSH_LOCAL_USER_KEY);
        await refreshNotifyButton();
        return;
    }

    const appServerKey = urlBase64ToUint8Array(PUSH_VAPID_PUBLIC_KEY);
    let sub = null;
    try {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey });
        await savePushSubscriptionForUser(currentUser, sub);
        localStorage.setItem(PUSH_LOCAL_USER_KEY, currentUser);
        showSystemNotification("Push enabled ✅", { body: `Push is enabled for "${currentUser}".`, requireInteraction: false }).catch(() => { });
    } catch (e) {
        console.warn('[Push] subscribe/save failed:', e);
        try { if (sub) await sub.unsubscribe(); } catch { }
        alert("Failed to enable push notifications. Check connection and try again.");
    }
    await refreshNotifyButton();
}

// ============================================
// Notification Tracking (prevent duplicates)
// ============================================

export function pruneNotifiedMap(map) {
    const now = Date.now();
    for (const [id, entry] of map.entries()) {
        if (!entry || !entry.ts || (now - entry.ts) > NOTIFY_TTL_MS) {
            map.delete(id);
        }
    }
    return map;
}

export function loadNotifiedMap(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return new Map();
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.items || typeof parsed.items !== 'object') return new Map();
        const map = new Map();
        Object.entries(parsed.items).forEach(([id, entry]) => {
            if (entry && entry.key) map.set(id, entry);
        });
        return pruneNotifiedMap(map);
    } catch (e) {
        return new Map();
    }
}

export function persistNotifiedMap(key, map) {
    try {
        const items = {};
        map.forEach((value, id) => {
            items[id] = value;
        });
        localStorage.setItem(key, JSON.stringify({ ts: Date.now(), items }));
    } catch (e) { }
}

export function wasNotified(map, id, reminderKey) {
    const entry = map.get(id);
    return entry && entry.key === reminderKey;
}

export function markNotified(map, storageKey, id, reminderKey) {
    map.set(id, { key: reminderKey, ts: Date.now() });
    pruneNotifiedMap(map);
    persistNotifiedMap(storageKey, map);
}

export function syncNotifiedMapToIds(map, ids, storageKey) {
    let changed = false;
    map.forEach((_, id) => {
        if (!ids.has(id)) {
            map.delete(id);
            changed = true;
        }
    });
    if (changed) {
        persistNotifiedMap(storageKey, map);
    }
}

// ============================================
// Last Active Timestamp
// ============================================

export function getLastActiveTimestamp() {
    const raw = localStorage.getItem(NOTIFY_KEYS.LAST_ACTIVE);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : Date.now();
}

export function setLastActiveTimestamp(ts = Date.now()) {
    AppState.lastActiveTs = ts;
    try {
        localStorage.setItem(NOTIFY_KEYS.LAST_ACTIVE, String(ts));
    } catch (e) { }
}

// ============================================
// Initialization
// ============================================

export async function initNotifications() {
    console.log('[Notifications] Initializing...');

    // Load notification tracking maps
    AppState.notifiedEvents = loadNotifiedMap(NOTIFY_KEYS.EVENTS);
    AppState.notifiedTasks = loadNotifiedMap(NOTIFY_KEYS.TASKS);
    AppState.lastActiveTs = getLastActiveTimestamp();

    // Register service worker
    if (window.isSecureContext && 'serviceWorker' in navigator) {
        try {
            await ensurePushRegistration();
        } catch (e) {
            console.warn('[SW] register failed:', e);
        }
    }

    // Sync push subscription
    await syncExistingSubscriptionToCurrentUser();

    // Setup notify button
    const notifyBtn = $('notifyBtn');
    if (notifyBtn) {
        notifyBtn.addEventListener('click', toggleNotificationsFromUser);
    }
    await refreshNotifyButton();

    // Listen for service worker messages (e.g., subscription changes)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', async (event) => {
            if (event.data?.type === 'pushsubscriptionchange') {
                console.log('[Push] Subscription changed, re-syncing with Firebase...');
                await syncExistingSubscriptionToCurrentUser();
                await refreshNotifyButton();
            }
        });
    }

    // Register periodic background sync for Android
    if ('serviceWorker' in navigator && 'periodicSync' in (await navigator.serviceWorker.ready)) {
        try {
            const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
            if (status.state === 'granted') {
                const reg = await navigator.serviceWorker.ready;
                await reg.periodicSync.register('push-keepalive', { minInterval: 12 * 60 * 60 * 1000 });
                console.log('[Push] Periodic sync registered for background reliability');
            }
        } catch (e) {
            console.log('[Push] Periodic sync not available:', e.message);
        }
    }

    // Expose test function to console
    window.testNotification = async function () {
        if (!("Notification" in window)) {
            console.error('Notifications not supported');
            return 'Notifications not supported';
        }
        if (Notification.permission !== 'granted') {
            console.error('Notification permission not granted:', Notification.permission);
            return 'Permission: ' + Notification.permission;
        }
        const ok = await showSystemNotification("Test Notification 🔔", {
            body: "If you see this, notifications are working!",
            tag: 'test-notification',
            requireInteraction: true,
            renotify: true
        });
        if (ok) {
            console.log('Test notification sent');
            return 'Success - check your notifications!';
        }
        return 'Error: could not send notification (check browser support + permissions)';
    };
    console.log('[App] To test notifications, run: testNotification()');

    console.log('[Notifications] Initialization complete');
}
