// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                    SHARED EVENT COUNTDOWNS - MAIN CONTROLLER             ║
// ╠══════════════════════════════════════════════════════════════════════════╣
// ║  This inline script acts as the main controller, coordinating the        ║
// ║  modular components in the js/ directory.                                ║
// ║                                                                          ║
// ║  TABLE OF CONTENTS:                                                      ║
// ║  ─────────────────                                                       ║
// ║  1. FIREBASE INITIALIZATION                          (Line ~30)          ║
// ║  2. USER AUTHENTICATION                              (Line ~60)          ║
// ║  3. GLOBAL CONSTANTS & DOM REFERENCES                (Line ~100)         ║
// ║  4. EVENT/COUNTDOWN MANAGEMENT                       (Line ~200)         ║
// ║  5. CONFETTI & ANIMATIONS                            (Line ~2500)        ║
// ║  6. UNDO/REDO STACK                                  (Line ~3300)        ║
// ║  7. KEYBOARD NAVIGATION                              (Line ~3400)        ║
// ║  8. CONTEXT MENUS                                    (Line ~3430)        ║
// ║  9. TASK MANAGER                                     (Line ~3850)        ║
// ║  10. POMODORO INTEGRATION                            (Line ~4230)        ║
// ║  11. SUBJECTS/CATEGORIES                             (Line ~5800)        ║
// ║  12. TASK CALENDAR                                   (Line ~6000)        ║
// ║  13. NATURAL LANGUAGE PARSING                        (Line ~7370)        ║
// ║  14. DAILY PLANNER                                   (Line ~7890)        ║
// ║  15. INITIALIZATION                                  (Line ~9500+)       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// ============ 1. FIREBASE INITIALIZATION ============
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, get, onValue, push, remove, onChildAdded, onChildChanged, onChildRemoved, goOnline, goOffline } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { ctx } from "./context.js";
window.ctx = ctx; // Expose globally for auto-cleanup logic
import { initEvents } from "./events.js";
import { initTasks } from "./tasks.js";
import { initCalendar } from "./calendar.js";
import { createPomodoro } from "./pomodoro.js";
import { initUi } from "./ui.js";

const firebaseConfig = {
  apiKey: "AIzaSyB_IflOD8CwVLQQjqtz_ZKWzbfgCiOm2Js",
  authDomain: "countdown-463de.firebaseapp.com",
  databaseURL: "https://countdown-463de-default-rtdb.firebaseio.com",
  projectId: "countdown-463de",
  storageBucket: "countdown-463de.firebasestorage.app",
  messagingSenderId: "1016385864732",
  appId: "1:1016385864732:web:8a82e771e1f4be567a8bd9"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const eventsRef = ref(db, 'events');
Object.assign(ctx, {
  db,
  ref,
  set,
  get,
  onValue,
  push,
  remove,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  goOnline,
  goOffline,
  eventsRef
});

// ============ 2. USER AUTHENTICATION ============
const userBtn = document.getElementById('userBtn');
let currentUser = localStorage.getItem('countdown_username');

// Function to sanitize username (remove special chars)
const cleanUsername = (name) => {
  return (name || '').trim().toLowerCase().replaceAll(/[^a-z0-9_-]/g, '');
};

// Login Process
if (!currentUser) {
  const input = prompt("👋 Welcome! \nEnter a username to access your private tasks:\n(e.g., 'john123', 'sarah_work')");
  currentUser = cleanUsername(input);

  if (!currentUser) {
    currentUser = 'guest_' + Math.floor(Math.random() * 1000);
    alert("No name entered. You are logged in as: " + currentUser);
  }
  localStorage.setItem('countdown_username', currentUser);
}

// Update UI
if (userBtn) userBtn.textContent = `👤 ${currentUser}`;

// 3. PRIVATE REFERENCES (Scoped to the user)
const tasksRef = ref(db, `users/${currentUser}/tasks`);
const subjectsRef = ref(db, `users/${currentUser}/subjects`);
Object.assign(ctx, { currentUser, tasksRef, subjectsRef });

// 4. LOGOUT / SWITCH USER FUNCTION
if (userBtn) {
  userBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Use timeout to prevent instant dismissal issues
    setTimeout(() => {
      const switchUser = confirm(`You are logged in as "${currentUser}".\n\nDo you want to switch users?`);
      if (switchUser) {
        localStorage.removeItem('countdown_username');
        location.reload(); // Reload page to reset references
      }
    }, 50);
  };
}

// ============ 3. GLOBAL CONSTANTS & DOM REFERENCES ============
const COLORS = ['#667eea', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16'];
const HEBREW_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

const escapeHtml = (str) => String(str || '').replaceAll(/[&<>"']/g, (c) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[c]);
Object.assign(ctx, { COLORS, HEBREW_DAYS, HEBREW_MONTHS, escapeHtml });

const $ = id => document.getElementById(id);
const eventList = $("eventList");
const emptyState = $("emptyState");
const eventName = $("eventName");
const eventDate = $("eventDate");
const eventReminder = $("eventReminder");
const reminderCustomWrap = $("reminderCustomWrap");
const eventReminderCustomValue = $("eventReminderCustomValue");
const eventReminderCustomUnit = $("eventReminderCustomUnit");
const eventAlertModal = $("eventAlertModal");
const closeAlertBtn = $("closeAlertBtn");
const alertTitle = $("alertTitle");
const alertMessage = $("alertMessage");
const inputPanel = $("inputPanel");
const addBtn = $("addBtn");
const cancelBtn = $("cancelBtn");
const clearBtn = $("clearBtn");
const sidebar = $("sidebar");
const calendarGrid = $("calendarGrid");
const calendarTitle = $("calendarTitle");
const monthEventsEl = $("monthEvents");
const monthEventsTitle = $("monthEventsTitle");
const clearModal = $("clearModal");
const confirmClearBtn = $("confirmClearBtn");
const cancelClearModalBtn = $("cancelClearModalBtn");
ctx.clearModal = clearModal;
const themeToggle = $("themeToggle");
const notifyBtn = $("notifyBtn");
const togglePomodoro = $("togglePomodoro");
const pomodoroOverlay = $("pomodoroOverlay");



const eventNotes = $("eventNotes");
const undoToast = $("undoToast");
const undoToastMsg = $("undoToastMsg");
const shortcutsModal = $("shortcutsModal");
const shortcutsClose = $("shortcutsClose");
const helpShortcuts = $("helpShortcuts");
const dayDrawer = $("dayDrawer");
Object.assign(ctx, {
  eventList,
  emptyState,
  eventName,
  eventDate,
  eventNotes,
  inputPanel,
  themeToggle,
  notifyBtn,
  pomodoroOverlay,
  eventAlertModal,
  alertTitle,
  alertMessage,
  undoToast,
  undoToastMsg,
  shortcutsModal,
  shortcutsClose,
  helpShortcuts,
  dayDrawer
});
let shortcutsLastFocus = null;

const undoToastUndo = $("undoToastUndo");
const pomodoroCard = $("pomodoroCard");
const pomodoroTaskSelect = $("pomodoroTaskSelect");
const pomodoroPresetsEls = Array.from(document.querySelectorAll('.pomodoro-preset'));
const pomodoroFocusInput = $("pomodoroFocus");
const pomodoroBreakInput = $("pomodoroBreak");
const pomodoroLongInput = $("pomodoroLong");
const pomodoroLongEveryInput = $("pomodoroLongEvery");
const pomodoroAutoContinueEl = $("pomodoroAutoContinue");
const pomodoroSoundEl = $("pomodoroSound");
const pomodoroDisplay = $("pomodoroDisplay");
const pomodoroMode = $("pomodoroMode");
const pomodoroNext = $("pomodoroNext");
const pomodoroProgress = $("pomodoroProgress");
const pomodoroStart = $("pomodoroStart");
const pomodoroSkip = $("pomodoroSkip");
const pomodoroReset = $("pomodoroReset");
const pomodoroSessionCount = $("pomodoroSessionCount");
const pomodoroFocusMinutes = $("pomodoroFocusMinutes");
const pomodoroStreak = $("pomodoroStreak");
const pomodoroDayProgress = $("pomodoroDayProgress");
const pomodoroDayLabel = $("pomodoroDayLabel");

const STORAGE_KEYS = {
  THEME: 'countdown-theme',
  SIDEBAR_WIDTH: 'countdown-sidebar-width',
  GOOGLE_API_KEY: 'countdown-google-api-key',
  GOOGLE_CLIENT_ID: 'countdown-google-client-id'
};
const CACHE_KEYS = {
  EVENTS: 'countdown-events-cache-v1',
  TASKS_PREFIX: 'countdown-tasks-cache-v1:',
  SUBJECTS_PREFIX: 'countdown-subjects-cache-v1:'
};
Object.assign(ctx, { STORAGE_KEYS, CACHE_KEYS });

let editingId = null;
Object.defineProperty(ctx, 'editingId', { get: () => editingId, set: (val) => { editingId = val; } });
let events = [];
let eventsLoaded = false;
let hasEventsCache = false;
const eventsById = new Map();
const refs = new Map();
let tickerHandle = null;
Object.defineProperties(ctx, {
  events: { get: () => events, set: (val) => { events = val; } },
  eventsLoaded: { get: () => eventsLoaded, set: (val) => { eventsLoaded = val; } },
  hasEventsCache: { get: () => hasEventsCache, set: (val) => { hasEventsCache = val; } },
  eventsById: { value: eventsById }
});
function getEventById(id) { return eventsById.get(id); }
function upsertLocalEvent(id, data) {
  const existing = eventsById.get(id);
  if (existing) Object.assign(existing, data);
  else {
    const evt = { id, ...data };
    events.push(evt);
    eventsById.set(id, evt);
  }
}
ctx.upsertLocalEvent = upsertLocalEvent;
let currentMonth = new Date();
let eventCalendarView = 'month'; // 'month', 'week', 'day'
let eventCalendarFocusDate = new Date();
Object.defineProperties(ctx, {
  currentMonth: { get: () => currentMonth, set: (val) => { currentMonth = val; } },
  eventCalendarView: { get: () => eventCalendarView, set: (val) => { eventCalendarView = val; } },
  eventCalendarFocusDate: { get: () => eventCalendarFocusDate, set: (val) => { eventCalendarFocusDate = val; } }
});
const pendingDeletes = new Map();
let lastDeletedId = null;
const DELETE_TIMEOUT_MS = 10000;
const notifyScope = currentUser ? `:${currentUser}` : '';
const NOTIFY_KEYS = {
  EVENTS: `countdown-notified-events-v1${notifyScope}`,
  TASKS: `countdown-notified-tasks-v1${notifyScope}`,
  PLANNER: `countdown-notified-planner-v1${notifyScope}`,
  EVENTS_LAST_CHECK: `countdown-last-event-check-v1${notifyScope}`,
  TASKS_LAST_CHECK: `countdown-last-task-check-v1${notifyScope}`,
  PLANNER_LAST_CHECK: `countdown-last-planner-check-v1${notifyScope}`
};
const NOTIFY_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const NOTIFY_DEDUPE_CACHE = 'countdown-notify-dedupe-v1';
const NOTIFY_DEDUPE_TTL_MS = NOTIFY_TTL_MS;
const REMINDER_CATCHUP_MAX_MS = 1000 * 60 * 60 * 12;
const REMINDER_CATCHUP_MAX_COUNT = 6; // Limit burst after long inactivity.
const NOTIFY_CHECK_PERSIST_MS = 30000;

function loadNotifiedMap(storageKey) {
  const map = new Map();
  const now = Date.now();
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return map;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return map;
    Object.entries(parsed).forEach(([id, entry]) => {
      if (typeof entry === 'string') {
        map.set(id, { key: entry, ts: now });
        return;
      }
      if (!entry || typeof entry !== 'object') return;
      const key = entry.key;
      const ts = Number(entry.ts) || 0;
      if (!key || !ts) return;
      if (now - ts > NOTIFY_TTL_MS) return;
      map.set(id, { key, ts });
    });
  } catch (e) { }
  return map;
}

function persistNotifiedMap(storageKey, map) {
  try {
    const payload = {};
    map.forEach((entry, id) => {
      if (!entry || !entry.key) return;
      payload[id] = { key: entry.key, ts: entry.ts || Date.now() };
    });
    localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch (e) { }
}

function pruneNotifiedMap(storageKey, map, validIds) {
  const now = Date.now();
  let changed = false;
  map.forEach((entry, id) => {
    const ts = Number(entry?.ts) || 0;
    if (!entry?.key || !ts || now - ts > NOTIFY_TTL_MS || (validIds && !validIds.has(id))) {
      map.delete(id);
      changed = true;
    }
  });
  if (changed) persistNotifiedMap(storageKey, map);
}

function loadLastCheck(storageKey) {
  const raw = Number(localStorage.getItem(storageKey));
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

function getReminderWindow(lastCheck, nowMs) {
  let start = Number.isFinite(lastCheck) && lastCheck > 0 ? lastCheck : nowMs;
  if (start > nowMs) start = nowMs;
  const minStart = nowMs - REMINDER_CATCHUP_MAX_MS;
  const isCatchup = start < minStart;
  if (isCatchup) start = minStart;
  return { start, isCatchup };
}

function persistLastCheck(state, nowMs, force = false) {
  if (!force && nowMs - state.lastPersisted < NOTIFY_CHECK_PERSIST_MS) return;
  state.lastPersisted = nowMs;
  try { localStorage.setItem(state.key, String(nowMs)); } catch (e) { }
}

function buildDedupeRequest(key) {
  const safeKey = encodeURIComponent(String(key || ''));
  const base = new URL('./', window.location.href);
  return new Request(new URL(`__notify_dedupe__/${safeKey}`, base));
}

async function wasDedupeKeySeen(key, nowMs = Date.now()) {
  if (!key || !('caches' in window)) return false;
  try {
    const cache = await caches.open(NOTIFY_DEDUPE_CACHE);
    const req = buildDedupeRequest(key);
    const res = await cache.match(req);
    if (!res) return false;
    const ts = Number(await res.text()) || 0;
    if (!ts || (nowMs - ts) > NOTIFY_DEDUPE_TTL_MS) {
      await cache.delete(req);
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

async function markDedupeKeySeen(key, nowMs = Date.now()) {
  if (!key || !('caches' in window)) return;
  try {
    const cache = await caches.open(NOTIFY_DEDUPE_CACHE);
    const req = buildDedupeRequest(key);
    await cache.put(req, new Response(String(nowMs), { headers: { 'content-type': 'text/plain' } }));
  } catch (e) { }
}

const notifiedEvents = loadNotifiedMap(NOTIFY_KEYS.EVENTS);
const notifiedTasks = loadNotifiedMap(NOTIFY_KEYS.TASKS);
const notifiedPlannerBlocks = loadNotifiedMap(NOTIFY_KEYS.PLANNER);
const reminderCheckState = {
  events: { key: NOTIFY_KEYS.EVENTS_LAST_CHECK, lastCheck: loadLastCheck(NOTIFY_KEYS.EVENTS_LAST_CHECK), lastPersisted: 0 },
  tasks: { key: NOTIFY_KEYS.TASKS_LAST_CHECK, lastCheck: loadLastCheck(NOTIFY_KEYS.TASKS_LAST_CHECK), lastPersisted: 0 },
  planner: { key: NOTIFY_KEYS.PLANNER_LAST_CHECK, lastCheck: loadLastCheck(NOTIFY_KEYS.PLANNER_LAST_CHECK), lastPersisted: 0 }
};
let eventReminderCheckInFlight = false;
let taskReminderCheckInFlight = false;
let pendingEventAlerts = []; // Array to support multiple pending alerts
// Web Audio API for reminder sounds (works offline, no external dependency)
let audioContext = null;
const getAudioContext = () => {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('[Audio] Web Audio API not supported:', e);
      return null;
    }
  }
  return audioContext;
};

const getActiveEvents = () => events.filter(evt => !pendingDeletes.has(evt.id));
ctx.getActiveEvents = getActiveEvents;
const pruneNotifiedEvents = () => {
  const ids = new Set(getActiveEvents().map(evt => evt.id));
  pruneNotifiedMap(NOTIFY_KEYS.EVENTS, notifiedEvents, ids);
};

const readCache = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed.items;
  } catch (e) {
    return null;
  }
};

const writeCache = (key, items, limit) => {
  try {
    const payload = { ts: Date.now(), items: items.slice(0, limit) };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (e) { }
};
Object.assign(ctx, { readCache, writeCache });

// Web Push (works when closed) requires: HTTPS + Service Worker + a backend sender (VAPID private key).
// 1) Generate VAPID keys on your backend, then paste the PUBLIC key here.
const PUSH_VAPID_PUBLIC_KEY = "BL-m24SrurFUNIQxH7S77r1yYShIiCibpw2CbtK8FwYATHzYiR0kQGKzWilEGRHyRK2jxqRPUR_RJoAVUgrO-24";
const PUSH_LOCAL_USER_KEY = 'countdown_push_subscription_user';

const isPushSupported = () => (
  window.isSecureContext &&
  'serviceWorker' in navigator &&
  'PushManager' in window
);

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll('-', '+').replaceAll('_', '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.codePointAt(i);
  return outputArray;
};

async function getPushRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) return reg;
  return await waitForServiceWorkerReady(1500);
}

function waitForServiceWorkerReady(timeoutMs = 3000) {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve(null), timeoutMs);
  });
  return Promise.race([navigator.serviceWorker.ready, timeout]).catch(() => null);
}

async function ensurePushRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  const existing = await getPushRegistration();
  if (existing) return existing;
  const reg = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
  const readyReg = await waitForServiceWorkerReady(4000);
  return readyReg || reg;
}

const NOTIFICATION_ICON = './icon-192.png';
const NOTIFICATION_BADGE = './icon-192.png';

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isStandalone = () =>
  (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
  (typeof navigator.standalone === 'boolean' && navigator.standalone);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function showSystemNotification(title, options = {}) {
  if (!("Notification" in window)) return false;
  if (Notification.permission !== 'granted') return false;

  const merged = {
    icon: NOTIFICATION_ICON,
    // badge omitted to avoid Android white square issue (matches SW behavior)
    vibrate: [200, 100, 200],
    requireInteraction: true,
    silent: false,
    ...options
  };
  merged.data = { url: window.location.href, ...(options.data || {}) };

  // Prefer Service Worker notifications (more reliable on mobile), but never hang waiting for `ready`.
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

  // Fallback: direct Notification API (works in many browsers while the app is open).
  try {
    new Notification(title, merged);
    return true;
  } catch (e) {
    console.warn('[Notification] new Notification failed:', e);
    return false;
  }
}

async function sha256Base64Url(input) {
  const data = new TextEncoder().encode(String(input || ''));
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(digest));
  const b64 = btoa(String.fromCodePoint(...bytes));
  return b64.replaceAll('+', '-').replaceAll('/', '_').replaceAll(/=+$/g, '');
}

async function savePushSubscriptionForUser(userId, subscription) {
  if (!userId) { console.warn('[Push] Save failed: no userId'); return; }
  if (!subscription) { console.warn('[Push] Save failed: no subscription'); return; }
  const key = await sha256Base64Url(subscription.endpoint);
  const payload = {
    sub: subscription.toJSON(),
    ua: navigator.userAgent,
    createdAt: Date.now()
  };

  // Log for debugging mobile issues
  const endpointShort = subscription.endpoint.slice(0, 60);
  console.log(`[Push] Saving subscription for user="${userId}" endpoint="${endpointShort}..."`);

  // Retry up to 3 times for reliability (mobile networks can be flaky)
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await set(ref(db, `users/${userId}/pushSubscriptions/${key}`), payload);
      console.log(`[Push] Subscription saved successfully (attempt ${attempt})`);
      return;
    } catch (e) {
      lastError = e;
      console.warn(`[Push] Save attempt ${attempt} failed:`, e.message);
      if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  console.error('[Push] Failed to save subscription after 3 attempts:', lastError);
}

async function removePushSubscriptionForUser(userId, subscription) {
  if (!userId) return;
  if (!subscription) return;
  const key = await sha256Base64Url(subscription.endpoint);
  await remove(ref(db, `users/${userId}/pushSubscriptions/${key}`));
}

// Fix #5: Check for pending subscriptions saved by SW when no windows were open
async function syncPendingSubscriptionFromIndexedDB() {
  const PENDING_SUB_DB = 'countdown-pending-sub';
  const PENDING_SUB_STORE = 'subscriptions';

  try {
    // NOTE: Use 'idb' to avoid shadowing the outer Firebase 'db'
    const idb = await new Promise((resolve, reject) => {
      const request = indexedDB.open(PENDING_SUB_DB, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains(PENDING_SUB_STORE)) {
          database.createObjectStore(PENDING_SUB_STORE, { keyPath: 'id' });
        }
      };
    });

    // Read pending subscription in a short-lived transaction
    const pending = await new Promise((resolve, reject) => {
      const tx = idb.transaction(PENDING_SUB_STORE, 'readonly');
      const store = tx.objectStore(PENDING_SUB_STORE);
      const request = store.get('pending');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const storedUser = localStorage.getItem(PUSH_LOCAL_USER_KEY);
    if (storedUser && storedUser !== currentUser) {
      idb.close();
      return;
    }

    if (pending && pending.sub) {
      console.log('[Push] Found pending subscription from IndexedDB, syncing to Firebase...');
      // Create a subscription-like object for savePushSubscriptionForUser
      const subJson = pending.sub;
      const subKey = await sha256Base64Url(subJson.endpoint);
      const payload = {
        sub: subJson,
        ua: navigator.userAgent,
        createdAt: Date.now()
      };

      // Sync to Firebase using the outer Firebase 'db' reference
      await set(ref(db, `users/${currentUser}/pushSubscriptions/${subKey}`), payload);

      // Clear the pending subscription in a SEPARATE transaction
      // (IDB transactions auto-close when event loop is idle, so can't span await)
      await new Promise((resolve, reject) => {
        const tx = idb.transaction(PENDING_SUB_STORE, 'readwrite');
        const store = tx.objectStore(PENDING_SUB_STORE);
        const request = store.delete('pending');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      console.log('[Push] Synced pending subscription to Firebase and cleared from IndexedDB');
    }

    idb.close();
  } catch (e) {
    // Best effort - IndexedDB may not exist yet
    console.log('[Push] No pending subscription to sync:', e.message);
  }
}

async function syncExistingSubscriptionToCurrentUser() {
  if (!isPushSupported()) return;
  if (!PUSH_VAPID_PUBLIC_KEY) return;

  // First check for any pending subscriptions from SW
  await syncPendingSubscriptionFromIndexedDB();

  try {
    const reg = await ensurePushRegistration();
    if (!reg) return;
    let sub = await reg.pushManager.getSubscription();

    // If no subscription but permission granted, auto-resubscribe (handles expired subs)
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
    // Only update localStorage if Firebase save succeeds (prevents state mismatch)
    await savePushSubscriptionForUser(currentUser, sub);
    localStorage.setItem(PUSH_LOCAL_USER_KEY, currentUser);
  } catch (e) {
    console.warn('[Push] Sync failed:', e);
  }

}

async function refreshNotifyButton() {
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
        // PUSH ENABLED - show distinct active state
        notifyBtn.textContent = "🔔";
        notifyBtn.title = `✅ Push enabled for "${currentUser}" (works when closed) - click to disable`;
        notifyBtn.setAttribute('aria-pressed', 'true');
        notifyBtn.classList.add('notify-enabled');
        return;
      }
    } catch { }
    // Push supported but not subscribed
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
    // User dismissed the permission dialog (didn't explicitly deny)
    if (perm === 'default' && typeof showToast === 'function') {
      showToast('Permission dismissed – tap the bell again when ready.');
    }
    return;
  }

  if (!isPushSupported()) {
    showSystemNotification("Notifications enabled ✅", { body: "You’ll get reminders while this app is open.", requireInteraction: false }).catch(() => { });
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

    // Verify sync completed successfully with a short delay
    // This ensures subscription persists to Firebase before user closes app
    setTimeout(async () => {
      try {
        await syncExistingSubscriptionToCurrentUser();
        console.log('[Push] Subscription sync verified');
      } catch (e) {
        console.warn('[Push] Delayed sync verification failed:', e);
      }
    }, 1500);
  } catch (e) {
    console.warn('[Push] subscribe/save failed:', e);
    try { if (sub) await sub.unsubscribe(); } catch { }
    alert("Failed to enable push notifications. Check connection and try again.");
  }
  await refreshNotifyButton();
}

if (notifyBtn) notifyBtn.addEventListener('click', toggleNotificationsFromUser);
(async () => {
  if (window.isSecureContext && 'serviceWorker' in navigator) {
    try { await ensurePushRegistration(); } catch (e) { console.warn('[SW] register failed:', e); }
  }
  await syncExistingSubscriptionToCurrentUser();
  await refreshNotifyButton();

  // Register periodic background sync for Android push reliability
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
})();

// Test notification function - can be called from browser console
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

// Expose notification/reminder utilities on ctx for extracted modules
Object.assign(ctx, {
  showSystemNotification, getAudioContext,
  notifiedPlannerBlocks, reminderCheckState,
  getReminderWindow, persistLastCheck,
  wasDedupeKeySeen, markDedupeKeySeen,
  loadNotifiedMap, persistNotifiedMap, pruneNotifiedMap,
  NOTIFY_KEYS, REMINDER_CATCHUP_MAX_COUNT,
  notifiedEvents, notifiedTasks
});

const setEventsLoading = (isLoading) => {
  if (!eventList) return;
  eventList.classList.toggle('loading', isLoading);
};
ctx.setEventsLoading = setEventsLoading;

const syncBadge = $("syncBadge");
const syncState = { events: false, tasks: false, subjects: false };
const syncCacheUsed = { events: false, tasks: false, subjects: false };
const SYNC_TIMEOUT_MS = 15000;
const SUBJECTS_NO_CACHE_TIMEOUT_MS = 8000;
const syncTimeouts = { events: null, tasks: null, subjects: null, subjectsNoCache: null };
Object.assign(ctx, {
  syncState,
  syncCacheUsed,
  SYNC_TIMEOUT_MS,
  SUBJECTS_NO_CACHE_TIMEOUT_MS
});
const clearSyncTimeouts = (key) => {
  const keys = key === 'subjects' ? ['subjects', 'subjectsNoCache'] : [key];
  keys.forEach((timeoutKey) => {
    if (syncTimeouts[timeoutKey]) {
      clearTimeout(syncTimeouts[timeoutKey]);
      syncTimeouts[timeoutKey] = null;
    }
  });
};
const startSyncTimeout = (key, ms, reason, onTimeout) => {
  const timeoutKey = (key === 'subjects' && reason === 'no-cache') ? 'subjectsNoCache' : key;
  syncTimeouts[timeoutKey] = setTimeout(() => {
    syncTimeouts[timeoutKey] = null;
    if (syncState[key]) return;
    console.debug(`[sync] ${key} timeout after ${ms}ms (${reason}) - continuing with cache`);
    if (typeof onTimeout === 'function') onTimeout();
    markSyncReady(key, `timeout:${reason}`);
  }, ms);
};
const updateSyncBadge = () => {
  if (!syncBadge) return;
  const hasCache = Object.values(syncCacheUsed).some(Boolean);
  const ready = syncState.events && syncState.tasks && syncState.subjects;
  const total = Object.keys(syncState).length;
  const readyCount = Object.values(syncState).filter(Boolean).length;
  const percent = Math.floor((readyCount / total) * 100);
  const syncText = syncBadge.querySelector('.sync-text');
  if (syncText) syncText.textContent = ready ? 'Synced' : `Syncing ${percent}%`;
  syncBadge.classList.toggle('hidden', !hasCache || ready);
};
const markSyncReady = (key, source = 'unknown') => {
  if (syncState[key]) {
    console.debug(`[sync] ${key} already ready (${source})`);
    return;
  }
  syncState[key] = true;
  const total = Object.keys(syncState).length;
  const readyCount = Object.values(syncState).filter(Boolean).length;
  console.debug(`[sync] ${key} ready (${source}) ${readyCount}/${total}`);
  updateSyncBadge();
};
Object.assign(ctx, { clearSyncTimeouts, startSyncTimeout, updateSyncBadge, markSyncReady });

const showUndoToast = (name, id) => {
  undoToastMsg.textContent = `${name} deleted`;
  lastDeletedId = id;
  undoToast.classList.add('show');
};

const hideUndoToast = () => {
  lastDeletedId = null;
  undoToast.classList.remove('show');
};

const closeEventAlert = () => {
  if (eventAlertModal) eventAlertModal.classList.remove('open');
};
ctx.closeEventAlert = closeEventAlert;

const getReminderMinutesFromUI = () => {
  if (!eventReminder) return 0;
  const raw = eventReminder.value;
  if (raw !== 'custom') return Number.parseInt(raw, 10) || 0;

  const value = Number.parseInt(eventReminderCustomValue?.value, 10);
  const unit = eventReminderCustomUnit?.value || 'minutes';
  if (!Number.isFinite(value) || value <= 0) return null;

  const multipliers = { minutes: 1, hours: 60, days: 1440, weeks: 10080 };
  const MAX_REMINDER_MINUTES = 10080; // 1 week maximum
  const mult = multipliers[unit] || 1;
  const minutes = value * mult;
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  // Cap at maximum allowed value
  return Math.min(minutes, MAX_REMINDER_MINUTES);
};

const setReminderUIFromMinutes = (minutes) => {
  if (!eventReminder) return;
  const min = Number.parseInt(minutes, 10) || 0;
  const optionExists = Array.from(eventReminder.options).some(o => o.value === String(min));

  if (min > 0 && !optionExists) {
    eventReminder.value = 'custom';
    if (reminderCustomWrap) reminderCustomWrap.classList.remove('hidden');

    let unit = 'minutes';
    let value = min;
    if (min % 10080 === 0) {
      unit = 'weeks';
      value = Math.round(min / 10080);
    } else if (min % 1440 === 0) {
      unit = 'days';
      value = Math.round(min / 1440);
    } else if (min % 60 === 0) {
      unit = 'hours';
      value = Math.round(min / 60);
    }
    if (eventReminderCustomUnit) eventReminderCustomUnit.value = unit;
    if (eventReminderCustomValue) eventReminderCustomValue.value = String(value);
    return;
  }

  eventReminder.value = String(min);
  if (reminderCustomWrap) reminderCustomWrap.classList.add('hidden');
  if (eventReminderCustomValue) eventReminderCustomValue.value = '';
  if (eventReminderCustomUnit) eventReminderCustomUnit.value = 'minutes';
};

if (eventReminder) {
  eventReminder.addEventListener('change', () => {
    const isCustom = eventReminder.value === 'custom';
    if (reminderCustomWrap) reminderCustomWrap.classList.toggle('hidden', !isCustom);
    if (isCustom) {
      if (eventReminderCustomUnit && !eventReminderCustomUnit.value) eventReminderCustomUnit.value = 'minutes';
      if (eventReminderCustomValue && !eventReminderCustomValue.value) eventReminderCustomValue.value = '10';
      if (eventReminderCustomValue) eventReminderCustomValue.focus();
    } else {
      if (eventReminderCustomValue) eventReminderCustomValue.value = '';
      if (eventReminderCustomUnit) eventReminderCustomUnit.value = 'minutes';
    }
  });
}

if (closeAlertBtn) {
  closeAlertBtn.onclick = closeEventAlert;
}
if (eventAlertModal) {
  eventAlertModal.addEventListener('click', (e) => {
    if (e.target === eventAlertModal) closeEventAlert();
  });
}

const flushReminderChecks = () => {
  const now = Date.now();
  persistLastCheck(reminderCheckState.events, now, true);
  persistLastCheck(reminderCheckState.tasks, now, true);
  persistLastCheck(reminderCheckState.planner, now, true);
};

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    flushReminderChecks();
    return;
  }
  if (!document.hidden && pendingEventAlerts.length > 0) {
    // Show all pending alerts (FIFO order)
    for (const alert of pendingEventAlerts) {
      showEventAlert(alert.title, alert.message, true);
    }
    pendingEventAlerts = [];
  }
  checkEventReminders(Date.now());
  checkTaskReminders();
  if (window.DailyPlanner && typeof window.DailyPlanner.checkReminders === 'function') {
    window.DailyPlanner.checkReminders();
  }
  // Force Firebase reconnect when app becomes visible (fixes mobile sync issues)
  if (!document.hidden) {
    goOffline(db);
    setTimeout(() => goOnline(db), 100);
  }
});
window.addEventListener('beforeunload', flushReminderChecks);

undoToastUndo.onclick = () => {
  if (!lastDeletedId) return;
  const pending = pendingDeletes.get(lastDeletedId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingDeletes.delete(lastDeletedId);
    render();
  }
  hideUndoToast();
};

function getEventColor(id) {

  const charCode = id.codePointAt(id.length - 1);

  return COLORS[charCode % COLORS.length];

}
ctx.getEventColor = getEventColor;



$("toggleSidebar").onclick = () => {

  const wasHidden = sidebar.classList.contains("hidden");

  sidebar.classList.toggle("hidden");

  // Reset to current month when opening sidebar

  if (wasHidden) {

    currentMonth = new Date();

    renderCalendar();

  }

};



// Dark mode toggle

const initTheme = () => {

  const saved = localStorage.getItem(STORAGE_KEYS.THEME);

  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {

    document.body.classList.add('dark');

    themeToggle.textContent = '☀️';

  }

};

initTheme();

themeToggle.onclick = () => {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  themeToggle.textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem(STORAGE_KEYS.THEME, isDark ? 'dark' : 'light');
};

const calendarApi = initCalendar();
const { renderCalendar, scheduleCalendarRender, openDayDrawer, closeDayDrawer } = calendarApi;
Object.assign(ctx, { renderCalendar, scheduleCalendarRender, openDayDrawer, closeDayDrawer });

// ============ 4. EVENT/COUNTDOWN MANAGEMENT ============

// Persist sidebar width
const savedWidth = localStorage.getItem(STORAGE_KEYS.SIDEBAR_WIDTH);
if (savedWidth) sidebar.style.width = savedWidth;

const resizeObserver = new ResizeObserver(() => {
  localStorage.setItem(STORAGE_KEYS.SIDEBAR_WIDTH, sidebar.style.width || sidebar.offsetWidth + 'px');
});
resizeObserver.observe(sidebar);

function parseLocal(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, Y, Mo, D, H, Mi] = match;
  return new Date(+Y, +Mo - 1, +D, +H, +Mi, 0, 0);
}

function toLocalDatetime(isoString) {
  const d = new Date(isoString);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDateKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
Object.assign(ctx, { parseLocal, toLocalDatetime, toDateKey });

const eventsApi = initEvents({
  onEventsUpdated: () => {
    pruneNotifiedEvents();
    render();
    scheduleCalendarRender();
    startTicker();
    if (typeof runAutoDeleteEventsCleanup === 'function') runAutoDeleteEventsCleanup();
    if (window.DailyPlanner && typeof window.DailyPlanner.refreshEvents === 'function') {
      window.DailyPlanner.refreshEvents();
    }
  },
  onEventsCacheLoaded: () => {
    pruneNotifiedEvents();
    render();
    scheduleCalendarRender();
    startTicker();
    if (window.DailyPlanner && typeof window.DailyPlanner.refreshEvents === 'function') {
      window.DailyPlanner.refreshEvents();
    }
  }
});
const { saveToCloud, updateInCloud, deleteFromCloud, clearAllCloud } = eventsApi;
Object.assign(ctx, { saveToCloud, updateInCloud, deleteFromCloud, clearAllCloud });

function formatDate(iso) {
  const d = new Date(iso);
  const day = d.getDate();
  const month = d.toLocaleString('he-IL', { month: 'short' });
  const weekday = d.toLocaleString('he-IL', { weekday: 'short' });
  const time = d.toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return `${weekday}, ${day} ${month}, ${time}`;
}

function formatReminderOffset(minutes) {
  if (minutes >= 1440) {
    const days = Math.round(minutes / 1440);
    return days === 1 ? '1 day' : `${days} days`;
  }
  if (minutes >= 60) {
    const hours = Math.round(minutes / 60);
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}
Object.assign(ctx, { formatDate, formatReminderOffset });

function playReminderSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    // Resume audio context if suspended (required after user interaction)
    if (ctx.state === 'suspended') ctx.resume();
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

function showEventAlert(title, message, playSound = false) {
  if (!eventAlertModal) return;
  if (alertTitle) alertTitle.textContent = title;
  if (alertMessage) alertMessage.textContent = message;
  eventAlertModal.classList.add('open');
  // Native notification sound is used instead of custom playReminderSound()
}

async function triggerAlert(evt, nowMs = Date.now()) {
  const eventTime = new Date(evt.date).getTime();
  if (!Number.isFinite(eventTime)) return;
  const diffMinutes = Math.round((eventTime - nowMs) / 60000);
  let msg = '';
  let inAppMsg = '';
  if (diffMinutes > 0) {
    const timeString = formatReminderOffset(Math.max(1, diffMinutes));
    msg = `${evt.name} starts in ${timeString}!`;
    inAppMsg = `Starting in ${timeString}`;
  } else if (diffMinutes < 0) {
    const timeString = formatReminderOffset(Math.max(1, Math.abs(diffMinutes)));
    msg = `${evt.name} started ${timeString} ago`;
    inAppMsg = `Started ${timeString} ago`;
  } else {
    msg = `${evt.name} starts now!`;
    inAppMsg = 'Starting now';
  }

  showSystemNotification("Event Reminder ⏰", {
    body: msg,
    tag: `event-${evt.id || evt.name || 'reminder'}`,
    renotify: true
  }).catch(() => { });

  // Show in-app alert if visible, or queue for later
  if (document.hidden) {
    pendingEventAlerts.push({ title: evt.name, message: inAppMsg });
  } else {
    showEventAlert(evt.name, inAppMsg, true);
  }
}

function calcTime(target) {
  const diff = Math.max(0, new Date(target).getTime() - Date.now());
  return {
    ended: diff === 0,
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000)
  };
}
ctx.calcTime = calcTime;

function startEdit(id) {
  const evt = events.find(e => e.id === id);
  if (!evt) return;

  // Detect mobile - input panel is hidden on mobile
  const isMobile = window.innerWidth <= 768 ||
    document.body.classList.contains('is-mobile') ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches && window.innerWidth <= 1024);

  if (isMobile) {
    // Inline mobile bottom sheet handling to avoid timing issues
    const mobileEventSheet = document.getElementById('mobileEventSheet');
    const mobileEventSheetBackdrop = document.getElementById('mobileEventSheetBackdrop');
    const mobileSheetTitle = document.getElementById('mobileSheetTitle');
    const mobileSheetAdd = document.getElementById('mobileSheetAdd');
    const mobileEventName = document.getElementById('mobileEventName');
    const mobileEventDate = document.getElementById('mobileEventDate');
    const mobileEventReminder = document.getElementById('mobileEventReminder');
    const mobileEventNotes = document.getElementById('mobileEventNotes');

    if (mobileEventSheet && mobileEventSheetBackdrop) {
      // Set edit id on the sheet for the save handler to use
      mobileEventSheet.dataset.editingId = id;

      // Populate form with event data
      if (mobileSheetTitle) mobileSheetTitle.textContent = 'עריכת אירוע ✏️';
      if (mobileSheetAdd) mobileSheetAdd.textContent = 'שמור שינויים ✓';
      if (mobileEventName) mobileEventName.value = evt.name || '';
      if (mobileEventDate) mobileEventDate.value = toLocalDatetime(evt.date) || '';
      if (mobileEventReminder) mobileEventReminder.value = String(evt.reminder || 0);
      if (mobileEventNotes) mobileEventNotes.value = evt.notes || '';

      // Open sheet
      mobileEventSheetBackdrop.classList.add('open');
      mobileEventSheet.classList.add('open');
      document.body.style.overflow = 'hidden';

      setTimeout(() => mobileEventName?.focus(), 350);
      return;
    }
  }

  // Desktop flow
  editingId = id;
  eventName.value = evt.name;
  eventDate.value = toLocalDatetime(evt.date);
  eventNotes.value = evt.notes || '';
  setReminderUIFromMinutes(evt.reminder || 0);
  addBtn.textContent = "Save";
  cancelBtn.style.display = "block";
  clearBtn.style.display = "none";
  inputPanel.classList.add("editing");
  eventName.focus();
}

function cancelEdit() {
  editingId = null;
  eventName.value = "";
  eventDate.value = "";
  eventNotes.value = "";
  setReminderUIFromMinutes(0);
  addBtn.textContent = "Add Event";
  cancelBtn.style.display = "none";
  clearBtn.style.display = "block";
  inputPanel.classList.remove("editing");
}
ctx.cancelEdit = cancelEdit;

function setEventReminder(id, minutes) {
  const evt = events.find(e => e.id === id);
  if (!evt) return;

  const eventRef = ref(db, `events/${id}`);
  set(eventRef, { ...evt, reminder: minutes || null, reminderUserSet: !!minutes });
}

// Close reminder dropdowns when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.event-reminder-wrap')) {
    document.querySelectorAll('.event-reminder-dropdown.open').forEach(d => d.classList.remove('open'));
  }
});

function render() {
  refs.clear();
  const frag = document.createDocumentFragment();
  // Use getActiveEvents() to account for pending deletes
  emptyState.style.display = getActiveEvents().length ? "none" : "block";

  const now = Date.now();

  const sorted = [...events].filter(e => {
    // Hide pending deletes
    if (pendingDeletes.has(e.id)) return false;
    // Hide imported events from the countdown list (but keep them for planner)
    if (e.externalId || (e.notes && e.notes.includes('[Imported'))) return false;
    return true;
  }).sort((a, b) => {
    // First sort by pinned status
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;

    // Then by time
    const aTime = new Date(a.date).getTime();
    const bTime = new Date(b.date).getTime();
    const aEnded = aTime <= now;
    const bEnded = bTime <= now;

    if (!aEnded && bEnded) return -1;
    if (aEnded && !bEnded) return 1;
    return aTime - bTime;
  });

  const conflicts = findConflictingEvents(sorted);

  sorted.forEach((evt) => {
    const color = getEventColor(evt.id);
    const t = calcTime(evt.date);
    const hasConflict = conflicts.has(evt.id);

    const row = document.createElement("div");
    row.className = `event-row ${evt.highlighted ? 'highlighted' : ''}`;
    row.dataset.id = evt.id;
    // Set event color for mobile accent bar
    row.style.setProperty('--event-color', color);
    row.style.setProperty('--event-color-soft', `${color}1a`);

    const dot = document.createElement("span");
    dot.className = "color-dot";
    dot.style.background = color;

    const info = document.createElement("div");
    info.className = "event-info";

    const name = document.createElement("div");
    name.className = "event-name";
    name.textContent = evt.name;

    const date = document.createElement("div");
    date.className = "event-date";
    date.dataset.iso = evt.date;
    date.textContent = formatDate(evt.date);

    info.appendChild(name);
    info.appendChild(date);

    if (hasConflict) {
      const conflict = document.createElement("div");
      conflict.className = "conflict-badge";
      conflict.innerHTML = `<span class="conflict-dot"></span><span>חפיפה עם אירוע קרוב</span>`;
      info.appendChild(conflict);
    }

    if (evt.notes) {
      const notes = document.createElement("div");
      notes.className = "event-notes";
      notes.textContent = evt.notes;
      info.appendChild(notes);
      if (evt.notes.length > 60 || evt.notes.includes('\n')) {
        const toggle = document.createElement("span");
        toggle.className = "notes-toggle";
        toggle.textContent = "הצג עוד";
        toggle.onclick = (e) => {
          e.stopPropagation();
          notes.classList.toggle('expanded');
          toggle.textContent = notes.classList.contains('expanded') ? "הסתר" : "הצג עוד";
        };
        info.appendChild(toggle);
      }
    }

    const timer = document.createElement("div");
    timer.className = "timer";

    const units = [
      { key: 's', label: 'Sec' },
      { key: 'm', label: 'Min' },
      { key: 'h', label: 'Hrs' },
      { key: 'd', label: 'Days' }
    ];

    units.forEach(({ key, label }) => {
      const unit = document.createElement("div");
      unit.className = "time-unit";

      const val = document.createElement("span");
      val.className = `time-val time-${key}`;
      val.style.color = color;
      val.textContent = key === 'd' ? t[key] : String(t[key]).padStart(2, '0');

      const lbl = document.createElement("div");
      lbl.className = "time-label";
      lbl.textContent = label;

      unit.appendChild(val);
      unit.appendChild(lbl);
      timer.appendChild(unit);
    });

    const badge = document.createElement("span");
    badge.className = `badge ${t.ended ? 'badge-ended' : 'badge-upcoming'}`;
    badge.textContent = t.ended ? 'Ended' : 'Upcoming';

    const starBtn = document.createElement("button");
    starBtn.className = `star-btn ${evt.highlighted ? 'active' : ''}`;
    starBtn.setAttribute("aria-label", "Highlight event");
    starBtn.textContent = "☆";

    const pinBtn = document.createElement("button");
    pinBtn.className = `pin-btn ${evt.pinned ? 'pinned' : ''}`;
    pinBtn.setAttribute("aria-label", evt.pinned ? "Unpin event" : "Pin event");
    pinBtn.title = evt.pinned ? "Unpin" : "Pin to top";
    pinBtn.textContent = "📌";

    const editBtn = document.createElement("button");
    editBtn.className = "edit-btn";
    editBtn.setAttribute("aria-label", "Edit event");
    editBtn.title = "Edit";
    editBtn.textContent = "✎";

    // Reminder button with dropdown
    const reminderWrap = document.createElement("div");
    reminderWrap.className = "event-reminder-wrap";

    const reminderBtn = document.createElement("button");
    reminderBtn.className = `reminder-btn ${evt.reminder ? 'has-reminder' : ''}`;
    reminderBtn.setAttribute("aria-label", "Set reminder");
    reminderBtn.title = evt.reminder ? `תזכורת ${evt.reminder} דקות לפני` : "הגדר תזכורת";
    reminderBtn.textContent = "🔔";

    const reminderDropdown = document.createElement("div");
    reminderDropdown.className = "event-reminder-dropdown";
    const reminderOptions = [
      { label: 'דקה אחת', value: 1 },
      { label: '5 דקות', value: 5 },
      { label: '15 דקות', value: 15 },
      { label: 'שעה', value: 60 },
      { label: 'יום', value: 1440 },
      { label: 'הסר תזכורת', value: 0, remove: true }
    ];
    reminderOptions.forEach(opt => {
      if (opt.remove && !evt.reminder) return; // Only show remove if there's a reminder
      const optEl = document.createElement("div");
      optEl.className = `event-reminder-option ${opt.remove ? 'remove' : ''} ${evt.reminder === opt.value ? 'active' : ''}`;
      optEl.textContent = opt.label;
      optEl.onclick = (e) => {
        e.stopPropagation();
        setEventReminder(evt.id, opt.value);
        reminderDropdown.classList.remove('open');
      };
      reminderDropdown.appendChild(optEl);
    });

    reminderBtn.onclick = (e) => {
      e.stopPropagation();
      // Close other dropdowns
      document.querySelectorAll('.event-reminder-dropdown.open').forEach(d => {
        if (d !== reminderDropdown) d.classList.remove('open');
      });
      reminderDropdown.classList.toggle('open');
    };

    reminderWrap.appendChild(reminderBtn);
    reminderWrap.appendChild(reminderDropdown);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.setAttribute("aria-label", "Delete event");
    deleteBtn.textContent = "×";

    const actions = document.createElement("div");
    actions.className = "event-actions";
    actions.appendChild(pinBtn);
    actions.appendChild(starBtn);
    actions.appendChild(reminderWrap);
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    row.appendChild(dot);
    row.appendChild(timer);
    row.appendChild(badge);
    row.appendChild(info);
    row.appendChild(actions);

    enableInlineEventTitle(name, evt.id);
    enableInlineEventDate(date, evt.id);

    // Right-click context menu for events
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showEventContextMenu(e.clientX, e.clientY, evt.id);
    });

    refs.set(evt.id, {
      row,
      dEl: row.querySelector(".time-d"),
      hEl: row.querySelector(".time-h"),
      mEl: row.querySelector(".time-m"),
      sEl: row.querySelector(".time-s"),
      badge: badge,
      target: new Date(evt.date).getTime()
    });

    frag.appendChild(row);
  });

  eventList.replaceChildren(frag);

  tick();
}

function findConflictingEvents(list, thresholdMinutes = 30) {
  if (!Array.isArray(list) || list.length < 2) return new Set();
  const thresholdMs = thresholdMinutes * 60000;
  // Assume `list` is already sorted by date (render() prepares a sorted list)
  const conflicts = new Set();
  for (let i = 0; i < list.length - 1; i++) {
    const current = list[i];
    const next = list[i + 1];
    const diff = Math.abs(new Date(next.date) - new Date(current.date));
    if (diff < thresholdMs) {
      conflicts.add(current.id);
      conflicts.add(next.id);
    }
  }
  return conflicts;
}

function inlineEdit(el, { type = 'text', value = '', className = 'inline-edit-input', step, onSave }) {
  el.style.cursor = 'text';
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (el.dataset.editing === '1') return;
    el.dataset.editing = '1';

    const input = document.createElement('input');
    input.type = type;
    input.value = value;
    input.className = className;
    if (step) input.step = step;

    const original = el.textContent;
    el.replaceWith(input);
    input.focus();
    input.select();

    let cancelled = false;
    const finish = (commit) => {
      if (input.parentElement) input.replaceWith(el);
      delete el.dataset.editing;
      if (commit && typeof onSave === 'function') onSave(input.value, original, el);
    };

    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') finish(true);
      else if (ev.key === 'Escape') {
        cancelled = true;
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(!cancelled));
  });
}

function enableInlineEventTitle(el, eventId) {
  inlineEdit(el, {
    value: el.textContent.trim(),
    onSave: (val, original) => {
      const newName = val.trim();
      const evt = events.find(e => e.id === eventId);
      if (!evt || !newName) {
        el.textContent = original;
        return;
      }
      el.textContent = newName;
      updateInCloud(eventId, { ...evt, name: newName });
    }
  });
}

function enableInlineEventDate(el, eventId) {
  inlineEdit(el, {
    type: 'datetime-local',
    value: toLocalDatetime(el.dataset.iso || events.find(e => e.id === eventId)?.date || new Date().toISOString()),
    className: 'inline-edit-input small',
    step: 60,
    onSave: (val, original) => {
      const parsed = parseLocal(val);
      const evt = events.find(e => e.id === eventId);
      if (!evt || !parsed || Number.isNaN(parsed.getTime())) {
        el.textContent = original;
        return;
      }
      const iso = parsed.toISOString();
      el.textContent = formatDate(iso);
      el.dataset.iso = iso;
      updateInCloud(eventId, { ...evt, date: iso });
    }
  });
}

async function checkEventReminders(nowMs = Date.now()) {
  if (eventReminderCheckInFlight) return;
  eventReminderCheckInFlight = true;
  try {
    const state = reminderCheckState.events;
    const { start, isCatchup } = getReminderWindow(state.lastCheck, nowMs);
    const candidates = [];

    getActiveEvents().forEach(evt => {
      const isImported = evt.externalId || (evt.notes && evt.notes.includes('[Imported'));
      if (isImported && !evt.reminderUserSet) return;
      const reminderMinutes = Number.parseInt(evt.reminder, 10) || 0;
      if (!reminderMinutes) return;
      const reminderKey = `${evt.date || ''}|${reminderMinutes}`;
      const entry = notifiedEvents.get(evt.id);
      if (entry && entry.key === reminderKey) return;
      const eventTime = new Date(evt.date).getTime();
      if (!Number.isFinite(eventTime)) return;
      const triggerTime = eventTime - (reminderMinutes * 60000);
      if (triggerTime < start || triggerTime > nowMs) return;
      // Dedupe key matches server format: event|id|date|reminder
      const dedupeKey = `event|${evt.id}|${evt.date || ''}|${reminderMinutes}`;
      candidates.push({ evt, reminderKey, triggerTime, dedupeKey });
    });

    if (candidates.length) {
      if (isCatchup && candidates.length > REMINDER_CATCHUP_MAX_COUNT) {
        candidates.sort((a, b) => b.triggerTime - a.triggerTime);
        candidates.length = REMINDER_CATCHUP_MAX_COUNT;
      } else {
        candidates.sort((a, b) => a.triggerTime - b.triggerTime);
      }
      for (const item of candidates) {
        if (item.dedupeKey && await wasDedupeKeySeen(item.dedupeKey, nowMs)) {
          notifiedEvents.set(item.evt.id, { key: item.reminderKey, ts: nowMs });
          continue;
        }
        if (item.dedupeKey) await markDedupeKeySeen(item.dedupeKey, nowMs);
        triggerAlert(item.evt, nowMs);
        notifiedEvents.set(item.evt.id, { key: item.reminderKey, ts: nowMs });
      }
      persistNotifiedMap(NOTIFY_KEYS.EVENTS, notifiedEvents);
    }

    state.lastCheck = nowMs;
    persistLastCheck(state, nowMs);
  } catch (e) {
    console.warn('[Notifications] Event reminder check failed:', e);
  } finally {
    eventReminderCheckInFlight = false;
  }
}

function tick() {
  const now = Date.now();

  refs.forEach((ref) => {
    const diff = Math.max(0, ref.target - now);
    const ended = diff === 0;

    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);

    ref.dEl.textContent = d;
    ref.hEl.textContent = String(h).padStart(2, '0');
    ref.mEl.textContent = String(m).padStart(2, '0');
    ref.sEl.textContent = String(s).padStart(2, '0');

    ref.badge.className = `badge ${ended ? 'badge-ended' : 'badge-upcoming'}`;
    ref.badge.textContent = ended ? 'Ended' : 'Upcoming';
  });

  const nowMs = now;
  checkEventReminders(nowMs);
}

function startTicker() {
  if (tickerHandle) return; // already running
  const loop = () => {
    tick();
    const msToNext = 1000 - (Date.now() % 1000);
    tickerHandle = setTimeout(loop, msToNext);
  };
  loop();
}

addBtn.onclick = () => {
  const name = eventName.value.trim();
  const dateValue = eventDate.value;
  const notes = eventNotes.value.trim();
  const reminderVal = getReminderMinutesFromUI();

  if (!name || !dateValue) {
    alert("Please enter both event name and date");
    return;
  }
  if (reminderVal === null) {
    alert("Please enter a valid custom reminder (positive number).");
    return;
  }

  const parsedDate = parseLocal(dateValue);
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    alert("Invalid date");
    return;
  }

  if (editingId) {
    const evt = events.find(e => e.id === editingId);
    updateInCloud(editingId, {
      name,
      date: parsedDate.toISOString(),
      notes: notes || null,
      reminder: reminderVal,
      reminderUserSet: reminderVal > 0,
      highlighted: evt ? evt.highlighted : false,
      pinned: evt ? evt.pinned : false
    });
    cancelEdit();
  } else {
    saveToCloud({
      name,
      date: parsedDate.toISOString(),
      notes: notes || null,
      reminder: reminderVal,
      reminderUserSet: reminderVal > 0,
      highlighted: false,
      pinned: false
    });
    eventName.value = "";
    eventDate.value = "";
    eventNotes.value = "";
    setReminderUIFromMinutes(0);
    eventName.focus();
  }
};

cancelBtn.onclick = cancelEdit;

eventName.onkeypress = e => {
  if (e.key === 'Enter') addBtn.click();
};

eventDate.onkeypress = e => {
  if (e.key === 'Enter') addBtn.click();
};

// Auto-advance: when datetime-local value is complete, focus stays for time editing
eventDate.addEventListener('input', () => {
  const val = eventDate.value;
  // datetime-local format: YYYY-MM-DDTHH:MM
  if (val && val.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) {
    // Value is complete - user can now adjust time or press Enter
    // No action needed, browser handles focus within datetime-local
  }
});

const openClearModal = () => {
  if (!events.length) return;
  clearModal.classList.add("open");
};

const closeClearModal = () => {
  clearModal.classList.remove("open");
};
ctx.closeClearModal = closeClearModal;

clearBtn.onclick = openClearModal;
cancelClearModalBtn.onclick = closeClearModal;
confirmClearBtn.onclick = () => {
  clearAllCloud();
  closeClearModal();
};

clearModal.addEventListener("click", (e) => {
  if (e.target === clearModal) closeClearModal();
});

const uiApi = initUi();
const {
  openShortcuts,
  closeShortcuts,
  toggleShortcuts,
  openGuide,
  closeGuide,
  toggleGuide,
  openCommandPalette,
  closeCommandPalette,
  toggleCommandPalette,
  focusQuickAdd,
  goToToday,
  openPomodoro,
  closePomodoro,
  toggleCalendarSidebar,
  openTasksView,
  openCountdownView,
  focusTaskSearch,
  toggleTheme
} = uiApi;
Object.assign(ctx, {
  openShortcuts,
  closeShortcuts,
  toggleShortcuts,
  openGuide,
  closeGuide,
  toggleGuide,
  openCommandPalette,
  closeCommandPalette,
  toggleCommandPalette,
  focusQuickAdd,
  goToToday,
  openPomodoro,
  closePomodoro,
  toggleCalendarSidebar,
  openTasksView,
  openCountdownView,
  focusTaskSearch,
  toggleTheme
});

const isEditableTarget = (el) => {
  if (!el) return false;
  const tag = el.tagName;
  return el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};
ctx.isEditableTarget = isEditableTarget;

// ============ 5. CONFETTI ANIMATION (extracted to js/inline/confetti.js) ============
import { createConfetti } from './inline/confetti.js';

// ============ 6-7. UNDO/REDO + KEYBOARD NAV (extracted to js/inline/undo-redo-keyboard.js) ============
import { initUndoRedoKeyboard } from './inline/undo-redo-keyboard.js';
initUndoRedoKeyboard();

// ============ 8. CONTEXT MENUS (extracted to js/inline/context-menus.js) ============
import { initContextMenus } from './inline/context-menus.js';
initContextMenus();

eventList.onclick = e => {
  const row = e.target.closest(".event-row");
  if (!row) return;
  const id = row.dataset.id;

  // Don't handle clicks on inline edit targets or inputs
  if (e.target.closest('.event-name') || e.target.closest('.event-date') || e.target.tagName === 'INPUT') {
    return;
  }

  if (e.target.closest(".delete-btn")) {
    if (editingId === id) cancelEdit();
    const existing = pendingDeletes.get(id);
    if (existing) clearTimeout(existing.timer);
    const evt = events.find(evt => evt.id === id);
    const timer = setTimeout(() => {
      deleteFromCloud(id);
      pendingDeletes.delete(id);
      if (lastDeletedId === id) hideUndoToast();
    }, DELETE_TIMEOUT_MS);
    pendingDeletes.set(id, { timer });
    // Preserve scroll position during re-render
    const scrollPos = window.scrollY;
    render();
    requestAnimationFrame(() => window.scrollTo(0, scrollPos));
    showUndoToast(evt ? evt.name : 'Event', id);
  } else if (e.target.closest(".edit-btn")) {
    startEdit(id);
  } else if (e.target.closest(".star-btn")) {
    const evt = events.find(evt => evt.id === id);
    if (evt) {
      updateInCloud(id, { ...evt, highlighted: !evt.highlighted });
    }
  } else if (e.target.closest(".pin-btn")) {
    const evt = events.find(evt => evt.id === id);
    if (evt) {
      updateInCloud(id, { ...evt, pinned: !evt.pinned });
    }
  }
};

renderCalendar();
startTicker();

// ============ 9. TASK MANAGER ============

const taskManagerOverlay = $("taskManagerOverlay");

const closeTaskManager = $("closeTaskManager");

const toggleTasks = $("toggleTasks");
const taskSearch = $("taskSearch");
const quickAddTask = $("quickAddTask");
const quickAddRow = $("quickAddRow");
const newTaskTitle = $("newTaskTitle");
const newTaskDue = $("newTaskDue");
const newTaskRecurrence = $("newTaskRecurrence");
const newTaskReminder = $("newTaskReminder");
const addTaskBtn = $("addTaskBtn");
const taskPriorityPicker = $("taskPriorityPicker");
const activeTasks = $("activeTasks");
const completedTasks = $("completedTasks");
const activeSection = $("activeSection");
const completedSection = $("completedSection");
const tasksEmpty = $("tasksEmpty");
const taskEditModal = $("taskEditModal");
const editTaskTitle = $("editTaskTitle");
const editTaskContent = $("editTaskContent");
const editTaskChecklist = $("editTaskChecklist");
const newChecklistItem = $("newChecklistItem");
const addChecklistItem = $("addChecklistItem");
const editTaskPriority = $("editTaskPriority");
const editTaskDue = $("editTaskDue");
const editTaskDuration = $("editTaskDuration");
const editTaskRecurrence = $("editTaskRecurrence");
const editTaskReminder = $("editTaskReminder");
const clearDueBtn = $("clearDueBtn");
const duplicateTaskBtn = $("duplicateTaskBtn");
Object.assign(ctx, {
  taskManagerOverlay,
  taskSearch,
  quickAddRow,
  newTaskTitle,
  newTaskDue
});
const deleteTaskBtn = $("deleteTaskBtn");
const saveTaskBtn = $("saveTaskBtn");
const quickTaskColorPicker = $("quickTaskColorPicker");
const taskColorPicker = $("taskColorPicker");
const addSubjectBtn = $("addSubjectBtn");
const addSubjectSidebarBtn = $("addSubjectSidebarBtn");
const smartViewsList = $("smartViewsList");
const subjectModal = $("subjectModal");
const subjectModalTitle = $("subjectModalTitle");
const subjectNameInput = $("subjectNameInput");
const subjectColorPicker = $("subjectColorPicker");
const cancelSubjectBtn = $("cancelSubjectBtn");
const deleteSubjectBtn = $("deleteSubjectBtn");
const saveSubjectBtn = $("saveSubjectBtn");
const newTaskSubject = $("newTaskSubject");
const editTaskSubject = $("editTaskSubject");
const parentSubjectSelect = $("parentSubjectSelect");
const contextMenu = $("contextMenu");
const eventContextMenu = $("eventContextMenu");
const reminderModal = $("reminderModal");
const subjectsList = $("subjectsList");

// Task sort UI elements
const taskSortBtn = $("taskSortBtn");
const taskSortLabel = $("taskSortLabel");
const taskSortMenu = $("taskSortMenu");
let currentTaskSort = localStorage.getItem('task-sort-preference') || 'dueDate';
const SORT_LABELS = {
  dueDate: '📅 תאריך',
  priority: '⚡ עדיפות',
  created: '🕐 חדש',
  createdOldest: '📆 ישן',
  title: '🔤 שם'
};

// Limit year input to 4 digits for all datetime-local inputs
const dateInputs = [eventDate, newTaskDue, editTaskDue];
dateInputs.forEach(input => {
  if (!input) return;

  input.addEventListener('input', (e) => {
    const value = e.target.value;
    if (!value) return;

    // Check if year exceeds 4 digits
    const yearMatch = value.match(/^(\d+)-/);
    if (yearMatch && yearMatch[1].length > 4) {
      // Truncate to 4 digits
      const truncatedYear = yearMatch[1].substring(0, 4);
      e.target.value = value.replace(/^\d+-/, truncatedYear + '-');
    }
  });

  // Also set max attribute
  input.setAttribute('max', '9999-12-31T23:59');
});

let tasks = [];
let tasksLoaded = false;
let hasTasksCache = false;
Object.defineProperties(ctx, {
  tasks: { get: () => tasks, set: (val) => { tasks = val; } },
  tasksLoaded: { get: () => tasksLoaded, set: (val) => { tasksLoaded = val; } },
  hasTasksCache: { get: () => hasTasksCache, set: (val) => { hasTasksCache = val; } }
});
const pruneNotifiedTasks = () => {
  const ids = new Set(tasks.filter(task => !task.completed).map(task => task.id));
  pruneNotifiedMap(NOTIFY_KEYS.TASKS, notifiedTasks, ids);
};
let editingTaskId = null;
let editingTask = null;
let selectedTaskPriority = 'medium';
let selectedTaskColor = '';
let currentFilter = 'all';
let taskTickerHandle = null;
let taskReminderTickerHandle = null;
// Shared subject state (used by Task Manager + Subjects sidebar)
let subjects = [];
Object.defineProperty(ctx, 'subjects', { get: () => subjects, set: (val) => { subjects = val; } });
let currentSubject = 'all';
let currentSmartView = null; // 'today', 'week', 'overdue', 'nodate'
Object.defineProperties(ctx, {
  currentSubject: { get: () => currentSubject, set: (val) => { currentSubject = val; } },
  currentSmartView: { get: () => currentSmartView, set: (val) => { currentSmartView = val; } }
});
let editingSubjectId = null;
let selectedSubjectColor = '#667eea';
let contextMenuTarget = null;
let eventContextMenuTarget = null;
let expandedSubjects = new Set(); // Track which subjects are expanded


const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
const PRIORITY_LABELS = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low', none: '' };
const RECURRENCE_LABELS = {
  daily: 'יומי',
  weekdays: 'ימי חול',
  weekly: 'שבועי',
  biweekly: 'דו-שבועי',
  monthly: 'חודשי',
  yearly: 'שנתי'
};
const RECURRENCE_UNIT_LABELS = {
  days: { singular: 'יום', plural: 'ימים' },
  weeks: { singular: 'שבוע', plural: 'שבועות' },
  months: { singular: 'חודש', plural: 'חודשים' },
  years: { singular: 'שנה', plural: 'שנים' }
};

// Task Reminder Custom Handling
const newTaskReminderCustomWrap = $("newTaskReminderCustomWrap");
const newTaskReminderCustomValue = $("newTaskReminderCustomValue");
const newTaskReminderCustomUnit = $("newTaskReminderCustomUnit");
const editTaskReminderCustomWrap = $("editTaskReminderCustomWrap");
const editTaskReminderCustomValue = $("editTaskReminderCustomValue");
const editTaskReminderCustomUnit = $("editTaskReminderCustomUnit");

// Task Recurrence Custom Handling
const newTaskRecurrenceCustomWrap = $("newTaskRecurrenceCustomWrap");
const newTaskRecurrenceCustomValue = $("newTaskRecurrenceCustomValue");
const newTaskRecurrenceCustomUnit = $("newTaskRecurrenceCustomUnit");
const editTaskRecurrenceCustomWrap = $("editTaskRecurrenceCustomWrap");
const editTaskRecurrenceCustomValue = $("editTaskRecurrenceCustomValue");
const editTaskRecurrenceCustomUnit = $("editTaskRecurrenceCustomUnit");

// Get reminder value in minutes from custom inputs
function getTaskReminderMinutes(selectEl, customValueEl, customUnitEl) {
  if (!selectEl) return 0;
  if (selectEl.value === 'custom') {
    const val = Number.parseInt(customValueEl?.value, 10) || 0;
    const unit = customUnitEl?.value || 'minutes';
    if (unit === 'hours') return val * 60;
    if (unit === 'days') return val * 1440;
    return val;
  }
  return Number.parseInt(selectEl.value, 10) || 0;
}

// Set reminder UI from minutes value
function setTaskReminderUI(selectEl, customWrapEl, customValueEl, customUnitEl, minutes) {
  if (!selectEl) return;
  const min = Number.parseInt(minutes, 10) || 0;
  const optionExists = Array.from(selectEl.options).some(o => o.value === String(min) && o.value !== 'custom');

  if (min > 0 && !optionExists) {
    selectEl.value = 'custom';
    if (customWrapEl) customWrapEl.classList.remove('hidden');

    let unit = 'minutes';
    let value = min;
    if (min % 1440 === 0) {
      unit = 'days';
      value = Math.round(min / 1440);
    } else if (min % 60 === 0) {
      unit = 'hours';
      value = Math.round(min / 60);
    }
    if (customUnitEl) customUnitEl.value = unit;
    if (customValueEl) customValueEl.value = String(value);
    return;
  }

  selectEl.value = String(min);
  if (customWrapEl) customWrapEl.classList.add('hidden');
  if (customValueEl) customValueEl.value = '';
  if (customUnitEl) customUnitEl.value = 'minutes';
}

function parseRecurrenceValue(value) {
  if (!value) return { type: 'none' };
  if (typeof value === 'string') {
    if (value === 'none') return { type: 'none' };
    if (value.startsWith('custom:')) {
      const parts = value.split(':');
      const interval = Number.parseInt(parts[1], 10);
      const unit = parts[2];
      if (Number.isFinite(interval) && interval > 0 && RECURRENCE_UNIT_LABELS[unit]) {
        return { type: 'custom', interval, unit };
      }
      return { type: 'none' };
    }
    return { type: value };
  }
  if (typeof value === 'object' && value.type === 'custom') {
    const interval = Number.parseInt(value.interval, 10);
    const unit = value.unit;
    if (Number.isFinite(interval) && interval > 0 && RECURRENCE_UNIT_LABELS[unit]) {
      return { type: 'custom', interval, unit };
    }
  }
  return { type: 'none' };
}

function formatRecurrenceLabel(recurrence) {
  const parsed = parseRecurrenceValue(recurrence);
  if (parsed.type === 'none') return '';
  if (parsed.type !== 'custom') return RECURRENCE_LABELS[parsed.type] || parsed.type;
  const unitLabel = RECURRENCE_UNIT_LABELS[parsed.unit];
  if (!unitLabel || !parsed.interval) return 'מותאם אישית';
  if (parsed.interval === 1) return `כל ${unitLabel.singular}`;
  return `כל ${parsed.interval} ${unitLabel.plural}`;
}

function toggleRecurrenceCustom(selectEl, customWrapEl, customValueEl, customUnitEl) {
  if (!selectEl) return;
  const isCustom = selectEl.value === 'custom';
  if (customWrapEl) customWrapEl.classList.toggle('hidden', !isCustom);
  if (isCustom) {
    if (customUnitEl && !customUnitEl.value) customUnitEl.value = 'days';
    if (customValueEl && !customValueEl.value) customValueEl.value = '1';
    if (customValueEl) customValueEl.focus();
  } else {
    if (customValueEl) customValueEl.value = '';
    if (customUnitEl) customUnitEl.value = 'days';
  }
}

function getTaskRecurrenceValue(selectEl, customValueEl, customUnitEl) {
  if (!selectEl) return { value: null };
  if (selectEl.value !== 'custom') {
    const val = selectEl.value && selectEl.value !== 'none' ? selectEl.value : null;
    return { value: val };
  }
  const interval = Number.parseInt(customValueEl?.value, 10);
  const unit = customUnitEl?.value || 'days';
  if (!Number.isFinite(interval) || interval < 1 || !RECURRENCE_UNIT_LABELS[unit]) {
    return { value: null, error: 'אנא הזן מרווח חזרה מותאם אישית (מספר חיובי).' };
  }
  return { value: { type: 'custom', interval, unit } };
}

function setTaskRecurrenceUI(selectEl, customWrapEl, customValueEl, customUnitEl, recurrence) {
  if (!selectEl) return;
  const parsed = parseRecurrenceValue(recurrence);
  if (parsed.type === 'custom') {
    selectEl.value = 'custom';
    if (customWrapEl) customWrapEl.classList.remove('hidden');
    if (customValueEl) customValueEl.value = String(parsed.interval || 1);
    if (customUnitEl) customUnitEl.value = parsed.unit || 'days';
    return;
  }
  selectEl.value = parsed.type || 'none';
  if (customWrapEl) customWrapEl.classList.add('hidden');
  if (customValueEl) customValueEl.value = '';
  if (customUnitEl) customUnitEl.value = 'days';
}

// New task reminder change handler
if (newTaskReminder) {
  newTaskReminder.addEventListener('change', () => {
    const isCustom = newTaskReminder.value === 'custom';
    if (newTaskReminderCustomWrap) newTaskReminderCustomWrap.classList.toggle('hidden', !isCustom);
    if (isCustom) {
      if (newTaskReminderCustomUnit && !newTaskReminderCustomUnit.value) newTaskReminderCustomUnit.value = 'minutes';
      if (newTaskReminderCustomValue && !newTaskReminderCustomValue.value) newTaskReminderCustomValue.value = '10';
      if (newTaskReminderCustomValue) newTaskReminderCustomValue.focus();
    }
  });
}

// Edit task reminder change handler
if (editTaskReminder) {
  editTaskReminder.addEventListener('change', () => {
    const isCustom = editTaskReminder.value === 'custom';
    if (editTaskReminderCustomWrap) editTaskReminderCustomWrap.classList.toggle('hidden', !isCustom);
    if (isCustom) {
      if (editTaskReminderCustomUnit && !editTaskReminderCustomUnit.value) editTaskReminderCustomUnit.value = 'minutes';
      if (editTaskReminderCustomValue && !editTaskReminderCustomValue.value) editTaskReminderCustomValue.value = '10';
      if (editTaskReminderCustomValue) editTaskReminderCustomValue.focus();
    }
  });
}

// New task recurrence change handler
if (newTaskRecurrence) {
  newTaskRecurrence.addEventListener('change', () => {
    toggleRecurrenceCustom(newTaskRecurrence, newTaskRecurrenceCustomWrap, newTaskRecurrenceCustomValue, newTaskRecurrenceCustomUnit);
  });
}

// Edit task recurrence change handler
if (editTaskRecurrence) {
  editTaskRecurrence.addEventListener('change', () => {
    toggleRecurrenceCustom(editTaskRecurrence, editTaskRecurrenceCustomWrap, editTaskRecurrenceCustomValue, editTaskRecurrenceCustomUnit);
  });
}

// Quick reminder button handlers
document.querySelectorAll('.quick-reminder-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const minutes = Number.parseInt(btn.dataset.minutes, 10) || 0;
    if (editTaskReminder) {
      setTaskReminderUI(editTaskReminder, editTaskReminderCustomWrap, editTaskReminderCustomValue, editTaskReminderCustomUnit, minutes);
    }
  });
});

// Quick recurrence button handlers
document.querySelectorAll('.quick-recurrence-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target || 'edit';
    const value = btn.dataset.recurrence || 'none';
    const selectEl = target === 'new' ? newTaskRecurrence : editTaskRecurrence;
    const wrapEl = target === 'new' ? newTaskRecurrenceCustomWrap : editTaskRecurrenceCustomWrap;
    const valueEl = target === 'new' ? newTaskRecurrenceCustomValue : editTaskRecurrenceCustomValue;
    const unitEl = target === 'new' ? newTaskRecurrenceCustomUnit : editTaskRecurrenceCustomUnit;
    if (!selectEl) return;
    selectEl.value = value;
    toggleRecurrenceCustom(selectEl, wrapEl, valueEl, unitEl);
  });
});

function getDefaultSubjectId() {
  if (currentSmartView) return '';
  if (currentSubject && currentSubject !== 'all') return currentSubject;
  return '';
}

function syncQuickAddSubject() {
  if (!newTaskSubject) return;
  const defaultSubject = getDefaultSubjectId();
  if (defaultSubject) {
    newTaskSubject.value = defaultSubject;
  } else if (!newTaskSubject.value) {
    newTaskSubject.value = '';
  }
  updateQuickAddSubjectColorOption();
}

function getSubjectColorById(subjectId) {
  if (!subjectId) return '';
  return subjects.find(s => s.id === subjectId)?.color || '';
}

function updateQuickAddSubjectColorOption() {
  if (!newTaskSubject || !quickTaskColorPicker) return;
  const subjectColor = getSubjectColorById(newTaskSubject.value);
  updateSubjectColorOption(quickTaskColorPicker, subjectColor);
  if (!subjectColor && selectedTaskColor === 'subject') {
    selectedTaskColor = '';
    setTaskColorSelection(quickTaskColorPicker, selectedTaskColor);
  }
}

function setTaskColorSelection(picker, color) {
  if (!picker) return;
  const target = color || '';
  picker.querySelectorAll('.task-color-option').forEach(opt => {
    const optColor = opt.dataset.color || '';
    opt.classList.toggle('selected', optColor === target);
  });
}

function getTaskColorFromPicker(picker) {
  if (!picker) return '';
  const selected = picker.querySelector('.task-color-option.selected');
  return selected ? (selected.dataset.color || '') : '';
}

function bindTaskColorPicker(picker, onChange) {
  if (!picker) return;
  picker.addEventListener('click', (e) => {
    const option = e.target.closest('.task-color-option');
    if (!option) return;
    if (option.classList.contains('disabled')) return;
    const color = option.dataset.color || '';
    setTaskColorSelection(picker, color);
    if (typeof onChange === 'function') onChange(color);
  });
}

function updateSubjectColorOption(picker, subjectColor) {
  if (!picker) return;
  const option = picker.querySelector('.task-color-option.subject');
  if (!option) return;
  if (subjectColor) {
    option.style.background = subjectColor;
    option.classList.remove('disabled');
    option.title = 'Use subject color';
  } else {
    option.style.background = '';
    option.classList.add('disabled');
    option.title = 'Select a subject to use its color';
  }
}

function resolveTaskColor(task, subjectColor) {
  if (!task?.color) return '';
  if (task.color === 'subject') return subjectColor || '';
  return task.color;
}

function hasManualOrder(taskList = tasks) {
  return taskList.every(t => Number.isFinite(t.order));
}

function getNextTaskOrder(isCompleted = false) {
  const list = tasks.filter(t => !!t.completed === !!isCompleted);
  const maxOrder = list.reduce((max, t) => Number.isFinite(t.order) ? Math.max(max, t.order) : max, -1);
  return maxOrder + 1;
}

function normalizeRecurrence(value) {
  return parseRecurrenceValue(value).type || 'none';
}

function getNextRecurrenceDate(baseIso, recurrence) {
  const parsedRecurrence = parseRecurrenceValue(recurrence);
  const type = parsedRecurrence.type || 'none';
  if (type === 'none') return null;
  const now = new Date();
  let base = baseIso ? new Date(baseIso) : new Date();
  if (Number.isNaN(base.getTime())) return null;
  const advance = (date) => {
    const next = new Date(date);
    switch (type) {
      case 'daily':
        next.setDate(next.getDate() + 1);
        break;
      case 'weekdays':
        // Skip to next weekday (Sunday=0, Saturday=6)
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
        if (!parsedRecurrence.interval || !parsedRecurrence.unit) return null;
        if (parsedRecurrence.unit === 'days') {
          next.setDate(next.getDate() + parsedRecurrence.interval);
        } else if (parsedRecurrence.unit === 'weeks') {
          next.setDate(next.getDate() + (parsedRecurrence.interval * 7));
        } else if (parsedRecurrence.unit === 'months') {
          next.setMonth(next.getMonth() + parsedRecurrence.interval);
        } else if (parsedRecurrence.unit === 'years') {
          next.setFullYear(next.getFullYear() + parsedRecurrence.interval);
        } else {
          return null;
        }
        break;
      default:
        return null;
    }
    return next;
  };

  let next = advance(base);
  if (!next) return null;

  const MAX_ITERATIONS = 10000;
  let iterations = 0;
  while (next <= now && iterations < MAX_ITERATIONS) {
    next = advance(next);
    if (!next) return null;
    iterations++;
  }

  if (iterations >= MAX_ITERATIONS) return null;
  return next;
}

function buildTaskClone(task, overrides = {}) {
  const { id, ...clean } = task;
  const orderValue = hasManualOrder() ? getNextTaskOrder(false) : null;
  const clone = {
    ...clean,
    completed: false,
    createdAt: new Date().toISOString(),
    ...(Number.isFinite(orderValue) ? { order: orderValue } : {})
  };
  return { ...clone, ...overrides };
}

function pushTaskClone(task, overrides = {}) {
  if (!task) return;
  const taskData = buildTaskClone(task, overrides);
  createTask(taskData);
}

function maybeCreateRecurringTask(task) {
  const parsedRecurrence = parseRecurrenceValue(task?.recurrence);
  if (parsedRecurrence.type === 'none') return;
  const nextDate = getNextRecurrenceDate(task?.dueDate, task?.recurrence);
  if (!nextDate) return;

  // Simple dedupe: track recently created recurrences to prevent duplicates
  // This helps when multiple clients complete the same task close together
  const dedupeKey = `recurrence-${task?.id}-${nextDate.toISOString().slice(0, 10)}`;
  const recentRecurrences = JSON.parse(localStorage.getItem('countdown-recurrence-dedupe') || '{}');
  const now = Date.now();
  // Clean old entries (older than 1 hour)
  Object.keys(recentRecurrences).forEach(k => {
    if (now - recentRecurrences[k] > 3600000) delete recentRecurrences[k];
  });
  if (recentRecurrences[dedupeKey]) {
    console.log('[Recurrence] Skipping duplicate recurrence for', task?.title);
    return;
  }
  recentRecurrences[dedupeKey] = now;
  localStorage.setItem('countdown-recurrence-dedupe', JSON.stringify(recentRecurrences));

  pushTaskClone(task, { dueDate: nextDate.toISOString(), completed: false });
}
ctx.pushTaskClone = pushTaskClone;
ctx.maybeCreateRecurringTask = maybeCreateRecurringTask;

// ============ 10. POMODORO INTEGRATION ============
const Pomodoro = createPomodoro();
ctx.Pomodoro = Pomodoro;

// Toggle overlays - menu buttons switch between views
// Four main views: Countdown (app-layout), Tasks (taskManagerOverlay), Pomodoro (pomodoroOverlay), Planner (plannerOverlay)
const toggleCountdown = document.getElementById('toggleCountdown');
const togglePlanner = document.getElementById('togglePlanner');
const plannerOverlay = document.getElementById('plannerOverlay');
const toggleExam = document.getElementById('toggleExam');
const examModeOverlay = document.getElementById('examModeOverlay');
const appLayout = document.querySelector('.app-layout');
// Ensure current view state and commonly used DOM refs exist before showView
let currentView = 'countdown';
Object.defineProperty(ctx, 'currentView', { get: () => currentView, set: (val) => { currentView = val; } });

function updateHeaderButtons() {
  try {
    ['toggleCountdown', 'toggleTasks', 'togglePomodoro', 'togglePlanner'].forEach(id => {
      const el = $(id);
      if (el) el.classList.remove('active');
    });
    if (currentView === 'countdown') {
      const el = $('toggleCountdown'); if (el) el.classList.add('active');
    } else if (currentView === 'tasks') {
      const el = $('toggleTasks'); if (el) el.classList.add('active');
    } else if (currentView === 'pomodoro') {
      const el = $('togglePomodoro'); if (el) el.classList.add('active');
    } else if (currentView === 'planner') {
      const el = $('togglePlanner'); if (el) el.classList.add('active');
    } else if (currentView === 'exam') {
      const el = $('toggleExam'); if (el) el.classList.add('active');
    }
  } catch (e) {
    console.warn('updateHeaderButtons error', e);
  }
}






const showView = (view) => {
  // Hide all views
  appLayout.style.display = 'none';
  taskManagerOverlay.classList.remove('open');
  pomodoroOverlay.classList.remove('open');
  if (plannerOverlay) plannerOverlay.classList.remove('open');
  if (examModeOverlay) examModeOverlay.classList.remove('open');
  stopTaskTicker();

  // Show calendar button only for countdown view
  toggleSidebar.style.display = view === 'countdown' ? '' : 'none';

  // Show selected view
  if (view === 'countdown') {
    appLayout.style.display = '';
  } else if (view === 'tasks') {
    taskManagerOverlay.classList.add('open');
    renderSubjectsSidebar();
    renderTasks();
    startTaskTicker();
    if (typeof setupTaskCalendar === 'function') setupTaskCalendar();
    if (typeof renderTaskCalendar === 'function') renderTaskCalendar();
  } else if (view === 'pomodoro') {
    pomodoroOverlay.classList.add('open');
  } else if (view === 'planner') {
    if (plannerOverlay) {
      plannerOverlay.classList.add('open');
      if (window.DailyPlanner && window.DailyPlanner.init) {
        window.DailyPlanner.init();
      }
    }
  } else if (view === 'exam') {
    if (examModeOverlay) {
      examModeOverlay.classList.add('open');
      initExamMode();
    }
  }

  currentView = view;
  updateHeaderButtons();
  try { window.dispatchEvent(new CustomEvent('app:viewchange', { detail: { view } })); } catch (e) { }
};

// Expose for non-module scripts (e.g. mobile bottom nav handler)
window.showView = showView;
ctx.showView = showView;

toggleCountdown.onclick = () => showView('countdown');
toggleTasks.onclick = () => showView('tasks');
togglePomodoro.onclick = () => showView('pomodoro');
if (togglePlanner) togglePlanner.onclick = () => showView('planner');
if (toggleExam) toggleExam.onclick = () => showView('exam');



// Close task manager button
if (closeTaskManager) {
  closeTaskManager.onclick = () => {
    taskManagerOverlay.classList.remove('open');
    stopTaskTicker();
    showView('countdown');
  };
}

// Initialize header button states
updateHeaderButtons();
newTaskTitle.addEventListener('focus', () => {
  quickAddRow.style.display = 'flex';
  syncQuickAddSubject();
});

// Collapse quick add when clicking outside
taskManagerOverlay.addEventListener('click', (e) => {
  if (!quickAddTask.contains(e.target) && !newTaskTitle.value.trim()) {
    quickAddRow.style.display = 'none';
  }
});

// Priority picker in quick add
taskPriorityPicker.addEventListener('click', (e) => {
  const option = e.target.closest('.priority-option');
  if (!option) return;
  taskPriorityPicker.querySelectorAll('.priority-option').forEach(o => o.classList.remove('selected'));
  option.classList.add('selected');
  selectedTaskPriority = option.dataset.priority;
});

bindTaskColorPicker(quickTaskColorPicker, (color) => {
  selectedTaskColor = color;
});
setTaskColorSelection(quickTaskColorPicker, selectedTaskColor);
updateQuickAddSubjectColorOption();
if (newTaskSubject) {
  newTaskSubject.addEventListener('change', () => {
    updateQuickAddSubjectColorOption();
  });
}
if (editTaskSubject) {
  editTaskSubject.addEventListener('change', () => {
    const subjectColor = getSubjectColorById(editTaskSubject.value);
    updateSubjectColorOption(taskColorPicker, subjectColor);
    if (!subjectColor && getTaskColorFromPicker(taskColorPicker) === 'subject') {
      setTaskColorSelection(taskColorPicker, '');
      if (editingTask) editingTask.color = '';
    }
  });
}

// ============ UNIFIED ADD TASK FUNCTION ============
/**
 * Creates a new task from the quick-add form.
 * Reads values from form inputs, validates, creates task object,
 * saves to Firebase, and resets the form.
 */
function addTask() {
  const title = newTaskTitle.value.trim();
  if (!title) return;

  const dueValue = newTaskDue.value;
  const dueDate = dueValue ? parseLocal(dueValue) : null;
  const recurrenceResult = getTaskRecurrenceValue(newTaskRecurrence, newTaskRecurrenceCustomValue, newTaskRecurrenceCustomUnit);
  if (recurrenceResult.error) {
    alert(recurrenceResult.error);
    return;
  }
  const recurrence = recurrenceResult.value;
  const reminder = getTaskReminderMinutes(newTaskReminder, newTaskReminderCustomValue, newTaskReminderCustomUnit);
  const durationEl = document.getElementById('newTaskDuration');
  const duration = durationEl ? Number.parseInt(durationEl.value, 10) || 0 : 0;

  const defaultSubjectId = getDefaultSubjectId();
  const selectedSubjectId = newTaskSubject ? (newTaskSubject.value || defaultSubjectId) : defaultSubjectId;
  const orderValue = hasManualOrder() ? getNextTaskOrder(false) : null;

  const taskData = {
    title,
    content: '',
    priority: selectedTaskPriority,
    dueDate: dueDate ? dueDate.toISOString() : null,
    subject: selectedSubjectId || '',
    checklist: [],
    completed: false,
    createdAt: new Date().toISOString(),
    ...(Number.isFinite(orderValue) ? { order: orderValue } : {}),
    ...(selectedTaskColor ? { color: selectedTaskColor } : {}),
    ...(recurrence ? { recurrence } : {}),
    ...(reminder > 0 ? { reminder } : {}),
    ...(duration > 0 ? { duration } : {})
  };

  createTask(taskData);

  // Reset form
  newTaskTitle.value = '';
  newTaskDue.value = '';
  if (newTaskRecurrence) newTaskRecurrence.value = 'none';
  if (newTaskRecurrenceCustomWrap) newTaskRecurrenceCustomWrap.classList.add('hidden');
  if (newTaskRecurrenceCustomValue) newTaskRecurrenceCustomValue.value = '';
  if (newTaskRecurrenceCustomUnit) newTaskRecurrenceCustomUnit.value = 'days';
  if (newTaskReminder) newTaskReminder.value = '0';
  if (newTaskReminderCustomWrap) newTaskReminderCustomWrap.classList.add('hidden');
  if (newTaskReminderCustomValue) newTaskReminderCustomValue.value = '';
  if (newTaskReminderCustomUnit) newTaskReminderCustomUnit.value = 'minutes';
  if (durationEl) durationEl.value = '0';
  if (newTaskSubject) newTaskSubject.value = '';
  if (quickAddRow) quickAddRow.style.display = 'none';
  selectedTaskPriority = 'medium';
  taskPriorityPicker.querySelectorAll('.priority-option').forEach(o => o.classList.remove('selected'));
  taskPriorityPicker.querySelector('[data-priority="medium"]').classList.add('selected');
  selectedTaskColor = '';
  setTaskColorSelection(quickTaskColorPicker, selectedTaskColor);
  syncQuickAddSubject();
  const taskSections = $("taskSections");
  if (taskSections) {
    taskSections.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// Hook button to unified function
addTaskBtn.onclick = addTask;

// Filter pills
document.querySelectorAll('.filter-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentFilter = pill.dataset.filter;
    renderTasks();
  });
});

// Search
taskSearch.addEventListener('input', () => {
  renderTasks();
});

const tasksEmptyDefaults = tasksEmpty ? {
  icon: tasksEmpty.querySelector('.tasks-empty-icon')?.textContent || '📝',
  title: tasksEmpty.querySelector('h3')?.textContent || 'אין משימות עדיין',
  desc: tasksEmpty.querySelector('p')?.textContent || 'הוסף משימה ראשונה למעלה כדי להתחיל!'
} : null;

const setTasksEmptyMessage = (icon, title, desc) => {
  if (!tasksEmpty) return;
  const iconEl = tasksEmpty.querySelector('.tasks-empty-icon');
  const titleEl = tasksEmpty.querySelector('h3');
  const descEl = tasksEmpty.querySelector('p');
  if (iconEl) iconEl.textContent = icon;
  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = desc;
};

const showTasksLoading = () => {
  activeSection.style.display = 'none';
  completedSection.style.display = 'none';
  tasksEmpty.style.display = 'block';
  setTasksEmptyMessage('⏳', 'טוען משימות...', 'מסנכרן משימות מהענן');
};

const resetTasksEmptyMessage = () => {
  if (!tasksEmptyDefaults) return;
  setTasksEmptyMessage(tasksEmptyDefaults.icon, tasksEmptyDefaults.title, tasksEmptyDefaults.desc);
};
Object.assign(ctx, { showTasksLoading, resetTasksEmptyMessage });

const tasksApi = initTasks({
  onTasksUpdated: () => {
    pruneNotifiedTasks();
    if (taskManagerOverlay.classList.contains('open')) {
      renderTasks();
      renderSubjectsSidebar();
    }
    const trSidebar = $('taskRightSidebar');
    if (trSidebar && !trSidebar.classList.contains('hidden')) {
      renderTaskCalendar();
    }
  },
  onTasksCacheLoaded: () => {
    pruneNotifiedTasks();
    if (taskManagerOverlay.classList.contains('open')) {
      renderTasks();
      renderSubjectsSidebar();
    }
  }
});
const { getTaskRef, saveTask, removeTask, createTask } = tasksApi;
Object.assign(ctx, { getTaskRef, saveTask, removeTask, createTask });

function getFilteredTasks() {
  let filtered = [...tasks];

  // Apply search filter
  const searchTerm = taskSearch.value.trim().toLowerCase();
  const normalizedSearch = searchTerm.replace(/^#/, '');
  if (normalizedSearch) {
    filtered = filtered.filter(t => {
      const subject = subjects.find(s => s.id === t.subject);
      const subjectName = subject?.name?.toLowerCase() || '';
      const parentName = subject?.parentId
        ? (subjects.find(s => s.id === subject.parentId)?.name?.toLowerCase() || '')
        : '';
      const subjectLabel = parentName ? `${parentName} ${subjectName}` : subjectName;

      return (
        t.title.toLowerCase().includes(normalizedSearch) ||
        (t.content && t.content.toLowerCase().includes(normalizedSearch)) ||
        subjectName.includes(normalizedSearch) ||
        parentName.includes(normalizedSearch) ||
        subjectLabel.includes(normalizedSearch)
      );
    });
  }

  // Apply status filter
  if (currentFilter === 'active') {
    filtered = filtered.filter(t => !t.completed);
  } else if (currentFilter === 'completed') {
    filtered = filtered.filter(t => t.completed);
  } else if (currentFilter === 'tomorrow') {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);

    filtered = filtered.filter(t => {
      if (!t.dueDate) return false;
      const due = new Date(t.dueDate);
      return due >= tomorrow && due < dayAfter;
    });
  }

  // Apply date filter for calendar selection
  if (currentSmartView === 'date-filter' && window.taskFilterDate) {
    const dateStr = window.taskFilterDate.toDateString();
    filtered = filtered.filter(t => {
      if (!t.dueDate) return false;
      return new Date(t.dueDate).toDateString() === dateStr;
    });
  }

  return filtered;
}

function sortTasksDefault(taskList) {
  // Sort by: due date (soonest first), then by priority, then by created date (newest first)
  return taskList.sort((a, b) => {
    // Due date comparison (tasks with due dates come first, soonest first)
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    if (a.dueDate && b.dueDate) {
      const dueDiff = new Date(a.dueDate) - new Date(b.dueDate);
      if (dueDiff !== 0) return dueDiff;
    }

    // Priority comparison (higher priority first)
    const priorityA = PRIORITY_ORDER[a.priority || 'none'];
    const priorityB = PRIORITY_ORDER[b.priority || 'none'];
    if (priorityA !== priorityB) return priorityA - priorityB;

    // Created date (newest first)
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function sortTasks(taskList) {
  // Check if any tasks have been manually reordered (have manualOrder flag)
  const manuallyOrdered = taskList.filter(t => t.manualOrder === true);
  const autoOrdered = taskList.filter(t => t.manualOrder !== true);

  // Sort auto-ordered tasks by selected sort preference
  const sortByPreference = (list) => {
    return list.sort((a, b) => {
      switch (currentTaskSort) {
        case 'priority':
          // Priority first (higher priority first)
          const priorityA = PRIORITY_ORDER[a.priority || 'none'];
          const priorityB = PRIORITY_ORDER[b.priority || 'none'];
          if (priorityA !== priorityB) return priorityA - priorityB;
          // Then by due date
          if (a.dueDate && !b.dueDate) return -1;
          if (!a.dueDate && b.dueDate) return 1;
          if (a.dueDate && b.dueDate) {
            const dueDiff = new Date(a.dueDate) - new Date(b.dueDate);
            if (dueDiff !== 0) return dueDiff;
          }
          return new Date(b.createdAt) - new Date(a.createdAt);

        case 'created':
          // Created date (newest first)
          return new Date(b.createdAt) - new Date(a.createdAt);

        case 'createdOldest':
          // Created date (oldest first)
          return new Date(a.createdAt) - new Date(b.createdAt);

        case 'title':
          // Title (A-Z, Hebrew aware)
          const titleA = (a.title || '').toLowerCase();
          const titleB = (b.title || '').toLowerCase();
          return titleA.localeCompare(titleB, 'he');

        case 'dueDate':
        default:
          // Custom Logic:
          // 1. Future/Today Tasks (sorted by date ascending)
          // 2. Overdue Tasks (sorted by date ascending) - effectively pushing them "after" future tasks in the visual list?
          //    WAIT, user requirement: "tasks with no date will be in the end" and "overdue tasks are at the bottom"
          //    Interpretation:
          //    - Top: Future/Today (Soonest -> Furthest)
          //    - Middle: Overdue (Oldest -> Newest? Or Newest -> Oldest? Usually overdue are "less important" so bottom, but if they are critical they should be top. 
          //      User said "overdue tasks are at the bottom". So they should come after future tasks.
          //    - Bottom: No Date.

          // Let's refine the tier logic:
          // Tier 1: Future/Today (dueDate >= Today 00:00)
          // Tier 2: Overdue (dueDate < Today 00:00)
          // Tier 3: No Date

          const now = new Date();
          now.setHours(0, 0, 0, 0); // Start of today for comparison

          const getTier = (task) => {
            if (!task.dueDate) return 3; // No Date -> Bottom
            const due = new Date(task.dueDate);
            if (due < now) return 2; // Overdue -> Middle (Bottom of dated list)
            return 1; // Future/Today -> Top
          };

          const tierA = getTier(a);
          const tierB = getTier(b);

          if (tierA !== tierB) return tierA - tierB;

          // Within tiers:
          if (tierA === 1 || tierA === 2) {
            // Determine sort within dated tiers
            const dateA = new Date(a.dueDate);
            const dateB = new Date(b.dueDate);
            return dateA - dateB; // Ascending (Soonest first within group)
          }

          // Local fallback for No Date tier or equal dates
          // Then by priority
          const prioA = PRIORITY_ORDER[a.priority || 'none'];
          const prioB = PRIORITY_ORDER[b.priority || 'none'];
          if (prioA !== prioB) return prioA - prioB;
          // Then by created date
          return new Date(b.createdAt) - new Date(a.createdAt);
      }
    });
  };

  sortByPreference(autoOrdered);

  // Sort manually ordered tasks by their order value
  manuallyOrdered.sort((a, b) => {
    const aOrder = Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder;
  });

  // If there are manual orders, integrate them at their specified positions
  if (manuallyOrdered.length > 0) {
    // Manually ordered tasks go first, then auto-ordered
    return [...manuallyOrdered, ...autoOrdered];
  }

  return autoOrdered;
}

function calcTaskCountdown(dueDate) {
  if (!dueDate) return null;
  const now = Date.now();
  const due = new Date(dueDate).getTime();
  const diff = due - now;

  if (diff <= 0) {
    return { overdue: true, text: 'Overdue', urgency: 'overdue' };
  }

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);

  let text = '';
  let urgency = '';

  if (days > 0) {
    text = `${days}d ${hours}h`;
  } else if (hours > 0) {
    text = `${hours}h ${mins}m`;
  } else {
    text = `${mins}m`;
  }

  // Urgency levels for styling
  if (days === 0 && hours < 6) {
    urgency = 'soon';
  } else if (days === 0) {
    urgency = 'today';
  }

  return { overdue: false, text, urgency, days, hours, mins };
}

/**
 * Renders all tasks to the DOM based on current filters and sorting.
 * Separates active and completed tasks, updates sidebar counts,
 * and applies virtual scrolling for performance.
 */
let hasRunAutoCleanup = false;

function renderTasks() {
  if (!tasksLoaded && !hasTasksCache) {
    showTasksLoading();
    return;
  }

  // Run auto-delete cleanup once after tasks are loaded
  if (!hasRunAutoCleanup && tasksLoaded) {
    // Use timeout to let thread clear and not block rendering
    setTimeout(() => {
      if (typeof window.runAutoDeleteCleanup === 'function') {
        window.runAutoDeleteCleanup();
      } else {
        console.warn('[AutoDelete] function not available yet');
      }
    }, 1000);
    hasRunAutoCleanup = true;
  }

  const filtered = getFilteredTasks();
  const active = filtered.filter(t => !t.completed);
  const completed = filtered.filter(t => t.completed);

  // Update sidebar counts
  updateSmartViewCounts();
  renderSubjectsSidebar();

  // Update title for date filter
  const viewNameDisplay = document.querySelector('.task-manager-title');
  if (currentSmartView === 'date-filter' && window.taskFilterDate && viewNameDisplay) {
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    viewNameDisplay.textContent = `📅 ${window.taskFilterDate.toLocaleDateString('he-IL', options)}`;
  } else if (viewNameDisplay && !currentSmartView) {
    // Reset to default title if not in a smart view
    const subjectName = currentSubject ? subjects.find(s => s.id === currentSubject)?.name : null;
    viewNameDisplay.textContent = subjectName || 'כל המשימות';
  }

  // Sort tasks
  sortTasks(active);
  sortTasks(completed);

  // Check if showing suggested tasks for empty sub-subject
  const showingSuggested = window.showingSuggestedTasks;

  // Active tasks section
  if (active.length > 0 || currentFilter === 'all' || currentFilter === 'active') {
    activeSection.style.display = 'block';
    let suggestedBanner = '';
    if (showingSuggested && active.length > 0) {
      suggestedBanner = `
      <div class="suggested-tasks-banner">
        <span class="suggested-icon">💡</span>
        <span>אין משימות בתת-נושא זה. מוצגות משימות דחופות מכל הנושאים:</span>
      </div>
    `;
    }
    activeTasks.innerHTML = suggestedBanner + active.map(t => renderTaskItem(t, showingSuggested)).join('');
  } else {
    activeSection.style.display = 'none';
  }

  // Completed tasks section
  if (completed.length > 0 && (currentFilter === 'all' || currentFilter === 'completed') && !showingSuggested) {
    completedSection.style.display = 'block';
    completedTasks.innerHTML = completed.map(t => renderTaskItem(t)).join('');
  } else {
    completedSection.style.display = 'none';
  }

  // Empty state
  if (filtered.length === 0 && !showingSuggested) {
    tasksEmpty.style.display = 'block';
    activeSection.style.display = 'none';
  } else {
    tasksEmpty.style.display = 'none';
  }

  Pomodoro.updateTasks(tasks);

  // Event delegation is set up once below, no need to call attachTaskEventHandlers
}
ctx.renderTasks = renderTasks;

// Helper functions for renderTaskItem
function renderTaskDueDate(task, countdown) {
  if (!task.dueDate) return `<span class="task-due add" data-due-iso="">+ תאריך</span>`;
  const dueDate = new Date(task.dueDate);
  const day = dueDate.getDate();
  const month = dueDate.toLocaleString('he-IL', { month: 'short' });
  const weekday = dueDate.toLocaleString('he-IL', { weekday: 'short' });
  const time = dueDate.toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const dateStr = `${weekday}, ${day} ${month}, ${time}`;
  const urgencyClass = countdown?.overdue ? 'overdue' : (countdown?.urgency === 'soon' ? 'soon' : '');
  return `<span class="task-due ${urgencyClass}" data-due-iso="${task.dueDate}">📅 ${dateStr}</span>`;
}

function renderTaskCountdown(task, countdown) {
  if (!countdown) return '';
  const countdownClass = countdown.overdue ? 'overdue' : (countdown.urgency === 'soon' ? 'soon' : '');
  return `<span class="task-countdown ${countdownClass}" data-due="${task.dueDate}">${countdown.text}</span>`;
}

function renderTaskRecurrence(task) {
  const recurrenceLabel = formatRecurrenceLabel(task.recurrence);
  if (!recurrenceLabel) return '';
  // Clear two-arrow repeat icon for better small-size rendering
  const icon = `<svg viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path></svg>`;
  return `<span class="task-recurrence">${icon}${recurrenceLabel}</span>`;
}

function renderTaskReminder(task) {
  const reminderMinutes = Number.parseInt(task.reminder, 10) || 0;
  if (reminderMinutes <= 0) return '';
  const reminderLabel = formatReminderOffset(reminderMinutes);
  return `<span class="task-reminder">🔔 ${reminderLabel}</span>`;
}

function renderTaskDuration(task) {
  const durationMinutes = Number.parseInt(task.duration, 10) || 0;
  if (durationMinutes <= 0) return '';
  const hours = Math.floor(durationMinutes / 60);
  const mins = durationMinutes % 60;
  let durationLabel = '';
  if (hours > 0 && mins > 0) {
    durationLabel = `${hours}:${mins.toString().padStart(2, '0')} שעות`;
  } else if (hours > 0) {
    durationLabel = `${hours} שעות`;
  } else {
    durationLabel = `${mins} דקות`;
  }
  return `<span class="task-duration">⏱️ ${durationLabel}</span>`;
}

function renderTaskSubjectBadge(task, showSubjectTag) {
  const subjectData = task.subject ? subjects.find(s => s.id === task.subject) : null;
  if (!subjectData) return '';
  const shouldShow = (currentSubject === 'all') || showSubjectTag;
  if (!shouldShow) return '';

  // If it's a sub-subject and showing tag, show parent > child
  let displayName = subjectData.name;
  if (showSubjectTag && subjectData.parentId) {
    const parent = subjects.find(s => s.id === subjectData.parentId);
    if (parent) {
      displayName = `${parent.name} › ${subjectData.name}`;
    }
  }
  return `<span class="task-subject-badge" style="--subject-color: ${subjectData.color};">${escapeHtml(displayName)}</span>`;
}

function renderTaskSubtasks(task) {
  if (!task.checklist || task.checklist.length === 0) return '';
  const checked = task.checklist.filter(c => c.checked).length;
  const total = task.checklist.length;
  const maxShow = 3;
  const items = task.checklist.slice(0, maxShow);

  return `
    <div class="task-subtasks">
      <div class="task-subtask-progress">${checked}/${total} completed</div>
      ${items.map((item, i) => `
        <div class="task-subtask ${item.checked ? 'checked' : ''}">
          <input type="checkbox" ${item.checked ? 'checked' : ''} data-index="${i}" />
          <span>${escapeHtml(item.text)}</span>
        </div>
      `).join('')}
      ${task.checklist.length > maxShow ? `<div style="font-size: 12px; color: var(--muted);">+${task.checklist.length - maxShow} more</div>` : ''}
    </div>
  `;
}

function renderTaskPriorityBadge(priority) {
  return `<span class="task-priority-badge ${priority === 'none' ? 'muted' : ''}" data-priority="${priority}">${priority === 'none' ? 'קבע עדיפות' : PRIORITY_LABELS[priority]}</span>`;
}

function renderTaskItem(task, showSubjectTag = false) {
  const priority = task.priority || 'none';
  const countdown = calcTaskCountdown(task.dueDate);

  const subjectData = task.subject ? subjects.find(s => s.id === task.subject) : null;
  const subjectColor = subjectData ? subjectData.color : '';
  const resolvedTaskColor = resolveTaskColor(task, subjectColor);
  const styleParts = [];
  if (subjectColor) {
    styleParts.push(`--subject-color: ${subjectColor};`);
    styleParts.push(`--subject-tint: ${subjectColor}26;`);
  }
  if (resolvedTaskColor) {
    styleParts.push(`--task-color: ${resolvedTaskColor};`);
    styleParts.push(`--task-tint: ${resolvedTaskColor}22;`);
  }
  const taskStyle = styleParts.length ? ` style="${styleParts.join(' ')}"` : '';
  const taskColorDot = resolvedTaskColor ? `<span class="task-color-dot" style="background: ${resolvedTaskColor};"></span>` : '';

  return `
  <div class="task-item priority-${priority} ${task.completed ? 'completed' : ''}" data-id="${task.id}" draggable="true"${taskStyle}>
    <div class="task-checkbox" data-action="toggle">${task.completed ? '✓' : ''}</div>
    <div class="task-main">
      <div class="task-title-row">
        <span class="task-title">${escapeHtml(task.title)}</span>
        ${taskColorDot}
        ${renderTaskSubjectBadge(task, showSubjectTag)}
        ${renderTaskPriorityBadge(priority)}
      </div>
      <div class="task-meta">
        ${renderTaskDueDate(task, countdown)}
        ${renderTaskCountdown(task, countdown)}
        ${renderTaskRecurrence(task)}
        ${renderTaskReminder(task)}
        ${renderTaskDuration(task)}
      </div>
      ${renderTaskSubtasks(task)}
    </div>
    <div class="task-actions">
      <div class="task-reminder-wrap">
        <button class="task-reminder-btn ${task.reminder ? 'has-reminder' : ''}" data-action="reminder" title="${task.reminder ? `תזכורת ${task.reminder} דקות לפני` : 'הגדר תזכורת'}">🔔</button>
        <div class="task-reminder-dropdown" data-task-id="${task.id}">
          <div class="task-reminder-option" data-minutes="1">דקה אחת</div>
          <div class="task-reminder-option" data-minutes="5">5 דקות</div>
          <div class="task-reminder-option" data-minutes="15">15 דקות</div>
          <div class="task-reminder-option" data-minutes="60">שעה</div>
          <div class="task-reminder-option" data-minutes="1440">יום</div>
          ${task.reminder ? '<div class="task-reminder-option remove" data-minutes="0">הסר תזכורת</div>' : ''}
        </div>
      </div>
      <button class="task-action-btn" data-action="edit" title="Edit" aria-label="עריכה">✏️</button>
      <button class="task-action-btn" data-action="duplicate" title="Duplicate" aria-label="שכפל">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>
      <button class="task-action-btn delete" data-action="delete" title="Delete" aria-label="מחק">🗑️</button>
    </div>
  </div>
`;
}

function formatTaskDueDisplay(dueIso) {
  if (!dueIso) return '+ תאריך';
  const dueDate = new Date(dueIso);
  const day = dueDate.getDate();
  const month = dueDate.toLocaleDateString('he-IL', { month: 'short' });
  const time = dueDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${month}, ${time}`;
}

function startInlineTaskTitleEdit(titleEl, task) {
  if (titleEl.dataset.editing === '1') return;
  titleEl.dataset.editing = '1';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = task.title || '';
  input.className = 'inline-edit-input';
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  const finish = (commit) => {
    input.replaceWith(titleEl);
    delete titleEl.dataset.editing;
    if (commit) {
      const newTitle = input.value.trim() || task.title;
      titleEl.textContent = newTitle;
      const { id, isOwn, isShared, ...clean } = task;
      saveTask(task.id, { ...clean, title: newTitle }, task.subject);
    }
  };

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') finish(true);
    else if (ev.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

function startInlineTaskDueEdit(dueEl, task) {
  if (dueEl.dataset.editing === '1') return;
  dueEl.dataset.editing = '1';

  const input = document.createElement('input');
  input.type = 'datetime-local';
  input.value = task.dueDate ? toLocalDatetime(task.dueDate) : '';
  input.className = 'inline-edit-input small';
  dueEl.replaceWith(input);
  input.focus();

  const finish = (commit) => {
    input.replaceWith(dueEl);
    delete dueEl.dataset.editing;
    if (commit) {
      let newDue = null;
      if (input.value) {
        const parsed = parseLocal(input.value);
        if (parsed && !Number.isNaN(parsed.getTime())) {
          newDue = parsed.toISOString();
        } else {
          // invalid -> keep original display
          dueEl.textContent = dueEl.textContent || '+ תאריך';
          return;
        }
      }
      const { id, isOwn, isShared, ...clean } = task;
      saveTask(task.id, { ...clean, dueDate: newDue }, task.subject);
      dueEl.dataset.dueIso = newDue || '';
      dueEl.textContent = newDue ? `📅 ${formatTaskDueDisplay(newDue)}` : '+ תאריך';
      dueEl.classList.toggle('add', !newDue);
    }
  };

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') finish(true);
    else if (ev.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

let activePriorityPopover = null;

function closePriorityPopover() {
  if (activePriorityPopover) {
    activePriorityPopover.remove();
    activePriorityPopover = null;
  }
}

function startInlineTaskPriorityEdit(badgeEl, task) {
  closePriorityPopover();

  const pop = document.createElement('div');
  pop.className = 'priority-popover';

  ['urgent', 'high', 'medium', 'low', 'none'].forEach(key => {
    const btn = document.createElement('button');
    btn.textContent = key === 'none' ? 'ללא עדיפות' : (PRIORITY_LABELS[key] || key);
    btn.dataset.priority = key;
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const { id, isOwn, isShared, ...clean } = task;
      saveTask(task.id, { ...clean, priority: key }, task.subject);
      badgeEl.textContent = key === 'none' ? 'קבע עדיפות' : (PRIORITY_LABELS[key] || key);
      badgeEl.dataset.priority = key;
      badgeEl.classList.toggle('muted', key === 'none');
      closePriorityPopover();
    };
    pop.appendChild(btn);
  });

  const rect = badgeEl.getBoundingClientRect();
  pop.style.top = `${rect.bottom + 8}px`;
  pop.style.left = `${Math.max(8, rect.left - 60)}px`;

  document.body.appendChild(pop);
  activePriorityPopover = pop;

  setTimeout(() => {
    const outsideHandler = (ev) => {
      if (!pop.contains(ev.target)) {
        closePriorityPopover();
        document.removeEventListener('click', outsideHandler);
      }
    };
    document.addEventListener('click', outsideHandler);
  }, 0);
}

let activeReminderPopover = null;

function closeReminderPopover() {
  if (activeReminderPopover) {
    activeReminderPopover.remove();
    activeReminderPopover = null;
  }
}

function openTaskReminderPopover(btnElement, task) {
  closeReminderPopover();
  closePriorityPopover(); // Close others

  const pop = document.createElement('div');
  pop.className = 'task-reminder-dropdown open global-popover'; // Reuse class styles but add global tag

  // Copy styles for standalone positioning
  pop.style.position = 'fixed';
  pop.style.zIndex = '10005';
  pop.style.width = '200px';
  pop.style.background = 'var(--card)';
  pop.style.border = '1px solid var(--border)';
  pop.style.borderRadius = 'var(--radius-md)';
  pop.style.boxShadow = 'var(--shadow-lg)';
  pop.style.padding = '4px';

  const setReminder = (minutes) => {
    const { id, isOwn, isShared, ...cleanTask } = task;
    saveTask(task.id, { ...cleanTask, reminder: minutes || null }, task.subject);
    closeReminderPopover();
  };

  const options = [
    { label: 'דקה אחת', val: 1 },
    { label: '5 דקות', val: 5 },
    { label: '15 דקות', val: 15 },
    { label: 'שעה', val: 60 },
    { label: 'יום', val: 1440 }
  ];

  options.forEach(opt => {
    const div = document.createElement('div');
    div.className = 'task-reminder-option';
    div.textContent = opt.label;
    div.onclick = (e) => { e.stopPropagation(); setReminder(opt.val); };
    pop.appendChild(div);
  });

  if (task.reminder) {
    const removeDiv = document.createElement('div');
    removeDiv.className = 'task-reminder-option remove';
    removeDiv.textContent = 'הסר תזכורת';
    removeDiv.onclick = (e) => { e.stopPropagation(); setReminder(0); };
    pop.appendChild(removeDiv);
  }

  document.body.appendChild(pop);
  activeReminderPopover = pop;

  // Position logic
  const rect = btnElement.getBoundingClientRect();
  const popRect = pop.getBoundingClientRect();

  let top = rect.bottom + 5;
  let left = rect.left;

  // Flip if close to bottom
  if (top + popRect.height > window.innerHeight) {
    top = rect.top - popRect.height - 5;
  }

  // Flip if close to right edge (RTL) or left edge
  if (left + popRect.width > window.innerWidth) {
    left = window.innerWidth - popRect.width - 10;
  }
  if (left < 0) left = 10;

  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;

  // Close on outside click
  setTimeout(() => {
    const outsideHandler = (ev) => {
      if (!pop.contains(ev.target)) {
        closeReminderPopover();
        document.removeEventListener('click', outsideHandler);
      }
    };
    document.addEventListener('click', outsideHandler);
  }, 0);
}

// ============ EVENT DELEGATION FOR TASK LIST ============
// Single click handler for all task interactions - much more efficient than per-item listeners
function setupTaskEventDelegation() {
  const containers = [activeTasks, completedTasks];

  containers.forEach(container => {
    if (!container) return;

    container.addEventListener('click', (e) => {
      const taskItem = e.target.closest('.task-item');
      if (!taskItem) return;

      const taskId = taskItem.dataset.id;
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      const titleEl = e.target.closest('.task-title');
      if (titleEl) {
        e.stopPropagation();
        startInlineTaskTitleEdit(titleEl, task);
        return;
      }

      const dueEl = e.target.closest('.task-due');
      if (dueEl) {
        e.stopPropagation();
        startInlineTaskDueEdit(dueEl, task);
        return;
      }

      const priorityEl = e.target.closest('.task-priority-badge');
      if (priorityEl) {
        e.stopPropagation();
        startInlineTaskPriorityEdit(priorityEl, task);
        return;
      }

      // Reminder button
      const reminderBtn = e.target.closest('.task-reminder-btn');
      if (reminderBtn) {
        e.stopPropagation();
        openTaskReminderPopover(reminderBtn, task);
        return;
      }

      // Check what was clicked
      const action = e.target.closest('[data-action]')?.dataset.action;
      const isSubtaskCheckbox = e.target.closest('.task-subtask input[type="checkbox"]');
      const isInlineInput = e.target.tagName === 'INPUT' && e.target.classList.contains('inline-edit-input');
      const isMainArea = e.target.closest('.task-main') && !isSubtaskCheckbox && !isInlineInput;

      if (action === 'toggle' || e.target.closest('.task-checkbox')) {
        // Toggle complete
        e.stopPropagation();
        const nextCompleted = !task.completed;
        if (nextCompleted) {
          maybeCreateRecurringTask(task);
          // Add confetti celebration animation
          if (typeof createConfetti === 'function') {
            const rect = taskItem.getBoundingClientRect();
            createConfetti(rect.left + 20, rect.top + rect.height / 2);
          }
          taskItem.classList.add('completing');
          setTimeout(() => taskItem.classList.remove('completing'), 500);
          // Push to undo stack
          if (typeof pushToUndoStack === 'function') {
            pushToUndoStack({ type: 'completeTask', taskId, message: `✅ "${task.title}" הושלם` });
          }
        }
        const { id, isOwn, isShared, ...cleanTask } = task;
        // Update completion status AND timestamp
        // If completing -> set completedAt to now
        // If uncompleting -> set completedAt to null
        const completedAt = nextCompleted ? Date.now() : null;
        saveTask(taskId, { ...cleanTask, completed: nextCompleted, completedAt }, task.subject);
      } else if (action === 'edit') {
        // Edit button
        e.stopPropagation();
        openTaskEditModal(taskId);

      } else if (action === 'duplicate') {
        // Duplicate button
        e.stopPropagation();
        pushTaskClone(task);
      } else if (action === 'delete') {
        // Delete button
        e.stopPropagation();
        removeTask(task);
      } else if (isSubtaskCheckbox) {
        // Subtask checkbox
        e.stopPropagation();
        const idx = Number.parseInt(isSubtaskCheckbox.dataset.index);
        if (task.checklist && task.checklist[idx] !== undefined) {
          task.checklist[idx].checked = isSubtaskCheckbox.checked;
          const { id, isOwn, isShared, ...cleanTask } = task;
          saveTask(taskId, cleanTask, task.subject);
        }
      } else if (isMainArea) {
        // Click on main area to edit
        openTaskEditModal(taskId);
      }
    });
  });
}

// Initialize event delegation once
setupTaskEventDelegation();

// Close task reminder dropdowns when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.task-reminder-wrap')) {
    document.querySelectorAll('.task-reminder-dropdown.open').forEach(d => d.classList.remove('open'));
  }
  // Close sort dropdown when clicking outside
  if (!e.target.closest('.task-sort-dropdown')) {
    if (taskSortMenu) taskSortMenu.classList.remove('open');
  }
});

// Task sort dropdown toggle and selection
if (taskSortBtn && taskSortMenu) {
  // Set initial label from saved preference
  if (taskSortLabel && SORT_LABELS[currentTaskSort]) {
    taskSortLabel.textContent = SORT_LABELS[currentTaskSort];
  }
  // Update selected state
  taskSortMenu.querySelectorAll('.task-sort-option').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.sort === currentTaskSort);
  });

  taskSortBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    taskSortMenu.classList.toggle('open');
  });

  taskSortMenu.addEventListener('click', (e) => {
    const option = e.target.closest('.task-sort-option');
    if (!option) return;
    e.stopPropagation();

    const sortType = option.dataset.sort;
    currentTaskSort = sortType;
    localStorage.setItem('task-sort-preference', sortType);

    if (typeof clearManualTaskOrder === 'function') {
      clearManualTaskOrder();
    }

    // Update UI
    if (taskSortLabel) taskSortLabel.textContent = SORT_LABELS[sortType] || sortType;
    taskSortMenu.querySelectorAll('.task-sort-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.sort === sortType);
    });
    taskSortMenu.classList.remove('open');

    // Re-render tasks with new sort
    renderTasks();
  });
}

let draggingTaskId = null;
let dragSourceContainer = null;

function ensureTaskOrderInitialized() {
  // Don't initialize order for tasks - let sortTasks handle the default sorting
  // Only tasks that have been manually dragged will have manualOrder: true
  return;
}

function clearManualTaskOrder() {
  const updates = [];
  tasks.forEach(task => {
    if (task.manualOrder === true || Number.isFinite(task.order)) {
      task.manualOrder = false;
      task.order = null;
      updates.push(task);
    }
  });

  updates.forEach(task => {
    const { id, ...cleanTask } = task;
    saveTask(task.id, cleanTask, task.subject);
  });
}

function updateTaskOrderFromContainer(container) {
  const items = Array.from(container.querySelectorAll('.task-item'));
  const updates = [];

  items.forEach((item, index) => {
    const taskId = item.dataset.id;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    if (task.order !== index || !task.manualOrder) {
      task.order = index;
      task.manualOrder = true; // Mark as manually ordered when dragged
      updates.push(task);
    }
  });

  updates.forEach((task) => {
    const { id, ...cleanTask } = task;
    saveTask(task.id, cleanTask, task.subject);
  });
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.task-item:not(.dragging)')];
  let closest = { offset: Number.NEGATIVE_INFINITY, element: null };

  draggableElements.forEach(child => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      closest = { offset, element: child };
    }
  });

  return closest.element;
}

function clearTaskDragState() {
  document.querySelectorAll('.task-item.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.subject-list-header.drag-over, .subject-child-item.drag-over').forEach(el => {
    el.classList.remove('drag-over');
  });
  draggingTaskId = null;
  dragSourceContainer = null;
}

function assignTaskToSubject(taskId, subjectId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task || task.subject === subjectId) {
    clearTaskDragState();
    return;
  }

  // When moving tasks between own/shared, need to delete from old location and create in new
  const oldSubject = subjects.find(s => s.id === task.subject);
  const newSubject = subjects.find(s => s.id === subjectId);
  const wasShared = oldSubject?.isShared;
  const willBeShared = newSubject?.isShared;

  if (wasShared !== willBeShared) {
    // Moving between own and shared - need to delete from old and create in new
    const { id, isShared, ...cleanTask } = task;
    cleanTask.subject = subjectId || '';

    // Remove from old location
    removeTask(task);

    // Create in new location
    if (willBeShared) {
      const newTaskRef = push(ref(db, `sharedSubjects/${subjectId}/tasks`));
      set(newTaskRef, cleanTask);
    } else {
      const newTaskRef = push(tasksRef);
      set(newTaskRef, cleanTask);
    }
  } else {
    // Same type - just update the subject field
    const { id, ...cleanTask } = task;
    saveTask(taskId, { ...cleanTask, subject: subjectId || '' }, subjectId || task.subject);
  }
  clearTaskDragState();
}

function setupTaskDragAndDrop() {
  const containers = [activeTasks, completedTasks];

  containers.forEach(container => {
    if (!container) return;

    container.addEventListener('dragstart', (e) => {
      // Prevent drag on mobile to avoid click conflicts
      if (isMobile()) {
        e.preventDefault();
        return;
      }
      const item = e.target.closest('.task-item');
      if (!item) return;
      if (e.target.closest('input, textarea, select, button, a')) {
        e.preventDefault();
        return;
      }
      draggingTaskId = item.dataset.id;
      dragSourceContainer = container;
      item.classList.add('dragging');
      ensureTaskOrderInitialized();
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggingTaskId);
      }
    });

    container.addEventListener('dragover', (e) => {
      if (!draggingTaskId || dragSourceContainer !== container) return;
      e.preventDefault();
      const draggingEl = container.querySelector('.task-item.dragging');
      if (!draggingEl) return;
      const afterElement = getDragAfterElement(container, e.clientY);
      if (afterElement == null) {
        container.appendChild(draggingEl);
      } else if (afterElement !== draggingEl) {
        afterElement.before(draggingEl);
      }
    });

    container.addEventListener('drop', (e) => {
      if (!draggingTaskId || dragSourceContainer !== container) return;
      e.preventDefault();
      updateTaskOrderFromContainer(container);
      clearTaskDragState();
    });

    container.addEventListener('dragend', () => {
      clearTaskDragState();
    });
  });
}

setupTaskDragAndDrop();

// Task countdown ticker
function startTaskTicker() {
  if (taskTickerHandle) return;
  const tick = () => {
    document.querySelectorAll('.task-countdown[data-due]').forEach(el => {
      const dueDate = el.dataset.due;
      const countdown = calcTaskCountdown(dueDate);
      if (countdown) {
        el.textContent = countdown.text;
        el.className = 'task-countdown ' + (countdown.overdue ? 'overdue' : (countdown.urgency === 'soon' ? 'soon' : ''));
      }
    });
  };
  tick();
  taskTickerHandle = setInterval(tick, 10000); // Check every 10 seconds for accuracy
}
ctx.startTaskTicker = startTaskTicker;

async function checkTaskReminders(nowMs = Date.now()) {
  if (taskReminderCheckInFlight) return;
  taskReminderCheckInFlight = true;
  try {
    const state = reminderCheckState.tasks;
    const { start, isCatchup } = getReminderWindow(state.lastCheck, nowMs);
    const candidates = [];

    tasks.forEach(task => {
      // For recurring tasks: notifications fire regardless of completion status
      // Each occurrence is independent - completion doesn't affect future reminders
      // For non-recurring tasks: skip if completed
      if (task.completed && !task.recurrence) return;
      
      const reminderMinutes = Number.parseInt(task.reminder, 10) || 0;
      if (!reminderMinutes) return;
      if (!task.dueDate) return;
      
      // Convert dueDate to ISO string for consistent dedupe key format with server
      const dueDateIso = new Date(task.dueDate).toISOString();
      const reminderKey = `${dueDateIso}|${reminderMinutes}`;
      const entry = notifiedTasks.get(task.id);
      if (entry && entry.key === reminderKey) return;
      const taskTime = new Date(task.dueDate).getTime();
      if (!Number.isFinite(taskTime)) return;
      const triggerTime = taskTime - (reminderMinutes * 60000);
      if (triggerTime < start || triggerTime > nowMs) return;
      
      // Use ISO format for dedupe key to match server-side format exactly
      const dedupeKey = task.isShared
        ? `shared-task|${currentUser || ''}|${task.subject || ''}|${task.id}|${dueDateIso}|${reminderMinutes}`
        : `task|${currentUser || ''}|${task.id}|${dueDateIso}|${reminderMinutes}`;
      candidates.push({ task, reminderKey, triggerTime, dedupeKey });
    });

    if (candidates.length) {
      if (isCatchup && candidates.length > REMINDER_CATCHUP_MAX_COUNT) {
        candidates.sort((a, b) => b.triggerTime - a.triggerTime);
        candidates.length = REMINDER_CATCHUP_MAX_COUNT;
      } else {
        candidates.sort((a, b) => a.triggerTime - b.triggerTime);
      }
      for (const item of candidates) {
        if (item.dedupeKey && await wasDedupeKeySeen(item.dedupeKey, nowMs)) {
          notifiedTasks.set(item.task.id, { key: item.reminderKey, ts: nowMs });
          continue;
        }
        if (item.dedupeKey) await markDedupeKeySeen(item.dedupeKey, nowMs);
        triggerTaskAlert(item.task);
        notifiedTasks.set(item.task.id, { key: item.reminderKey, ts: nowMs });
      }
      persistNotifiedMap(NOTIFY_KEYS.TASKS, notifiedTasks);
    }

    state.lastCheck = nowMs;
    persistLastCheck(state, nowMs);
  } catch (e) {
    console.warn('[Notifications] Task reminder check failed:', e);
  } finally {
    taskReminderCheckInFlight = false;
  }
}

function startTaskReminderTicker() {
  if (taskReminderTickerHandle) return;
  checkTaskReminders();
  taskReminderTickerHandle = setInterval(() => {
    checkTaskReminders();
  }, 10000);
}

async function triggerTaskAlert(task) {
  const dueDate = new Date(task.dueDate);
  const dateStr = dueDate.toLocaleDateString('he-IL', { weekday: 'long', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const title = `📋 תזכורת משימה: ${task.title}`;
  const message = `מועד יעד: ${dateStr}`;

  // Native notification sound is used instead of custom playReminderSound()

  // Show browser notification if permitted - use Service Worker for mobile compatibility
  showSystemNotification(title, {
    body: message,
    tag: `task-${task.id}`,
    renotify: true
  }).catch(() => { });

  // Show in-app alert
  showEventAlert(title, message, true);
}

function stopTaskTicker() {
  if (taskTickerHandle) {
    clearInterval(taskTickerHandle);
    taskTickerHandle = null;
  }
}

// Task Edit Modal
function openTaskEditModal(taskId) {
  editingTaskId = taskId;
  editingTask = JSON.parse(JSON.stringify(tasks.find(t => t.id === taskId)));
  if (!editingTask) return;

  editTaskTitle.value = editingTask.title || '';
  editTaskContent.value = editingTask.content || '';

  // Set priority
  editTaskPriority.querySelectorAll('.priority-option').forEach(o => {
    o.classList.toggle('selected', o.dataset.priority === (editingTask.priority || 'none'));
  });

  setTaskColorSelection(taskColorPicker, editingTask.color || '');
  updateSubjectColorOption(taskColorPicker, getSubjectColorById(editingTask.subject || ''));

  // Set due date
  if (editingTask.dueDate) {
    editTaskDue.value = toLocalDatetime(editingTask.dueDate);
  } else {
    editTaskDue.value = '';
  }

  // Set duration
  if (editTaskDuration) {
    editTaskDuration.value = editingTask.duration || 0;
  }

  if (editTaskRecurrence) {
    setTaskRecurrenceUI(editTaskRecurrence, editTaskRecurrenceCustomWrap, editTaskRecurrenceCustomValue, editTaskRecurrenceCustomUnit, editingTask.recurrence);
  }

  // Set reminder with custom support
  if (editTaskReminder) {
    setTaskReminderUI(editTaskReminder, editTaskReminderCustomWrap, editTaskReminderCustomValue, editTaskReminderCustomUnit, editingTask.reminder || 0);
  }

  // Render checklist
  renderEditChecklist();

  taskEditModal.classList.add('open');
}

function closeTaskEditModal() {
  taskEditModal.classList.remove('open');
  editingTaskId = null;
  editingTask = null;
}
ctx.closeTaskEditModal = closeTaskEditModal;
ctx.openTaskEditModal = openTaskEditModal;

taskEditModal.addEventListener('click', (e) => {
  if (e.target === taskEditModal) closeTaskEditModal();
});

// Edit modal priority picker
editTaskPriority.addEventListener('click', (e) => {
  const option = e.target.closest('.priority-option');
  if (!option || !editingTask) return;
  editTaskPriority.querySelectorAll('.priority-option').forEach(o => o.classList.remove('selected'));
  option.classList.add('selected');
  editingTask.priority = option.dataset.priority;
});

bindTaskColorPicker(taskColorPicker, (color) => {
  if (editingTask) {
    editingTask.color = color || '';
  }
});

// Clear due date
// Quick Date Options Handler
const quickDateContainer = document.querySelector('.quick-date-options');
if (quickDateContainer) {
  quickDateContainer.addEventListener('click', (e) => {
    if (!e.target.classList.contains('quick-date-btn')) return;
    const action = e.target.dataset.action;
    const now = new Date();
    let targetDate = new Date();

    switch (action) {
      case 'today':
        // Today at 23:59
        targetDate.setHours(23, 59, 0, 0);
        break;
      case 'tomorrow':
        // Tomorrow at 09:00
        targetDate.setDate(now.getDate() + 1);
        targetDate.setHours(9, 0, 0, 0);
        break;
      case 'nextWeek':
        // Next week (+7 days) at 09:00
        targetDate.setDate(now.getDate() + 7);
        targetDate.setHours(9, 0, 0, 0);
        break;
      case 'clear':
        if (editTaskDue) editTaskDue.value = '';
        return;
    }

    // Format to YYYY-MM-DDTHH:mm
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    const hours = String(targetDate.getHours()).padStart(2, '0');
    const minutes = String(targetDate.getMinutes()).padStart(2, '0');

    if (editTaskDue) {
      editTaskDue.value = `${year}-${month}-${day}T${hours}:${minutes}`;
    }
  });
}

function renderEditChecklist() {
  if (!editingTask.checklist) editingTask.checklist = [];
  editTaskChecklist.innerHTML = editingTask.checklist.map((item, i) => `
  <div class="task-checklist-item ${item.checked ? 'checked' : ''}">
    <input type="checkbox" ${item.checked ? 'checked' : ''} data-index="${i}" />
    <span>${escapeHtml(item.text)}</span>
    <button class="task-action-btn delete" data-index="${i}" style="margin-left: auto;">×</button>
  </div>
`).join('');

  // Add handlers
  editTaskChecklist.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const idx = Number.parseInt(cb.dataset.index);
      editingTask.checklist[idx].checked = cb.checked;
      renderEditChecklist();
    });
  });

  editTaskChecklist.querySelectorAll('.task-action-btn.delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number.parseInt(btn.dataset.index);
      editingTask.checklist.splice(idx, 1);
      renderEditChecklist();
    });
  });
}

addChecklistItem.onclick = () => {
  const text = newChecklistItem.value.trim();
  if (!text || !editingTask) return;
  editingTask.checklist.push({ text, checked: false });
  newChecklistItem.value = '';
  renderEditChecklist();
};

newChecklistItem.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') addChecklistItem.click();
});

// Delete task
deleteTaskBtn.onclick = () => {
  if (!editingTaskId) return;
  remove(ref(db, `users/${currentUser}/tasks/${editingTaskId}`));
  closeTaskEditModal();
};

if (duplicateTaskBtn) {
  duplicateTaskBtn.onclick = () => {
    if (!editingTask) return;
    pushTaskClone(editingTask);
    closeTaskEditModal();
  };
}

// Save task
saveTaskBtn.onclick = () => {
  if (!editingTaskId || !editingTask) return;

  const oldSubjectId = editingTask.subject;
  const newSubjectId = editTaskSubject.value || '';

  editingTask.title = editTaskTitle.value.trim() || 'Untitled';
  editingTask.content = editTaskContent.value.trim();
  editingTask.subject = newSubjectId;
  editingTask.color = getTaskColorFromPicker(taskColorPicker) || '';
  const recurrenceResult = getTaskRecurrenceValue(editTaskRecurrence, editTaskRecurrenceCustomValue, editTaskRecurrenceCustomUnit);
  if (recurrenceResult.error) {
    alert(recurrenceResult.error);
    return;
  }
  if (recurrenceResult.value) {
    editingTask.recurrence = recurrenceResult.value;
  } else {
    delete editingTask.recurrence;
  }

  // Update reminder (with custom support)
  const reminderValue = getTaskReminderMinutes(editTaskReminder, editTaskReminderCustomValue, editTaskReminderCustomUnit);
  if (reminderValue > 0) {
    editingTask.reminder = reminderValue;
  } else {
    delete editingTask.reminder;
  }

  // Update due date
  const dueValue = editTaskDue.value;
  if (dueValue) {
    const parsedDue = parseLocal(dueValue);
    editingTask.dueDate = parsedDue ? parsedDue.toISOString() : null;
  } else {
    editingTask.dueDate = null;
  }

  // Update duration
  if (editTaskDuration) {
    const durationValue = Number.parseInt(editTaskDuration.value, 10) || 0;
    if (durationValue > 0) {
      editingTask.duration = durationValue;
    } else {
      delete editingTask.duration;
    }
  }

  // Check if moving between own/shared subjects
  const oldSubject = subjects.find(s => s.id === oldSubjectId);
  const newSubject = subjects.find(s => s.id === newSubjectId);
  const wasShared = oldSubject?.isShared || editingTask.isShared;
  const willBeShared = newSubject?.isShared;

  // Remove id and isShared before saving to Firebase
  const { id, isShared, ...cleanTask } = editingTask;

  if (wasShared !== willBeShared && oldSubjectId !== newSubjectId) {
    // Moving between own and shared - delete from old, create in new
    if (wasShared) {
      remove(ref(db, `sharedSubjects/${oldSubjectId}/tasks/${editingTaskId}`));
    } else {
      remove(ref(db, `users/${currentUser}/tasks/${editingTaskId}`));
    }

    if (willBeShared) {
      const newTaskRef = push(ref(db, `sharedSubjects/${newSubjectId}/tasks`));
      set(newTaskRef, cleanTask);
    } else {
      const newTaskRef = push(tasksRef);
      set(newTaskRef, cleanTask);
    }
  } else {
    // Same type - just update in place
    saveTask(editingTaskId, cleanTask, newSubjectId || oldSubjectId);
  }
  closeTaskEditModal();
};

// Enter key to save, Escape key to close for task edit modal
[editTaskTitle, editTaskContent, editTaskDue].forEach(el => {
  if (el) {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        saveTaskBtn.click();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeTaskEditModal();
      }
    });
  }
});

// Global Escape key handler for modals
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Close task edit modal if open
    if (taskEditModal && taskEditModal.style.display !== 'none' && taskEditModal.classList.contains('show')) {
      closeTaskEditModal();
      e.preventDefault();
      return;
    }
    // Close event edit modal if open
    // Close event edit modal if open
    if (typeof eventModal !== 'undefined' && eventModal && eventModal.style.display !== 'none') {
      eventModal.style.display = 'none';
      editingId = null;
      e.preventDefault();
      return;
    }
    // Close subject modal if open
    if (subjectModal && subjectModal.style.display !== 'none') {
      subjectModal.style.display = 'none';
      e.preventDefault();
      return;
    }
  }
});

// ============ 11. SUBJECTS / CATEGORIES ============

const cachedSubjectsKey = `${CACHE_KEYS.SUBJECTS_PREFIX}${currentUser}`;
const cachedSubjects = readCache(cachedSubjectsKey);
if (cachedSubjects && cachedSubjects.length) {
  subjects = cachedSubjects;
  syncCacheUsed.subjects = true;
  markSyncReady('subjects', 'cache');
  updateSyncBadge();
  renderSubjectsSidebar();
  updateSubjectSelectors();
  updateParentSubjectSelector();
} else {
  startSyncTimeout('subjects', SUBJECTS_NO_CACHE_TIMEOUT_MS, 'no-cache', () => {
    renderSubjectsSidebar();
    updateSubjectSelectors();
    updateParentSubjectSelector();
  });
}

// Listen to subjects from Firebase
startSyncTimeout('subjects', SYNC_TIMEOUT_MS, 'firebase', () => {
  renderSubjectsSidebar();
  updateSubjectSelectors();
  updateParentSubjectSelector();
});

// Own subjects
let ownSubjects = [];
// Shared subjects (from sharedSubjects where current user is a member)
let sharedSubjects = [];

function mergeSubjects() {
  // Combine own subjects with shared subjects
  subjects = [...ownSubjects, ...sharedSubjects];
  renderSubjectsSidebar();
  updateSubjectSelectors();
  updateParentSubjectSelector();
}

onValue(subjectsRef, (snapshot) => {
  clearSyncTimeouts('subjects');
  const data = snapshot.val();
  if (data) {
    ownSubjects = Object.keys(data).map(key => ({ id: key, ...data[key], isOwn: true }));
  } else {
    ownSubjects = [];
  }
  writeCache(cachedSubjectsKey, ownSubjects, 200);
  markSyncReady('subjects', 'firebase');
  mergeSubjects();
}, (error) => {
  console.error('Subjects sync error:', error);
  clearSyncTimeouts('subjects');
  markSyncReady('subjects', 'error');
  updateSyncBadge();
});

// Listen to shared subjects
const sharedSubjectsRef = ref(db, 'sharedSubjects');
onValue(sharedSubjectsRef, (snapshot) => {
  const data = snapshot.val();
  if (data) {
    sharedSubjects = Object.keys(data)
      .map(key => ({ id: key, ...data[key], isShared: true }))
      .filter(s => {
        // Only include subjects where current user is owner or member
        const members = s.members || {};
        return s.owner === currentUser || members[currentUser];
      });
  } else {
    sharedSubjects = [];
  }
  mergeSubjects();
  // Also sync shared tasks
  syncSharedTasks();
});

// Shared tasks storage
let sharedTasks = [];
let sharedTasksListeners = []; // Store unsubscribe functions

function syncSharedTasks() {
  // Unsubscribe from previous listeners
  sharedTasksListeners.forEach(unsub => unsub());
  sharedTasksListeners = [];
  sharedTasks = [];

  // Set up listeners for each shared subject's tasks
  sharedSubjects.forEach(subject => {
    const tasksRef = ref(db, `sharedSubjects/${subject.id}/tasks`);
    const unsubscribe = onValue(tasksRef, (snap) => {
      const tasksData = snap.val();
      // Remove old tasks for this subject
      sharedTasks = sharedTasks.filter(t => t.subject !== subject.id);
      // Add new tasks
      if (tasksData) {
        Object.keys(tasksData).forEach(taskId => {
          sharedTasks.push({
            id: taskId,
            ...tasksData[taskId],
            subject: subject.id,
            isShared: true
          });
        });
      }
      mergeTasks();
    });
    sharedTasksListeners.push(unsubscribe);
  });

  // If no shared subjects, just merge
  if (sharedSubjects.length === 0) {
    mergeTasks();
  }
}

// Own tasks storage
let ownTasks = [];
Object.defineProperty(ctx, 'ownTasks', { get: () => ownTasks, set: (val) => { ownTasks = val; } });

function mergeTasks() {
  tasks = [...ownTasks, ...sharedTasks];
  if (taskManagerOverlay.classList.contains('open')) {
    renderTasks();
  }
  // Update daily planner if open
  if (window.DailyPlanner && window.DailyPlanner.refreshTasks) {
    window.DailyPlanner.refreshTasks();
  }
  checkTaskReminders();
}
ctx.mergeTasks = mergeTasks;

// Get top-level subjects (no parent)
function getTopLevelSubjects() {
  return subjects.filter(s => !s.parentId);
}

// Get children of a subject
function getChildSubjects(parentId) {
  return subjects.filter(s => s.parentId === parentId);
}

// Count tasks for a subject including children
function countSubjectTasks(subjectId, includeChildren = true) {
  let count = tasks.filter(t => t.subject === subjectId && !t.completed).length;
  if (includeChildren) {
    const children = getChildSubjects(subjectId);
    children.forEach(c => {
      count += tasks.filter(t => t.subject === c.id && !t.completed).length;
    });
  }
  return count;
}

// ============ SMART VIEWS COUNTS ============
function updateSmartViewCounts() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekLater = new Date(today);
  weekLater.setDate(weekLater.getDate() + 7);

  const activeTasks = tasks.filter(t => !t.completed);

  const allCount = activeTasks.length;
  const todayCount = activeTasks.filter(t => {
    if (!t.dueDate) return false;
    const due = new Date(t.dueDate);
    return due >= today && due < tomorrow;
  }).length;
  const tomorrowCount = activeTasks.filter(t => {
    if (!t.dueDate) return false;
    const due = new Date(t.dueDate);
    return due >= tomorrow && due < weekLater && due < new Date(tomorrow.getTime() + 86400000); // Only exactly tomorrow
  }).length;

  const weekCount = activeTasks.filter(t => {
    if (!t.dueDate) return false;
    const due = new Date(t.dueDate);
    return due >= today && due < weekLater;
  }).length;
  const overdueCount = activeTasks.filter(t => {
    if (!t.dueDate) return false;
    const due = new Date(t.dueDate);
    return due < now; // Use 'now' for accurate overdue detection
  }).length;
  const noDateCount = activeTasks.filter(t => !t.dueDate).length;

  // Update counts
  const countAll = $('countAll');
  const countToday = $('countToday');
  const countTomorrow = $('countTomorrow');
  const countWeek = $('countWeek');
  const countOverdue = $('countOverdue');
  const countNoDate = $('countNoDate');

  if (countAll) countAll.textContent = allCount;
  if (countToday) countToday.textContent = todayCount;
  if (countTomorrow) countTomorrow.textContent = tomorrowCount;
  if (countWeek) countWeek.textContent = weekCount;
  if (countOverdue) countOverdue.textContent = overdueCount;
  if (countNoDate) countNoDate.textContent = noDateCount;
}

// ============ 12. TASK CALENDAR ============
let currentTaskMonth = new Date();
Object.defineProperty(ctx, 'currentTaskMonth', { get: () => currentTaskMonth, set: (val) => { currentTaskMonth = val; } });
let taskCalendarExpanded = false;
let taskCalendarView = 'month';
let taskCalendarFocusDate = new Date();
const taskCalendarGrid = $("taskCalendarGrid");
const taskCalendarTitle = $("taskCalendarTitle");
const taskMonthEvents = $("taskMonthEvents");
const taskMonthEventsTitle = $("taskMonthEventsTitle");
const toggleTaskCalendarSize = $("toggleTaskCalendarSize");
const taskCalendarViewToggle = $("taskCalendarViewToggle");
const taskRightSidebar = $("taskRightSidebar");

// Event delegation for Task calendar in Task Manager
if (taskCalendarGrid) {
  taskCalendarGrid.addEventListener('click', (e) => {
    const chip = e.target.closest('.calendar-event-chip');
    if (chip) {
      e.stopPropagation();
      const taskId = chip.dataset.taskId;
      if (taskId) {
        const taskRow = document.querySelector(`.task-item[data-id="${taskId}"]`);
        if (taskRow) {
          taskRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
          taskRow.style.transition = 'box-shadow 0.3s';
          taskRow.style.boxShadow = '0 0 0 3px var(--accent)';
          setTimeout(() => { taskRow.style.boxShadow = ''; }, 800);
        }
      }
      return;
    }

    const day = e.target.closest('.calendar-day:not(.other-month)');
    if (day) {
      const dateKey = day.dataset.date;
      if (!dateKey) return;
      const focusDate = new Date(`${dateKey}T00:00`);
      if (!Number.isNaN(focusDate.getTime())) {
        setTaskCalendarFocus(focusDate);
      }
      const taskDueInput = $("newTaskDue");
      const taskTitleInput = $("newTaskTitle");
      const quickRow = $("quickAddRow");
      if (taskDueInput) taskDueInput.value = dateKey + 'T23:59';
      if (taskTitleInput) taskTitleInput.focus();
      if (quickRow) quickRow.style.display = 'flex';
      if (quickAddTask) {
        quickAddTask.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  });
}

function getTaskCalendarMaxShow() {
  if (taskCalendarView === 'day') return taskCalendarExpanded ? 15 : 8;
  if (taskCalendarView === 'week') return taskCalendarExpanded ? 8 : 4;
  return taskCalendarExpanded ? 5 : 3;
}

function updateTaskCalendarViewToggle() {
  if (!taskCalendarViewToggle) return;
  taskCalendarViewToggle.querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === taskCalendarView);
  });
}

function updateTaskCalendarViewClasses() {
  if (!taskRightSidebar) return;
  taskRightSidebar.classList.toggle('calendar-view-week', taskCalendarView === 'week');
  taskRightSidebar.classList.toggle('calendar-view-day', taskCalendarView === 'day');
}

function setTaskCalendarView(view) {
  const prevView = taskCalendarView;
  taskCalendarView = view;
  if (taskCalendarView === 'month') {
    currentTaskMonth = new Date(taskCalendarFocusDate.getFullYear(), taskCalendarFocusDate.getMonth(), 1);
  } else if (prevView === 'month') {
    const base = new Date(currentTaskMonth.getFullYear(), currentTaskMonth.getMonth(), taskCalendarFocusDate.getDate() || 1);
    setTaskCalendarFocus(base);
  }
  updateTaskCalendarViewToggle();
  updateTaskCalendarViewClasses();
  renderTaskCalendar();
}

function setTaskCalendarFocus(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return;
  d.setHours(0, 0, 0, 0);
  taskCalendarFocusDate = d;
}

function getStartOfWeek(date) {
  const d = new Date(date);
  const dayIndex = d.getDay();
  d.setDate(d.getDate() - dayIndex);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatHebrewShortDate(date) {
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}
Object.assign(ctx, { getStartOfWeek, formatHebrewShortDate });

function renderTaskCalendar() {
  if (!taskCalendarGrid || !taskCalendarTitle) return;

  updateTaskCalendarViewToggle();
  updateTaskCalendarViewClasses();

  const today = new Date();
  const todayKey = toDateKey(today);

  // Build task map by date (exclude countdowns/events)
  const tasksByDate = {};
  tasks.forEach(task => {
    if (!task.dueDate) return;
    if (task.isCountdown || task.isEvent) return;
    const key = toDateKey(task.dueDate);
    if (!tasksByDate[key]) tasksByDate[key] = [];
    tasksByDate[key].push(task);
  });

  let html = '';
  const maxShow = getTaskCalendarMaxShow();

  if (taskCalendarView === 'month') {
    const year = currentTaskMonth.getFullYear();
    const month = currentTaskMonth.getMonth();
    taskCalendarTitle.textContent = `${HEBREW_MONTHS[month]} ${year}`;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    for (let i = 0; i < 7; i++) {
      html += `<div class="calendar-day-name">${HEBREW_DAYS[i]}</div>`;
    }

    const prevMonth = new Date(year, month, 0);
    const prevDays = prevMonth.getDate();
    for (let i = startDay - 1; i >= 0; i--) {
      const day = prevDays - i;
      html += `<div class="calendar-day other-month"><div class="calendar-day-number">${day}</div></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateKey === todayKey;
      const dayTasks = tasksByDate[dateKey] || [];
      let classes = 'calendar-day';
      if (isToday) classes += ' today';

      let eventsHtml = '<div class="calendar-day-events">';
      const showTime = dayTasks.length > 1;
      dayTasks.slice(0, maxShow).forEach(task => {
        const subjectColor = subjects.find(s => s.id === task.subject)?.color;
        const resolvedColor = resolveTaskColor(task, subjectColor);
        const color = resolvedColor || subjectColor || '#667eea';
        const safeName = escapeHtml(task.title);
        const evtDate = new Date(task.dueDate);
        const timeStr = showTime ? `${String(evtDate.getHours()).padStart(2, '0')}:${String(evtDate.getMinutes()).padStart(2, '0')} ` : '';
        const displayText = timeStr + safeName;
        eventsHtml += `<div class="calendar-event-chip" style="background: ${color}" title="${safeName}" aria-label="${safeName}" data-task-id="${task.id}">${displayText}</div>`;
      });
      if (dayTasks.length > maxShow) {
        eventsHtml += `<div class="calendar-more">+${dayTasks.length - maxShow} עוד</div>`;
      }
      eventsHtml += '</div>';

      html += `<div class="${classes}" data-date="${dateKey}">
      <div class="calendar-day-number">${day}</div>
      ${eventsHtml}
    </div>`;
    }

    const totalCells = startDay + daysInMonth;
    const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remainingCells; i++) {
      html += `<div class="calendar-day other-month"><div class="calendar-day-number">${i}</div></div>`;
    }
  } else if (taskCalendarView === 'week') {
    const focus = taskCalendarFocusDate || new Date();
    const start = getStartOfWeek(focus);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    taskCalendarTitle.textContent = `שבוע ${formatHebrewShortDate(start)} - ${formatHebrewShortDate(end)}`;

    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(start);
      dayDate.setDate(start.getDate() + i);
      html += `<div class="calendar-day-name">${HEBREW_DAYS[dayDate.getDay()]}</div>`;
    }

    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(start);
      dayDate.setDate(start.getDate() + i);
      const dateKey = toDateKey(dayDate);
      const dayTasks = tasksByDate[dateKey] || [];
      const isToday = dateKey === todayKey;
      const isOtherMonth = dayDate.getMonth() !== focus.getMonth();
      let classes = 'calendar-day';
      if (isToday) classes += ' today';
      if (isOtherMonth) classes += ' other-month';

      let eventsHtml = '<div class="calendar-day-events">';
      const showTime = true;
      dayTasks.slice(0, maxShow).forEach(task => {
        const subjectColor = subjects.find(s => s.id === task.subject)?.color;
        const resolvedColor = resolveTaskColor(task, subjectColor);
        const color = resolvedColor || subjectColor || '#667eea';
        const safeName = escapeHtml(task.title);
        const evtDate = new Date(task.dueDate);
        const timeStr = showTime ? `${String(evtDate.getHours()).padStart(2, '0')}:${String(evtDate.getMinutes()).padStart(2, '0')} ` : '';
        const displayText = timeStr + safeName;
        eventsHtml += `<div class="calendar-event-chip" style="background: ${color}" title="${safeName}" aria-label="${safeName}" data-task-id="${task.id}">${displayText}</div>`;
      });
      if (dayTasks.length > maxShow) {
        eventsHtml += `<div class="calendar-more">+${dayTasks.length - maxShow} עוד</div>`;
      }
      eventsHtml += '</div>';

      html += `<div class="${classes}" data-date="${dateKey}">
      <div class="calendar-day-number">${dayDate.getDate()}</div>
      ${eventsHtml}
    </div>`;
    }
  } else {
    const focus = taskCalendarFocusDate || new Date();
    const dateKey = toDateKey(focus);
    taskCalendarTitle.textContent = focus.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    html += `<div class="calendar-day-name">${HEBREW_DAYS[focus.getDay()]}</div>`;

    const dayTasks = tasksByDate[dateKey] || [];
    const isToday = dateKey === todayKey;
    let classes = 'calendar-day';
    if (isToday) classes += ' today';

    let eventsHtml = '<div class="calendar-day-events">';
    const showTime = true;
    dayTasks.slice(0, maxShow).forEach(task => {
      const subjectColor = subjects.find(s => s.id === task.subject)?.color;
      const resolvedColor = resolveTaskColor(task, subjectColor);
      const color = resolvedColor || subjectColor || '#667eea';
      const safeName = escapeHtml(task.title);
      const evtDate = new Date(task.dueDate);
      const timeStr = showTime ? `${String(evtDate.getHours()).padStart(2, '0')}:${String(evtDate.getMinutes()).padStart(2, '0')} ` : '';
      const displayText = timeStr + safeName;
      eventsHtml += `<div class="calendar-event-chip" style="background: ${color}" title="${safeName}" aria-label="${safeName}" data-task-id="${task.id}">${displayText}</div>`;
    });
    if (dayTasks.length > maxShow) {
      eventsHtml += `<div class="calendar-more">+${dayTasks.length - maxShow} עוד</div>`;
    }
    eventsHtml += '</div>';

    html += `<div class="${classes}" data-date="${dateKey}">
    <div class="calendar-day-number">${focus.getDate()}</div>
    ${eventsHtml}
  </div>`;
  }

  taskCalendarGrid.innerHTML = html;
  renderTaskMonthList();
}
ctx.renderTaskCalendar = renderTaskCalendar;

function renderTaskMonthList() {
  if (!taskMonthEvents || !taskMonthEventsTitle) return;

  let rangeStart;
  let rangeEnd;
  let titleText = '';
  let emptyText;

  if (taskCalendarView === 'month') {
    const year = currentTaskMonth.getFullYear();
    const month = currentTaskMonth.getMonth();
    rangeStart = new Date(year, month, 1);
    rangeEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
    titleText = `משימות (ללא ספירות לאחור) ${HEBREW_MONTHS[month]}`;
    emptyText = 'אין משימות החודש';
  } else if (taskCalendarView === 'week') {
    const focus = taskCalendarFocusDate || new Date();
    const start = getStartOfWeek(focus);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    rangeStart = start;
    rangeEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
    titleText = `משימות לשבוע ${formatHebrewShortDate(start)} - ${formatHebrewShortDate(end)}`;
    emptyText = 'אין משימות השבוע';
  } else {
    const focus = taskCalendarFocusDate || new Date();
    rangeStart = new Date(focus.getFullYear(), focus.getMonth(), focus.getDate());
    rangeEnd = new Date(focus.getFullYear(), focus.getMonth(), focus.getDate(), 23, 59, 59, 999);
    titleText = `משימות ליום ${focus.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}`;
    emptyText = 'אין משימות היום';
  }

  taskMonthEventsTitle.textContent = titleText;

  const rangeTasks = tasks.filter(t => {
    if (!t.dueDate) return false;
    if (t.isCountdown || t.isEvent) return false;
    const d = new Date(t.dueDate);
    return d >= rangeStart && d <= rangeEnd;
  }).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  if (rangeTasks.length === 0) {
    taskMonthEvents.innerHTML = `<div class="no-events-msg">${emptyText}</div>`;
    return;
  }

  taskMonthEvents.innerHTML = rangeTasks.map(task => {
    const subjectColor = subjects.find(s => s.id === task.subject)?.color;
    const resolvedColor = resolveTaskColor(task, subjectColor);
    const color = resolvedColor || subjectColor || '#667eea';
    const d = new Date(task.dueDate);
    const dateStr = d.toLocaleDateString('he-IL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `
    <div class="month-event-item" style="border-right-color: ${color}">
      <div class="month-event-color" style="background: ${color}"></div>
      <div class="month-event-info">
        <div class="month-event-name" style="${task.completed ? 'text-decoration: line-through; opacity: 0.7;' : ''}">${escapeHtml(task.title)}</div>
        <div class="month-event-date">${dateStr}</div>
      </div>
    </div>
  `;
  }).join('');
}

function shiftTaskCalendar(step) {
  if (taskCalendarView === 'month') {
    currentTaskMonth.setMonth(currentTaskMonth.getMonth() + step);
    setTaskCalendarFocus(new Date(currentTaskMonth.getFullYear(), currentTaskMonth.getMonth(), 1));
  } else if (taskCalendarView === 'week') {
    const next = new Date(taskCalendarFocusDate);
    next.setDate(next.getDate() + step * 7);
    setTaskCalendarFocus(next);
  } else {
    const next = new Date(taskCalendarFocusDate);
    next.setDate(next.getDate() + step);
    setTaskCalendarFocus(next);
  }
  renderTaskCalendar();
}

function jumpTaskCalendarToToday() {
  const today = new Date();
  currentTaskMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  setTaskCalendarFocus(today);
  renderTaskCalendar();
}

// Task Calendar Navigation
$("prevTaskMonth").onclick = () => {
  shiftTaskCalendar(-1);
};
if (taskCalendarViewToggle) {
  taskCalendarViewToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
    setTaskCalendarView(btn.dataset.view);
  });
}

// Toggle Task Calendar
const toggleTaskCalendar = $("toggleTaskCalendar");
if (toggleTaskCalendarSize && taskRightSidebar) {
  toggleTaskCalendarSize.onclick = () => {
    taskCalendarExpanded = !taskCalendarExpanded;
    taskRightSidebar.classList.toggle('calendar-expanded', taskCalendarExpanded);
    toggleTaskCalendarSize.textContent = taskCalendarExpanded ? '⤡' : '⤢';
    const label = taskCalendarExpanded ? 'הקטן' : 'הגדל';
    toggleTaskCalendarSize.title = label;
    toggleTaskCalendarSize.setAttribute('aria-label', label);
    renderTaskCalendar();
  };
}
if (toggleTaskCalendar && taskRightSidebar) {
  toggleTaskCalendar.onclick = () => {
    console.log('toggleTaskCalendar clicked');
    const wasHidden = taskRightSidebar.classList.contains("hidden") || getComputedStyle(taskRightSidebar).display === 'none';
    console.log('taskRightSidebar wasHidden=', wasHidden);
    if (wasHidden) {
      taskRightSidebar.classList.remove('hidden');
      taskRightSidebar.style.display = '';
      jumpTaskCalendarToToday();
    } else {
      taskRightSidebar.classList.add('hidden');
      taskRightSidebar.style.display = 'none';
    }
  };
}
// Toggle Task Manager Sidebar (subjects)
const toggleTaskSidebarBtn = $("toggleTaskSidebar");
const taskSidebar = $("taskSidebar");
if (toggleTaskSidebarBtn && taskSidebar) {
  toggleTaskSidebarBtn.onclick = () => {
    console.log('toggleTaskSidebar clicked');
    const wasHidden = taskSidebar.classList.contains('hidden') || getComputedStyle(taskSidebar).display === 'none';
    console.log('taskSidebar wasHidden=', wasHidden);
    if (wasHidden) {
      taskSidebar.classList.remove('hidden');
      taskSidebar.style.display = '';
    } else {
      taskSidebar.classList.add('hidden');
      taskSidebar.style.display = 'none';
    }
  };
}
$("nextTaskMonth").onclick = () => {
  shiftTaskCalendar(1);
};
$("todayTaskBtn").onclick = () => {
  jumpTaskCalendarToToday();
};



















// ============ SIDEBAR SUBJECTS RENDERING ============
function renderSubjectsSidebar() {
  if (!subjectsList) return;

  updateSmartViewCounts();

  let html = '';
  const topLevel = getTopLevelSubjects();

  topLevel.forEach(s => {
    const children = getChildSubjects(s.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedSubjects.has(s.id);
    const isActive = currentSubject === s.id && !currentSmartView;
    const taskCount = countSubjectTasks(s.id, true);
    const isShared = s.isShared;
    const sharedBadge = isShared ? `<span class="shared-badge" title="משותף">👥</span>` : '';

    html += `
    <div class="subject-list-item ${isExpanded ? 'expanded' : ''}" data-subject-id="${s.id}">
      <div class="subject-list-header ${isActive ? 'active' : ''}" data-subject="${s.id}" title="${escapeHtml(s.name)}">
        ${hasChildren ? `<span class="collapse-arrow">▼</span>` : ''}
        ${sharedBadge}
        ${taskCount > 0 ? `<span class="subject-count">${taskCount}</span>` : ''}
        <span class="subject-color-dot" style="background: ${s.color};"></span>
        <span class="subject-name">${escapeHtml(s.name)}</span>
        <div class="subject-actions">
          <button class="subject-action-btn" data-action="add-sub" title="הוסף תת-נושא" aria-label="הוסף תת-נושא">➕</button>
          <button class="subject-action-btn" data-action="edit" title="עריכה" aria-label="עריכה">✏️</button>
          <button class="subject-action-btn delete" data-action="delete" title="מחק" aria-label="מחק">🗑️</button>
        </div>
      </div>
      ${hasChildren ? `
        <div class="subject-list-children">
          ${children.map(c => {
      const childCount = tasks.filter(t => t.subject === c.id && !t.completed).length;
      const childActive = currentSubject === c.id && !currentSmartView;
      const childShared = c.isShared;
      const childSharedBadge = childShared ? `<span class="shared-badge" title="משותף">👥</span>` : '';
      return `
              <div class="subject-child-item ${childActive ? 'active' : ''}" data-subject="${c.id}" title="${escapeHtml(c.name)}">
                ${childSharedBadge}
                ${childCount > 0 ? `<span class="child-count">${childCount}</span>` : ''}
                <span class="child-color" style="background: ${c.color};"></span>
                <span class="child-name">${escapeHtml(c.name)}</span>
                <div class="subject-actions">
                  <button class="subject-action-btn" data-action="edit" title="עריכה">✏️</button>
                  <button class="subject-action-btn delete" data-action="delete" title="מחק">🗑️</button>
                </div>
              </div>
            `;
    }).join('')}
        </div>
      ` : ''}
    </div>
  `;
  });

  subjectsList.innerHTML = html;

  // Setup event handlers
  setupSubjectsSidebarHandlers();
  setupSmartViewsHandlers();
}
ctx.renderSubjectsSidebar = renderSubjectsSidebar;

function setupSubjectsSidebarHandlers() {
  // Subject headers click - toggle collapse OR select subject
  subjectsList.querySelectorAll('.subject-list-header').forEach(header => {
    header.addEventListener('click', (e) => {
      // Don't do anything if clicking action buttons
      if (e.target.closest('.subject-actions')) {
        return;
      }

      const subjectId = header.dataset.subject;

      // Always select the subject
      currentSmartView = null;
      currentSubject = subjectId;
      syncQuickAddSubject();
      renderSubjectsSidebar();
      renderTasks();
    });

    // Right-click context menu
    header.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, header.dataset.subject);
    });

    attachSubjectDropHandlers(header, header.dataset.subject);
  });

  // Collapse arrows - clicking arrow only toggles (doesn't select)
  subjectsList.querySelectorAll('.collapse-arrow').forEach(arrow => {
    arrow.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent header click from also firing
      const subjectId = arrow.closest('.subject-list-item').dataset.subjectId;
      toggleSubjectExpanded(subjectId);
    });
  });

  // Subject action buttons (edit, delete, add-sub)
  subjectsList.querySelectorAll('.subject-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const subjectId = btn.closest('[data-subject]').dataset.subject;

      if (action === 'edit') {
        openSubjectModal(subjectId);
      } else if (action === 'add-sub') {
        openSubjectModal(null, subjectId);
      } else if (action === 'delete') {
        if (confirm('האם אתה בטוח שברצונך למחוק את הנושא הזה?')) {
          deleteSubjectById(subjectId);
        }
      }
    });
  });

  // Child items click
  subjectsList.querySelectorAll('.subject-child-item').forEach(child => {
    child.addEventListener('click', (e) => {
      // Don't select if clicking action buttons
      if (e.target.closest('.subject-actions')) {
        return;
      }

      currentSmartView = null;
      currentSubject = child.dataset.subject;
      syncQuickAddSubject();
      renderSubjectsSidebar();
      renderTasks();
    });

    // Right-click context menu
    child.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, child.dataset.subject);
    });

    attachSubjectDropHandlers(child, child.dataset.subject);
  });
}

function attachSubjectDropHandlers(element, subjectId) {
  if (!element) return;
  element.addEventListener('dragover', (e) => {
    if (!draggingTaskId) return;
    e.preventDefault();
    element.classList.add('drag-over');
  });
  element.addEventListener('dragleave', () => {
    element.classList.remove('drag-over');
  });
  element.addEventListener('drop', (e) => {
    if (!draggingTaskId) return;
    e.preventDefault();
    element.classList.remove('drag-over');
    assignTaskToSubject(draggingTaskId, subjectId);
  });
}

function toggleSubjectExpanded(subjectId) {
  const item = subjectsList.querySelector(`.subject-list-item[data-subject-id="${subjectId}"]`);

  if (expandedSubjects.has(subjectId)) {
    expandedSubjects.delete(subjectId);
    if (item) item.classList.remove('expanded');
  } else {
    expandedSubjects.add(subjectId);
    if (item) item.classList.add('expanded');
  }
}

function setupSmartViewsHandlers() {
  if (!smartViewsList) return;

  // Clone and replace to remove all old event listeners
  smartViewsList.querySelectorAll('.smart-view-item').forEach(item => {
    const newItem = item.cloneNode(true);
    item.parentNode.replaceChild(newItem, item);
  });

  smartViewsList.querySelectorAll('.smart-view-item').forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;
      if (view === 'all') {
        currentSmartView = null;
        currentSubject = 'all';
      } else {
        currentSmartView = view;
        currentSubject = 'all';
      }
      syncQuickAddSubject();

      // Update active states
      smartViewsList.querySelectorAll('.smart-view-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      renderSubjectsSidebar();
      renderTasks();
    });
  });

  // Set initial active state
  const activeView = currentSmartView || 'all';
  smartViewsList.querySelectorAll('.smart-view-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === activeView);
  });
}

// Add subject sidebar button handler
if (addSubjectSidebarBtn) {
  addSubjectSidebarBtn.addEventListener('click', () => openSubjectModal());
}
// Add subject button in header
if (addSubjectBtn) {
  addSubjectBtn.addEventListener('click', () => {
    console.log('addSubjectBtn clicked');
    openSubjectModal();
  });
}

// ============ CONTEXT MENU ============
function showContextMenu(x, y, subjectId) {
  contextMenuTarget = subjectId;
  const subject = subjects.find(s => s.id === subjectId);

  // Update menu items based on subject type
  const addSubItem = contextMenu.querySelector('[data-action="add-sub"]');
  if (subject && subject.parentId) {
    // It's a sub-subject, hide "add sub" option
    addSubItem.style.display = 'none';
  } else {
    addSubItem.style.display = 'flex';
  }

  // Position and show menu
  contextMenu.style.left = x + 'px';
  contextMenu.style.top = y + 'px';
  contextMenu.classList.add('open');
}

function hideContextMenu() {
  contextMenu.classList.remove('open');
  contextMenuTarget = null;
  hideEventContextMenu();
}

// ============ EVENT CONTEXT MENU ============
function showEventContextMenu(x, y, eventId) {
  eventContextMenuTarget = eventId;
  const evt = events.find(e => e.id === eventId);

  // Update menu items based on current state
  const starItem = eventContextMenu.querySelector('[data-action="star"]');
  const pinItem = eventContextMenu.querySelector('[data-action="pin"]');

  if (starItem && evt) {
    starItem.innerHTML = evt.highlighted ? '⭐ הסר מועדף' : '⭐ סמן כמועדף';
  }

  if (pinItem && evt) {
    pinItem.innerHTML = evt.pinned ? '📌 בטל נעיצה' : '📌 נעץ למעלה';
  }

  // Position and show menu
  eventContextMenu.style.left = x + 'px';
  eventContextMenu.style.top = y + 'px';
  eventContextMenu.classList.add('open');
}

function hideEventContextMenu() {
  if (eventContextMenu) {
    eventContextMenu.classList.remove('open');
  }
  eventContextMenuTarget = null;
  hideAddEventContextMenu();
}

// ============ ADD EVENT CONTEXT MENU ============
const addEventContextMenu = $("addEventContextMenu");

function showAddEventContextMenu(x, y) {
  if (!addEventContextMenu) return;

  // Position and show menu
  addEventContextMenu.style.left = x + 'px';
  addEventContextMenu.style.top = y + 'px';
  addEventContextMenu.classList.add('open');
}

function hideAddEventContextMenu() {
  if (addEventContextMenu) {
    addEventContextMenu.classList.remove('open');
  }
}
Object.assign(ctx, {
  hideContextMenu,
  hideEventContextMenu,
  hideAddEventContextMenu
});

// Add event context menu item clicks
if (addEventContextMenu) {
  addEventContextMenu.addEventListener('click', (e) => {
    const action = e.target.closest('.context-menu-item')?.dataset.action;
    if (!action) return;

    const now = new Date();
    let targetDate = new Date();

    if (action === 'add') {
      // Focus on the input panel
      eventName.focus();
      hideAddEventContextMenu();
      return;
    } else if (action === 'add-tomorrow') {
      targetDate.setDate(targetDate.getDate() + 1);
      targetDate.setHours(12, 0, 0, 0);
    } else if (action === 'add-week') {
      targetDate.setDate(targetDate.getDate() + 7);
      targetDate.setHours(12, 0, 0, 0);
    }

    // Pre-fill the date - format from local date directly (not via ISO/UTC)
    const pad = n => String(n).padStart(2, '0');
    const localDateStr = `${targetDate.getFullYear()}-${pad(targetDate.getMonth() + 1)}-${pad(targetDate.getDate())}T${pad(targetDate.getHours())}:${pad(targetDate.getMinutes())}`;
    eventDate.value = localDateStr;
    eventName.focus();

    hideAddEventContextMenu();
  });
}

// Add right-click on event list area to show add event menu
eventList.addEventListener('contextmenu', (e) => {
  // Only show add menu if not clicking on an event row
  if (!e.target.closest('.event-row')) {
    e.preventDefault();
    hideContextMenu();
    showAddEventContextMenu(e.clientX, e.clientY);
  }
});

// Also add to empty state
emptyState.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  hideContextMenu();
  showAddEventContextMenu(e.clientX, e.clientY);
});

// Event context menu item clicks
if (eventContextMenu) {
  eventContextMenu.addEventListener('click', (e) => {
    const action = e.target.closest('.context-menu-item')?.dataset.action;
    if (!action || !eventContextMenuTarget) return;

    const evt = events.find(ev => ev.id === eventContextMenuTarget);

    if (action === 'edit') {
      startEdit(eventContextMenuTarget);
    } else if (action === 'pin') {
      if (evt) {
        updateInCloud(eventContextMenuTarget, { ...evt, pinned: !evt.pinned });
      }
    } else if (action === 'star') {
      if (evt) {
        updateInCloud(eventContextMenuTarget, { ...evt, highlighted: !evt.highlighted });
      }
    } else if (action === 'duplicate') {
      if (evt) {
        saveToCloud({
          name: evt.name + ' (העתק)',
          date: evt.date,
          notes: evt.notes || null,
          reminder: evt.reminder || 0,
          highlighted: false,
          pinned: false
        });
      }
    } else if (action === 'delete') {
      const existing = pendingDeletes.get(eventContextMenuTarget);
      if (existing) clearTimeout(existing.timer);
      const timer = setTimeout(() => {
        deleteFromCloud(eventContextMenuTarget);
        pendingDeletes.delete(eventContextMenuTarget);
        if (lastDeletedId === eventContextMenuTarget) hideUndoToast();
      }, DELETE_TIMEOUT_MS);
      pendingDeletes.set(eventContextMenuTarget, { timer });
      render();
      showUndoToast(evt ? evt.name : 'Event', eventContextMenuTarget);
    }

    hideEventContextMenu();
  });
}

// Context menu item clicks (subjects)
contextMenu.addEventListener('click', (e) => {
  const action = e.target.closest('.context-menu-item')?.dataset.action;
  if (!action || !contextMenuTarget) return;

  if (action === 'edit') {
    openSubjectModal(contextMenuTarget);
  } else if (action === 'share') {
    openShareSubjectModal(contextMenuTarget);
  } else if (action === 'add-sub') {
    openSubjectModal(null, contextMenuTarget);
  } else if (action === 'delete') {
    deleteSubjectById(contextMenuTarget);
  }

  hideContextMenu();
});

// Hide context menu on click outside
document.addEventListener('click', (e) => {
  if (!contextMenu.contains(e.target) &&
    (!eventContextMenu || !eventContextMenu.contains(e.target)) &&
    (!addEventContextMenu || !addEventContextMenu.contains(e.target))) {
    hideContextMenu();
    hideAddEventContextMenu();
  }
});

document.addEventListener('contextmenu', (e) => {
  // Hide menus when right-clicking elsewhere
  if (!e.target.closest('.subject-list-header') && !e.target.closest('.subject-child-item')) {
    hideContextMenu();
  }
  if (!e.target.closest('.event-row') && !e.target.closest('.event-list') && !e.target.closest('.empty-state')) {
    hideEventContextMenu();
    hideAddEventContextMenu();
  }
});

function updateSubjectSelectors() {
  // Build hierarchical options for task subject selectors
  let options = `<option value="">ללא נושא</option>`;

  const topLevel = getTopLevelSubjects();
  topLevel.forEach(s => {
    options += `<option value="${s.id}">${escapeHtml(s.name)}</option>`;
    const children = getChildSubjects(s.id);
    children.forEach(c => {
      options += `<option value="${c.id}">&nbsp;&nbsp;↳ ${escapeHtml(c.name)}</option>`;
    });
  });

  newTaskSubject.innerHTML = options;
  editTaskSubject.innerHTML = options;
  syncQuickAddSubject();
}

function updateParentSubjectSelector() {
  // Only top-level subjects can be parents
  let options = `<option value="">ללא (נושא ראשי)</option>`;
  const topLevel = getTopLevelSubjects();
  topLevel.forEach(s => {
    // Don't allow setting itself as parent when editing
    if (s.id !== editingSubjectId) {
      options += `<option value="${s.id}">${escapeHtml(s.name)}</option>`;
    }
  });
  parentSubjectSelect.innerHTML = options;
}

// Update getFilteredTasks to include subject filter AND smart views
const originalGetFilteredTasks = getFilteredTasks;
getFilteredTasks = function () {
  let filtered = originalGetFilteredTasks();

  // Apply smart view filter
  if (currentSmartView) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekLater = new Date(today);
    weekLater.setDate(weekLater.getDate() + 7);

    if (currentSmartView === 'today') {
      filtered = filtered.filter(t => {
        if (!t.dueDate) return false;
        const due = new Date(t.dueDate);
        return due >= today && due < tomorrow;
      });
    } else if (currentSmartView === 'week') {
      filtered = filtered.filter(t => {
        if (!t.dueDate) return false;
        const due = new Date(t.dueDate);
        return due >= today && due < weekLater;
      });
    } else if (currentSmartView === 'overdue') {
      filtered = filtered.filter(t => {
        if (!t.dueDate || t.completed) return false;
        return new Date(t.dueDate) < now;
      });
    } else if (currentSmartView === 'nodate') {
      filtered = filtered.filter(t => !t.dueDate && !t.completed);
    }
  }

  // Apply subject filter
  if (currentSubject !== 'all' && !currentSmartView) {
    const selectedSubject = subjects.find(s => s.id === currentSubject);
    const isSubSubject = selectedSubject && selectedSubject.parentId;

    // Get all valid subject IDs (current + children if parent)
    const validIds = [currentSubject];
    const children = getChildSubjects(currentSubject);
    children.forEach(c => validIds.push(c.id));

    const subjectFiltered = filtered.filter(t => validIds.includes(t.subject));

    // If this is a sub-subject with no tasks, show high priority tasks from all subjects due today/tomorrow
    if (isSubSubject && subjectFiltered.filter(t => !t.completed).length === 0) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayAfterTomorrow = new Date(today);
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

      // Get high priority tasks (urgent, high) due today or tomorrow from all subjects
      filtered = filtered.filter(t => {
        if (t.completed) return false;
        const isHighPriority = t.priority === 'urgent' || t.priority === 'high';
        const hasDueDate = t.dueDate;
        if (!hasDueDate) return isHighPriority; // Include high priority without date
        const due = new Date(t.dueDate);
        const isDueSoon = due >= today && due < dayAfterTomorrow;
        return isHighPriority || isDueSoon;
      });

      // Sort by priority then by due date
      filtered.sort((a, b) => {
        const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
        const pDiff = (priorityOrder[a.priority] || 4) - (priorityOrder[b.priority] || 4);
        if (pDiff !== 0) return pDiff;
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      });

      // Mark that we're showing suggested tasks
      window.showingSuggestedTasks = true;
    } else {
      filtered = subjectFiltered;
      window.showingSuggestedTasks = false;
    }
  } else {
    window.showingSuggestedTasks = false;
  }

  return filtered;
};



// Sharing state for subject modal
let pendingSharedUsers = [];
const shareWithUserInput = $("shareWithUserInput");
const addShareUserBtn = $("addShareUserBtn");
const sharedWithList = $("sharedWithList");
const shareError = $("shareError");

function renderSharedUsersList() {
  if (!sharedWithList) return;
  if (pendingSharedUsers.length === 0) {
    sharedWithList.innerHTML = '<div style="font-size: 12px; color: var(--muted);">לא משותף עם אף אחד</div>';
    return;
  }
  sharedWithList.innerHTML = pendingSharedUsers.map((user, idx) => `
  <span class="shared-user-pill ${user === currentUser ? 'owner' : ''}">
    👤 ${escapeHtml(user)}${user === currentUser ? ' (אתה)' : ''}
    ${user !== currentUser ? `<span class="remove-share" data-idx="${idx}">×</span>` : ''}
  </span>
`).join('');

  // Add remove handlers
  sharedWithList.querySelectorAll('.remove-share').forEach(btn => {
    btn.onclick = () => {
      const idx = Number.parseInt(btn.dataset.idx);
      pendingSharedUsers.splice(idx, 1);
      renderSharedUsersList();
    };
  });
}

if (addShareUserBtn) {
  addShareUserBtn.onclick = () => {
    const username = shareWithUserInput.value.trim().toLowerCase();
    if (!username) return;
    if (username === currentUser) {
      shareError.textContent = 'לא ניתן לשתף עם עצמך';
      shareError.style.display = 'block';
      return;
    }
    if (pendingSharedUsers.includes(username)) {
      shareError.textContent = 'המשתמש כבר נמצא ברשימה';
      shareError.style.display = 'block';
      return;
    }
    shareError.style.display = 'none';
    pendingSharedUsers.push(username);
    shareWithUserInput.value = '';
    renderSharedUsersList();
  };

  shareWithUserInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addShareUserBtn.click();
    }
  });
}

function openSubjectModal(subjectId, parentId = null) {
  console.log('openSubjectModal called', { subjectId, parentId });
  editingSubjectId = subjectId;
  updateParentSubjectSelector();
  if (shareError) shareError.style.display = 'none';
  if (shareWithUserInput) shareWithUserInput.value = '';

  if (subjectId) {
    const subject = subjects.find(s => s.id === subjectId);
    if (!subject) return;
    subjectModalTitle.textContent = 'ערוך נושא';
    subjectNameInput.value = subject.name;
    selectedSubjectColor = subject.color;
    parentSubjectSelect.value = subject.parentId || '';
    deleteSubjectBtn.style.display = 'block';

    // Load shared users
    if (subject.isShared) {
      const members = subject.members || {};
      pendingSharedUsers = Object.keys(members);
    } else {
      pendingSharedUsers = [];
    }

    // If editing a parent with children, disable parent selector
    const children = getChildSubjects(subjectId);
    parentSubjectSelect.disabled = children.length > 0;
  } else {
    subjectModalTitle.textContent = parentId ? 'הוסף תת-נושא' : 'הוסף נושא חדש';
    subjectNameInput.value = '';
    selectedSubjectColor = '#667eea';
    parentSubjectSelect.value = parentId || '';
    parentSubjectSelect.disabled = false;
    deleteSubjectBtn.style.display = 'none';
    pendingSharedUsers = [];
  }

  renderSharedUsersList();

  // Update color picker selection
  subjectColorPicker.querySelectorAll('.subject-color-option').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.color === selectedSubjectColor);
  });

  subjectModal.classList.add('open');
  subjectNameInput.focus();
}
ctx.openSubjectModal = openSubjectModal;

function closeSubjectModal() {
  subjectModal.classList.remove('open');
  editingSubjectId = null;
}

// Quick share function - opens subject modal focused on sharing section
function openShareSubjectModal(subjectId) {
  if (!subjectId) return;
  const subject = subjects.find(s => s.id === subjectId);
  if (!subject) return;

  // Open the regular edit modal
  openSubjectModal(subjectId);

  // Scroll to and focus on sharing section
  setTimeout(() => {
    const sharingSection = document.getElementById('subjectSharingSection');
    if (sharingSection) {
      sharingSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Highlight the sharing section briefly
      sharingSection.style.transition = 'background 0.3s, box-shadow 0.3s';
      sharingSection.style.background = 'rgba(102, 126, 234, 0.15)';
      sharingSection.style.boxShadow = '0 0 0 2px var(--accent)';
      if (shareWithUserInput) {
        shareWithUserInput.focus();
      }
      setTimeout(() => {
        sharingSection.style.background = '';
        sharingSection.style.boxShadow = '';
      }, 1500);
    }
  }, 100);
}

subjectModal.addEventListener('click', (e) => {
  if (e.target === subjectModal) closeSubjectModal();
});

// Color picker
subjectColorPicker.addEventListener('click', (e) => {
  const option = e.target.closest('.subject-color-option');
  if (!option) return;
  subjectColorPicker.querySelectorAll('.subject-color-option').forEach(o => o.classList.remove('selected'));
  option.classList.add('selected');
  selectedSubjectColor = option.dataset.color;
});

// Cancel button
cancelSubjectBtn.onclick = closeSubjectModal;

// Save subject
saveSubjectBtn.onclick = async () => {
  console.log('saveSubjectBtn clicked, name=', subjectNameInput.value);
  const name = subjectNameInput.value.trim();
  if (!name) return;

  const parentId = parentSubjectSelect.value || null;
  const hasSharing = pendingSharedUsers.length > 0;
  console.log('Saving subject:', { name, parentId, hasSharing, pendingSharedUsers, editingSubjectId });

  try {
    if (hasSharing) {
      // Save as shared subject
      const members = {};
      pendingSharedUsers.forEach(user => {
        if (user !== currentUser) {
          members[user] = true;
        }
      });
      // Also add owner to members for easier querying
      members[currentUser] = true;

      const sharedSubjectData = {
        name,
        color: selectedSubjectColor,
        parentId,
        owner: currentUser,
        members,
        createdAt: new Date().toISOString()
      };

      console.log('Shared subject data:', sharedSubjectData);

      if (editingSubjectId) {
        const existingSubject = subjects.find(s => s.id === editingSubjectId);

        if (existingSubject?.isShared) {
          // Update existing shared subject
          await set(ref(db, `sharedSubjects/${editingSubjectId}`), sharedSubjectData);
        } else if (existingSubject?.isOwn) {
          // Convert from own to shared - move tasks
          const subjectTasks = tasks.filter(t => t.subject === editingSubjectId);

          // Create in shared location
          const newSharedRef = push(ref(db, 'sharedSubjects'));
          const newSharedId = newSharedRef.key;
          await set(newSharedRef, sharedSubjectData);

          // Move tasks to shared location
          for (const task of subjectTasks) {
            const { id, isOwn, ...taskData } = task;
            taskData.subject = newSharedId;
            await set(ref(db, `sharedSubjects/${newSharedId}/tasks/${id}`), taskData);
            await remove(ref(db, `users/${currentUser}/tasks/${id}`));
          }

          // Delete from own subjects
          await remove(ref(db, `users/${currentUser}/subjects/${editingSubjectId}`));
        }
      } else {
        // Create new shared subject
        console.log('Creating new shared subject...');
        const newSharedRef = push(ref(db, 'sharedSubjects'));
        console.log('New shared ref key:', newSharedRef.key);
        await set(newSharedRef, sharedSubjectData);
        console.log('Shared subject created successfully');
      }
    } else {
      // Save as own subject (not shared)
      const subjectData = {
        name,
        color: selectedSubjectColor,
        parentId,
        createdAt: new Date().toISOString()
      };

      console.log('Own subject data:', subjectData);

      if (editingSubjectId) {
        const existingSubject = subjects.find(s => s.id === editingSubjectId);

        if (existingSubject?.isShared && existingSubject?.owner === currentUser) {
          // Convert from shared to own - move tasks back
          const subjectTasks = tasks.filter(t => t.subject === editingSubjectId);

          // Create in own location
          const newOwnRef = push(subjectsRef);
          const newOwnId = newOwnRef.key;
          await set(newOwnRef, subjectData);

          // Move tasks to own location
          for (const task of subjectTasks) {
            const { id, isShared, ...taskData } = task;
            taskData.subject = newOwnId;
            await set(ref(db, `users/${currentUser}/tasks/${id}`), taskData);
          }

          // Delete shared subject
          await remove(ref(db, `sharedSubjects/${editingSubjectId}`));
        } else {
          // Update existing own subject
          await set(ref(db, `users/${currentUser}/subjects/${editingSubjectId}`), subjectData);
        }
      } else {
        // Create new own subject
        console.log('Creating new own subject...');
        const newSubjectRef = push(subjectsRef);
        await set(newSubjectRef, subjectData);
        console.log('Own subject created successfully');
      }
    }

    closeSubjectModal();
  } catch (error) {
    console.error('Error saving subject:', error);
    alert('שגיאה בשמירת הנושא: ' + error.message);
  }
};

subjectNameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') saveSubjectBtn.click();
});

// Delete subject by ID (used from dropdown buttons)
function deleteSubjectById(subjectId) {
  const subject = subjects.find(s => s.id === subjectId);
  if (!subject) return;

  // For shared subjects, handle differently based on ownership
  if (subject.isShared) {
    if (subject.owner === currentUser) {
      // Owner can delete the shared subject entirely
      if (confirm(`Delete shared subject "${subject.name}"? This will delete all tasks and remove access for all shared users.`)) {
        // Delete the shared subject (tasks are stored under it)
        remove(ref(db, `sharedSubjects/${subjectId}`));
        if (currentSubject === subjectId) {
          currentSubject = 'all';
        }
      }
    } else {
      // Non-owner can only leave the shared subject
      if (confirm(`Leave shared subject "${subject.name}"? You will no longer see tasks in this subject.`)) {
        // Remove current user from members
        remove(ref(db, `sharedSubjects/${subjectId}/members/${currentUser}`));
        if (currentSubject === subjectId) {
          currentSubject = 'all';
        }
      }
    }
    return;
  }

  const children = getChildSubjects(subjectId);
  let message = `Delete "${subject.name}"?`;
  if (children.length > 0) {
    message += ` This will also delete ${children.length} sub-subject(s).`;
  }
  message += ' Tasks will remain but become uncategorized.';

  if (confirm(message)) {
    // Delete children first
    children.forEach(child => {
      tasks.forEach(task => {
        if (task.subject === child.id) {
          // Use the proper reference based on task location
          const taskRef = getTaskRef(task);
          if (taskRef) {
            set(ref(db, taskRef.toString().replace(db._repoInternal.repoInfo_.toString(), '') + '/subject'), '');
          }
        }
      });
      remove(ref(db, `users/${currentUser}/subjects/${child.id}`));
    });

    // Remove subject from all tasks that have it
    tasks.forEach(task => {
      if (task.subject === subjectId) {
        // For own tasks only (shared tasks would have been handled above)
        if (!task.isShared) {
          set(ref(db, `users/${currentUser}/tasks/${task.id}/subject`), '');
        }
      }
    });

    // Delete the subject
    remove(ref(db, `users/${currentUser}/subjects/${subjectId}`));

    // Reset to all if we were viewing that subject
    if (currentSubject === subjectId || children.some(c => c.id === currentSubject)) {
      currentSubject = 'all';
    }
  }
}

// Delete subject from modal
deleteSubjectBtn.onclick = () => {
  if (!editingSubjectId) return;
  deleteSubjectById(editingSubjectId);
  closeSubjectModal();
};

// Update openTaskEditModal to set subject
const originalOpenTaskEditModal = openTaskEditModal;
openTaskEditModal = function (taskId) {
  originalOpenTaskEditModal(taskId);
  if (editingTask) {
    editTaskSubject.value = editingTask.subject || '';
  }
};

// ============ 13. NATURAL LANGUAGE PARSING (extracted to js/inline/nlp-parsing.js) ============
import { parseNaturalLanguage, findBestSubjectMatch, normalizeForComparison } from './inline/nlp-parsing.js';


// Smart quick add with natural language + Enter to add
newTaskTitle.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const input = newTaskTitle.value.trim();
  if (!input) return;

  const parsed = parseNaturalLanguage(input);
  const hasParsed = parsed.dueDate || parsed.subjectId || parsed.priority !== 'medium' || parsed.reminderMinutes > 0 || parsed.recurrence;

  if (hasParsed) {
    const defaultSubjectId = getDefaultSubjectId();
    const selectedSubjectId = parsed.subjectId || defaultSubjectId;
    const orderValue = hasManualOrder() ? getNextTaskOrder(false) : null;
    const recurrenceResult = parsed.recurrence
      ? { value: null }
      : getTaskRecurrenceValue(newTaskRecurrence, newTaskRecurrenceCustomValue, newTaskRecurrenceCustomUnit);
    if (recurrenceResult.error) {
      alert(recurrenceResult.error);
      return;
    }
    const recurrence = parsed.recurrence || recurrenceResult.value;
    const reminder = parsed.reminderMinutes > 0
      ? parsed.reminderMinutes
      : getTaskReminderMinutes(newTaskReminder, newTaskReminderCustomValue, newTaskReminderCustomUnit);

    const taskData = {
      title: parsed.title || input,
      content: '',
      priority: parsed.priority,
      dueDate: parsed.dueDate ? parsed.dueDate.toISOString() : null,
      subject: selectedSubjectId || '',
      checklist: [],
      completed: false,
      createdAt: new Date().toISOString(),
      ...(Number.isFinite(orderValue) ? { order: orderValue } : {}),
      ...(selectedTaskColor ? { color: selectedTaskColor } : {}),
      ...(recurrence ? { recurrence } : {}),
      ...(reminder > 0 ? { reminder } : {})
    };

    createTask(taskData);

    const taskSections = $("taskSections");
    if (taskSections) {
      taskSections.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    newTaskTitle.value = '';
    quickAddRow.style.display = 'none';
    selectedTaskColor = '';
    if (newTaskRecurrence) newTaskRecurrence.value = 'none';
    if (newTaskRecurrenceCustomWrap) newTaskRecurrenceCustomWrap.classList.add('hidden');
    if (newTaskRecurrenceCustomValue) newTaskRecurrenceCustomValue.value = '';
    if (newTaskRecurrenceCustomUnit) newTaskRecurrenceCustomUnit.value = 'days';
    if (newTaskReminder) newTaskReminder.value = '0';
    if (newTaskReminderCustomWrap) newTaskReminderCustomWrap.classList.add('hidden');
    if (newTaskReminderCustomValue) newTaskReminderCustomValue.value = '';
    if (newTaskReminderCustomUnit) newTaskReminderCustomUnit.value = 'minutes';
    setTaskColorSelection(quickTaskColorPicker, selectedTaskColor);
    syncQuickAddSubject();
  } else {
    addTask();
  }
});

if (newTaskDue) {
  newTaskDue.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addTask();
  });
}

// Kick off Pomodoro UI
Pomodoro.init();
startTaskReminderTicker();

// ============ DAILY REMINDER (extracted to js/inline/daily-reminder.js) ============
import { initDailyReminder } from './inline/daily-reminder.js';
initDailyReminder();

// ============ INITIALIZE SMART VIEWS ============
setupSmartViewsHandlers();

// ============ 14. DAILY PLANNER (extracted to js/inline/daily-planner.js) ============
import { initDailyPlanner } from './inline/daily-planner.js';
const DailyPlanner = initDailyPlanner();


// Handle Notification Actions (Complete Task)
// Supports both personal tasks and shared subject tasks
// For recurring tasks with occurrenceDate: tracks per-instance completion instead of marking entire task complete
const handleCompleteTask = async (taskId, sharedSubjectId = null, occurrenceDate = null) => {
  // First try to find in local tasks array
  const task = tasks.find(t => t.id === taskId);

  // Case 1: Recurring task with occurrence date - use per-instance tracking
  if (task && task.recurrence && occurrenceDate) {
    console.log('Completing recurring task occurrence:', taskId, occurrenceDate);
    const completedOccurrences = task.completedOccurrences || [];

    // Check if this occurrence is already completed
    if (completedOccurrences.includes(occurrenceDate)) {
      console.log('Occurrence already completed:', occurrenceDate);
      if (typeof showToast === 'function') {
        showToast('This occurrence was already completed');
      }
      return false;
    }

    // Add occurrence to completed list
    completedOccurrences.push(occurrenceDate);
    const { id, isOwn, isShared, ...cleanTask } = task;
    saveTask(taskId, {
      ...cleanTask,
      completedOccurrences,
      completed: false  // Never mark recurring task as fully complete
    }, task.subject);

    if (typeof showToast === 'function') {
      showToast(`Occurrence completed!`);
    }
    return true;
  }

  // Case 2: Non-recurring task or no occurrence date - original behavior
  if (task && !task.completed) {
    console.log('Completing task from notification:', taskId);
    if (typeof maybeCreateRecurringTask === 'function') {
      maybeCreateRecurringTask(task);
    }
    const { id, isOwn, isShared, ...cleanTask } = task;
    saveTask(taskId, { ...cleanTask, completed: true }, task.subject);

    if (typeof showToast === 'function') {
      showToast(`Task "${task.title}" completed!`);
    }
    return true;
  }

  // Case 3: Shared task not in local array - query Firebase directly
  if (sharedSubjectId && taskId) {
    try {
      const taskRef = ref(db, `sharedSubjects/${sharedSubjectId}/tasks/${taskId}`);
      const snapshot = await get(taskRef);
      if (snapshot.exists()) {
        const taskData = snapshot.val();

        // Shared recurring task with occurrence date
        if (taskData.recurrence && occurrenceDate) {
          const completedOccurrences = taskData.completedOccurrences || [];
          if (completedOccurrences.includes(occurrenceDate)) {
            if (typeof showToast === 'function') {
              showToast('This occurrence was already completed');
            }
            return false;
          }
          completedOccurrences.push(occurrenceDate);
          await set(taskRef, {
            ...taskData,
            completedOccurrences,
            completed: false
          });
          console.log('Completed shared recurring task occurrence:', taskId, occurrenceDate);
          if (typeof showToast === 'function') {
            showToast(`Occurrence completed!`);
          }
          return true;
        }

        // Shared non-recurring task
        if (!taskData.completed) {
          if (typeof maybeCreateRecurringTask === 'function') {
            maybeCreateRecurringTask({
              ...taskData,
              id: taskId,
              subject: taskData.subject || sharedSubjectId,
              isShared: true
            });
          }
          await set(taskRef, { ...taskData, completed: true });
          console.log('Completed shared task from notification:', taskId);
          if (typeof showToast === 'function') {
            showToast(`Task "${taskData.title || 'Task'}" completed!`);
          }
          return true;
        }
      }
    } catch (e) {
      console.warn('Failed to complete shared task:', e);
    }
  }

  return false;
};
// Expose for mobile.js swipe gestures
window.handleCompleteTask = handleCompleteTask;

// Delete task function for mobile.js swipe-to-delete
const deleteTask = (taskOrId) => {
  const taskId = typeof taskOrId === 'string' ? taskOrId : taskOrId?.id;
  if (!taskId) return;
  remove(ref(db, `users/${currentUser}/tasks/${taskId}`));
  if (typeof showToast === 'function') {
    showToast('Task deleted');
  }
};
window.deleteTask = deleteTask;

const urlParams = new URLSearchParams(window.location.search);
const completeTaskId = urlParams.get('completeTask');
const completeTaskSharedSubject = urlParams.get('sharedSubject');
const completeTaskUser = urlParams.get('user');
const completeTaskOccurrence = urlParams.get('occurrence');

// Security: Only process completeTask if user matches or no user specified
const shouldProcessComplete = !completeTaskUser || completeTaskUser === currentUser;
if (completeTaskId && !shouldProcessComplete) {
  console.warn('[Task] Ignoring completeTask: user mismatch', { expected: completeTaskUser, actual: currentUser });
  // Clean up URL params
  const url = new URL(window.location);
  url.searchParams.delete('completeTask');
  url.searchParams.delete('user');
  url.searchParams.delete('sharedSubject');
  window.history.replaceState({}, '', url);
}
if (completeTaskId && shouldProcessComplete) {
  let taskCompleted = false;
  const checkData = setInterval(async () => {
    // For shared tasks, try immediately since we can query Firebase directly
    if (completeTaskSharedSubject) {
      clearInterval(checkData);
      taskCompleted = await handleCompleteTask(completeTaskId, completeTaskSharedSubject, completeTaskOccurrence);
      const url = new URL(window.location);
      url.searchParams.delete('completeTask');
      url.searchParams.delete('user');
      url.searchParams.delete('sharedSubject');
      url.searchParams.delete('occurrence');
      window.history.replaceState({}, '', url);
      if (!taskCompleted && typeof showToast === 'function') {
        showToast('Could not complete task - it may have been deleted or already completed.');
      }
      return;
    }
    // For personal tasks, wait for tasks array to load
    if (typeof tasks !== 'undefined' && tasks.length > 0) {
      clearInterval(checkData);
      taskCompleted = await handleCompleteTask(completeTaskId, null, completeTaskOccurrence);
      const url = new URL(window.location);
      url.searchParams.delete('completeTask');
      url.searchParams.delete('user');
      url.searchParams.delete('sharedSubject');
      url.searchParams.delete('occurrence');
      window.history.replaceState({}, '', url);
      if (!taskCompleted && typeof showToast === 'function') {
        showToast('Task not found - it may have been deleted.');
      }
    }
  }, 500);
  // Timeout with error feedback
  setTimeout(() => {
    clearInterval(checkData);
    if (!taskCompleted) {
      const url = new URL(window.location);
      url.searchParams.delete('completeTask');
      url.searchParams.delete('user');
      url.searchParams.delete('sharedSubject');
      url.searchParams.delete('occurrence');
      window.history.replaceState({}, '', url);
      if (typeof showToast === 'function') {
        showToast('Could not complete task - please try again.');
      }
    }
  }, 10000);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'pushsubscriptionchange') {
      syncExistingSubscriptionToCurrentUser().catch(() => { });
      refreshNotifyButton().catch(() => { });
      return;
    }
    // Handle notification click messages from SW
    if (event.data?.type === 'notificationclick') {
      const action = event.data?.action || 'view';
      const notificationUrl = event.data?.url || event.data?.data?.url;
      const completeUrl = event.data?.data?.completeUrl;

      // Handle 'complete' action - mark task as done
      if (action === 'complete' && completeUrl) {
        const parsedUrl = new URL(completeUrl, window.location.origin);
        const tid = parsedUrl.searchParams.get('completeTask');
        const sharedSubject = parsedUrl.searchParams.get('sharedSubject');
        const occurrence = parsedUrl.searchParams.get('occurrence');
        if (tid) {
          handleCompleteTask(tid, sharedSubject || null, occurrence || null);
        }
        return;
      }

      // Handle 'view' action - navigate to notification URL if different
      if (action === 'view' && notificationUrl) {
        try {
          const targetUrl = new URL(notificationUrl, window.location.origin);
          // Only navigate if URL is different from current (avoid reload loops)
          if (targetUrl.pathname !== window.location.pathname ||
            targetUrl.search !== window.location.search) {
            console.log('[SW Message] Navigating to notification URL:', notificationUrl);
            window.location.href = notificationUrl;
          }
        } catch (e) {
          console.warn('[SW Message] Invalid notification URL:', notificationUrl);
        }
      }
    }
  });
}

// ── Extracted inline modules ──────────────────────────────────────────────
import { initPwaInstall } from './inline/pwa-install.js';
import { initMobileNav } from './inline/mobile-nav.js';
import { initPullToRefresh } from './inline/pull-to-refresh.js';

initPwaInstall();
initMobileNav();
initPullToRefresh();
