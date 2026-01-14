// ============================================
// Shared Application State
// ============================================

export const AppState = {
    // Firebase
    db: null,

    // User
    currentUser: null,

    // Events
    events: [],
    eventsById: new Map(),
    eventsLoaded: false,
    hasEventsCache: false,

    // Tasks  
    tasks: [],
    tasksLoaded: false,
    hasTasksCache: false,

    // Subjects
    subjects: [],
    subjectsLoaded: false,
    hasSubjectsCache: false,

    // UI State
    currentView: 'countdown',
    currentSubject: null,
    currentSmartView: null,
    editingId: null,
    editingTaskId: null,

    // Calendar
    currentMonth: new Date(),
    eventCalendarView: 'month',
    eventCalendarFocusDate: new Date(),

    // Pending operations
    pendingDeletes: new Map(),
    pendingAlerts: [],

    // Refs for timer updates
    refs: new Map(),
    tickerHandle: null,
    taskTickerHandle: null,

    // Undo stack
    undoStack: [],

    // Pomodoro
    pomodoroState: {
        running: false,
        mode: 'focus',
        timeRemaining: 25 * 60,
        sessionCount: 0,
        settings: {
            focusMinutes: 25,
            breakMinutes: 5,
            longBreakMinutes: 15,
            longBreakEvery: 4,
            autoContinue: false,
            sound: true
        }
    },

    // Notification tracking
    notifiedEvents: new Map(),
    notifiedTasks: new Map(),
    lastActiveTs: Date.now(),

    // Sync state
    syncState: { events: false, tasks: false, subjects: false },
    syncCacheUsed: { events: false, tasks: false, subjects: false }
};

// DOM element cache helper
export const $ = id => document.getElementById(id);

// Storage keys
export const STORAGE_KEYS = {
    THEME: 'countdown-theme',
    SIDEBAR_WIDTH: 'countdown-sidebar-width',
    GOOGLE_API_KEY: 'countdown-google-api-key',
    GOOGLE_CLIENT_ID: 'countdown-google-client-id',
    SETTINGS_AUTO_DELETE: 'countdown-settings-auto-delete'
};

export const CACHE_KEYS = {
    EVENTS: 'countdown-events-cache-v1',
    TASKS_PREFIX: 'countdown-tasks-cache-v1:',
    SUBJECTS_PREFIX: 'countdown-subjects-cache-v1:'
};

// NOTIFY_KEYS factory - returns user-scoped storage keys
export const getNotifyKeys = (currentUser) => {
    const scope = currentUser ? `:${currentUser}` : '';
    return {
        EVENTS: `countdown-notified-events-v1${scope}`,
        TASKS: `countdown-notified-tasks-v1${scope}`,
        PLANNER: `countdown-notified-planner-v1${scope}`,
        EVENTS_LAST_CHECK: `countdown-last-event-check-v1${scope}`,
        TASKS_LAST_CHECK: `countdown-last-task-check-v1${scope}`,
        PLANNER_LAST_CHECK: `countdown-last-planner-check-v1${scope}`,
        LAST_ACTIVE: `countdown-last-active-v1${scope}`
    };
};

// Legacy non-scoped keys (kept for backward compatibility with js/notifications.js)
export const NOTIFY_KEYS = {
    EVENTS: 'countdown-notified-events-v1',
    TASKS: 'countdown-notified-tasks-v1',
    LAST_ACTIVE: 'countdown-last-active-v1'
};

// Validation constants
export const MAX_REMINDER_MINUTES = 10080; // 1 week maximum

// Timing constants
export const NOTIFY_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
export const REMINDER_CATCHUP_MAX_MS = 1000 * 60 * 60 * 12; // 12 hours
export const REMINDER_CATCHUP_MAX_COUNT = 6;
export const DELETE_TIMEOUT_MS = 10000;
export const SYNC_TIMEOUT_MS = 15000;
export const SUBJECTS_NO_CACHE_TIMEOUT_MS = 8000;
export const SYNC_MAX_WAIT_MS = 20000;
