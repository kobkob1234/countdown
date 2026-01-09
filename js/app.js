// ============================================
// Main Application Entry Point
// ============================================
// This file orchestrates the initialization of the modular app.
// For the initial refactor, we import the core modules and
// then include the bulk of the application logic inline to ensure
// compatibility during the migration.

import { AppState, $, STORAGE_KEYS, CACHE_KEYS, NOTIFY_KEYS, NOTIFY_TTL_MS, REMINDER_CATCHUP_MAX_MS, REMINDER_CATCHUP_MAX_COUNT, DELETE_TIMEOUT_MS, SYNC_TIMEOUT_MS, SYNC_MAX_WAIT_MS, SUBJECTS_NO_CACHE_TIMEOUT_MS } from './state.js';
import { db, ref, set, onValue, push, remove, onChildAdded, onChildChanged, onChildRemoved, goOnline, goOffline, eventsRef, getUserTasksRef, getUserSubjectsRef } from './firebase-config.js';
import { initAuth, getCurrentUser } from './auth.js';
import {
    initNotifications,
    showSystemNotification,
    playReminderSound,
    loadNotifiedMap,
    persistNotifiedMap,
    wasNotified,
    markNotified,
    syncNotifiedMapToIds,
    getLastActiveTimestamp,
    setLastActiveTimestamp,
    refreshNotifyButton
} from './notifications.js';
import {
    COLORS,
    HEBREW_DAYS,
    HEBREW_MONTHS,
    HEBREW_DAY_NAMES,
    PRIORITY_ORDER,
    PRIORITY_COLORS,
    PRIORITY_BG,
    PRIORITY_LABELS_HE,
    escapeHtml,
    delay,
    parseLocal,
    toLocalDatetime,
    toDateKey,
    formatDate,
    formatHebrewShortDate,
    formatReminderOffset,
    getStartOfWeek,
    getStartOfDay,
    getEndOfDay,
    isSameDay,
    isToday,
    isTomorrow,
    isThisWeek,
    calcTime,
    readCache,
    writeCache,
    getEventColor,
    isIOS,
    isStandalone,
    isMobileViewport,
    isPushSupported,
    isEditableTarget
} from './utils.js';
import {
    updateSyncBadge,
    markSyncReady,
    forceAllSyncReady,
    startMasterSyncTimeout,
    clearSyncTimeouts,
    startSyncTimeout,
    setEventsLoading,
    setTasksLoading
} from './sync.js';

// ============================================
// Application Initialization
// ============================================

console.log('[App] Loading application modules...');

// Initialize authentication first
const currentUser = initAuth();
console.log('[App] User authenticated:', currentUser);

// Private Firebase references (scoped to user)
const tasksRef = getUserTasksRef(currentUser);
const subjectsRef = getUserSubjectsRef(currentUser);

// ============================================
// The remaining application code will be loaded
// from the inline script in index.html during
// the transition period. Once fully modularized,
// this file will import and initialize all modules.
// ============================================

// Export commonly needed items for the inline script
window.AppModules = {
    // State
    AppState,
    $,
    STORAGE_KEYS,
    CACHE_KEYS,
    NOTIFY_KEYS,
    NOTIFY_TTL_MS,
    REMINDER_CATCHUP_MAX_MS,
    REMINDER_CATCHUP_MAX_COUNT,
    DELETE_TIMEOUT_MS,
    SYNC_TIMEOUT_MS,
    SYNC_MAX_WAIT_MS,
    SUBJECTS_NO_CACHE_TIMEOUT_MS,

    // Firebase
    db,
    ref,
    set,
    onValue,
    push,
    remove,
    onChildAdded,
    onChildChanged,
    onChildRemoved,
    goOnline,
    goOffline,
    eventsRef,
    tasksRef,
    subjectsRef,

    // Auth
    currentUser,
    getCurrentUser,

    // Notifications
    initNotifications,
    showSystemNotification,
    playReminderSound,
    loadNotifiedMap,
    persistNotifiedMap,
    wasNotified,
    markNotified,
    syncNotifiedMapToIds,
    getLastActiveTimestamp,
    setLastActiveTimestamp,
    refreshNotifyButton,

    // Utils
    COLORS,
    HEBREW_DAYS,
    HEBREW_MONTHS,
    HEBREW_DAY_NAMES,
    PRIORITY_ORDER,
    PRIORITY_COLORS,
    PRIORITY_BG,
    PRIORITY_LABELS_HE,
    escapeHtml,
    delay,
    parseLocal,
    toLocalDatetime,
    toDateKey,
    formatDate,
    formatHebrewShortDate,
    formatReminderOffset,
    getStartOfWeek,
    getStartOfDay,
    getEndOfDay,
    isSameDay,
    isToday,
    isTomorrow,
    isThisWeek,
    calcTime,
    readCache,
    writeCache,
    getEventColor,
    isIOS,
    isStandalone,
    isMobileViewport,
    isPushSupported,
    isEditableTarget,

    // Sync
    updateSyncBadge,
    markSyncReady,
    forceAllSyncReady,
    startMasterSyncTimeout,
    clearSyncTimeouts,
    startSyncTimeout,
    setEventsLoading,
    setTasksLoading
};

// Initialize notifications
initNotifications().then(() => {
    console.log('[App] Notifications initialized');
}).catch(err => {
    console.warn('[App] Notifications init failed:', err);
});

// Initialize theme
const initTheme = () => {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME);
    const themeToggle = $('themeToggle');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.body.classList.add('dark');
        if (themeToggle) themeToggle.textContent = '☀️';
    }
};
initTheme();

// Theme toggle handler
const themeToggle = $('themeToggle');
if (themeToggle) {
    themeToggle.onclick = () => {
        document.body.classList.toggle('dark');
        const isDark = document.body.classList.contains('dark');
        themeToggle.textContent = isDark ? '☀️' : '🌙';
        localStorage.setItem(STORAGE_KEYS.THEME, isDark ? 'dark' : 'light');
    };
}

console.log('[App] Core modules loaded. Window.AppModules is available for legacy code.');
