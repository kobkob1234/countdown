// ============================================
// Sync Badge Module
// ============================================

import { AppState, $, SYNC_TIMEOUT_MS, SYNC_MAX_WAIT_MS, SUBJECTS_NO_CACHE_TIMEOUT_MS } from './state.js';

// Sync timeouts tracker
const syncTimeouts = { events: null, tasks: null, subjects: null, subjectsNoCache: null };
let syncMasterTimeout = null;

// ============================================
// Sync State Management
// ============================================

export function updateSyncBadge() {
    const syncBadge = $('syncBadge');
    if (!syncBadge) return;

    const hasCache = Object.values(AppState.syncCacheUsed).some(Boolean);
    const ready = AppState.syncState.events && AppState.syncState.tasks && AppState.syncState.subjects;
    const total = Object.keys(AppState.syncState).length;
    const readyCount = Object.values(AppState.syncState).filter(Boolean).length;
    const percent = Math.floor((readyCount / total) * 100);

    const syncText = syncBadge.querySelector('.sync-text');
    if (syncText) syncText.textContent = ready ? 'Synced' : `Syncing ${percent}%`;

    syncBadge.classList.toggle('hidden', !hasCache || ready);

    // Clear master timeout when all syncs complete
    if (ready && syncMasterTimeout) {
        clearTimeout(syncMasterTimeout);
        syncMasterTimeout = null;
    }
}

export function markSyncReady(key, source = 'unknown') {
    if (AppState.syncState[key]) {
        console.debug(`[sync] ${key} already ready (${source})`);
        return;
    }
    AppState.syncState[key] = true;
    const total = Object.keys(AppState.syncState).length;
    const readyCount = Object.values(AppState.syncState).filter(Boolean).length;
    console.debug(`[sync] ${key} ready (${source}) ${readyCount}/${total}`);
    updateSyncBadge();
}

export function forceAllSyncReady(reason = 'master-timeout') {
    Object.keys(AppState.syncState).forEach(key => {
        if (!AppState.syncState[key]) {
            AppState.syncState[key] = true;
            console.debug(`[sync] ${key} force-ready (${reason})`);
        }
    });

    // Clear all pending timeouts
    Object.keys(syncTimeouts).forEach(key => {
        if (syncTimeouts[key]) {
            clearTimeout(syncTimeouts[key]);
            syncTimeouts[key] = null;
        }
    });

    if (syncMasterTimeout) {
        clearTimeout(syncMasterTimeout);
        syncMasterTimeout = null;
    }

    updateSyncBadge();
}

export function startMasterSyncTimeout() {
    if (syncMasterTimeout) return; // Already started
    syncMasterTimeout = setTimeout(() => {
        syncMasterTimeout = null;
        const ready = AppState.syncState.events && AppState.syncState.tasks && AppState.syncState.subjects;
        if (!ready) {
            console.debug(`[sync] Master timeout after ${SYNC_MAX_WAIT_MS}ms - forcing all ready`);
            forceAllSyncReady('master-timeout');
        }
    }, SYNC_MAX_WAIT_MS);
}

export function clearSyncTimeouts(key) {
    const keys = key === 'subjects' ? ['subjects', 'subjectsNoCache'] : [key];
    keys.forEach((timeoutKey) => {
        if (syncTimeouts[timeoutKey]) {
            clearTimeout(syncTimeouts[timeoutKey]);
            syncTimeouts[timeoutKey] = null;
        }
    });
}

export function startSyncTimeout(key, ms, reason, onTimeout) {
    const timeoutKey = (key === 'subjects' && reason === 'no-cache') ? 'subjectsNoCache' : key;
    syncTimeouts[timeoutKey] = setTimeout(() => {
        syncTimeouts[timeoutKey] = null;
        if (AppState.syncState[key]) return;
        console.debug(`[sync] ${key} timeout after ${ms}ms (${reason}) - continuing with cache`);
        if (typeof onTimeout === 'function') onTimeout();
        markSyncReady(key, `timeout:${reason}`);
    }, ms);
}

// ============================================
// Loading State
// ============================================

export function setEventsLoading(isLoading) {
    const eventList = $('eventList');
    if (!eventList) return;
    eventList.classList.toggle('loading', isLoading);
}

export function setTasksLoading(isLoading) {
    const activeTasks = $('activeTasks');
    if (!activeTasks) return;
    activeTasks.classList.toggle('loading', isLoading);
}
