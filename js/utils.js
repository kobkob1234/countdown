// ============================================
// Shared Utility Functions
// ============================================

// Color palette for events
export const COLORS = ['#667eea', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16'];

// Hebrew localization
export const HEBREW_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
export const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
export const HEBREW_DAY_NAMES = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת'];

// Priority configuration
export const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
export const PRIORITY_COLORS = { urgent: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e', none: '#6b7280' };
export const PRIORITY_BG = {
    urgent: 'rgba(239,68,68,0.15)',
    high: 'rgba(249,115,22,0.15)',
    medium: 'rgba(234,179,8,0.15)',
    low: 'rgba(34,197,94,0.15)',
    none: 'var(--day-other)'
};
export const PRIORITY_LABELS_HE = { urgent: 'דחוף', high: 'גבוה', medium: 'בינוני', low: 'נמוך', none: '' };

// ============================================
// String Utilities
// ============================================

export const escapeHtml = (str) => String(str || '').replaceAll(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
})[c]);

// ============================================
// Date/Time Utilities
// ============================================

export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export function parseLocal(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!match) return null;
    const [, Y, Mo, D, H, Mi] = match;
    return new Date(+Y, +Mo - 1, +D, +H, +Mi, 0, 0);
}

export function toLocalDatetime(isoString) {
    const d = new Date(isoString);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toDateKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDate(iso) {
    const d = new Date(iso);
    const day = d.getDate();
    const month = d.toLocaleString('he-IL', { month: 'short' });
    const weekday = d.toLocaleString('he-IL', { weekday: 'short' });
    const time = d.toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit' });
    return `${weekday}, ${day} ${month}, ${time}`;
}

export function formatHebrewShortDate(date) {
    const d = new Date(date);
    return `${d.getDate()} ב${HEBREW_MONTHS[d.getMonth()]}`;
}

export function formatReminderOffset(minutes) {
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

export function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
}

export function getStartOfDay(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

export function getEndOfDay(date = new Date()) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

export function isSameDay(date1, date2) {
    return toDateKey(date1) === toDateKey(date2);
}

export function isToday(date) {
    return isSameDay(date, new Date());
}

export function isTomorrow(date) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return isSameDay(date, tomorrow);
}

export function isThisWeek(date) {
    const now = new Date();
    const start = getStartOfWeek(now);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const d = new Date(date);
    return d >= start && d < end;
}

export function calcTime(target) {
    const diff = Math.max(0, new Date(target).getTime() - Date.now());
    return {
        ended: diff === 0,
        d: Math.floor(diff / 86400000),
        h: Math.floor((diff % 86400000) / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000)
    };
}

// ============================================
// Cache Utilities
// ============================================

export const readCache = (key) => {
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

export const writeCache = (key, items, limit = 300) => {
    try {
        const payload = { ts: Date.now(), items: items.slice(0, limit) };
        localStorage.setItem(key, JSON.stringify(payload));
    } catch (e) { }
};

// ============================================
// Color Utilities
// ============================================

export function getEventColor(id) {
    const charCode = id.codePointAt(id.length - 1);
    return COLORS[charCode % COLORS.length];
}

// ============================================
// Crypto Utilities
// ============================================

export async function sha256Base64Url(input) {
    const data = new TextEncoder().encode(String(input || ''));
    const digest = await crypto.subtle.digest('SHA-256', data);
    const bytes = Array.from(new Uint8Array(digest));
    const b64 = btoa(String.fromCodePoint(...bytes));
    return b64.replaceAll('+', '-').replaceAll('/', '_').replaceAll(/=+$/g, '');
}

// ============================================
// Device Detection
// ============================================

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

export const isStandalone = () =>
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    (typeof navigator.standalone === 'boolean' && navigator.standalone);

export const isMobileViewport = () =>
    window.innerWidth <= 768 ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches && window.innerWidth <= 1024);

export const isPushSupported = () => (
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window
);

// ============================================
// Input Detection
// ============================================

export function isEditableTarget(target) {
    if (!target) return false;
    const tagName = target.tagName?.toUpperCase();
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName)) return true;
    if (target.isContentEditable) return true;
    return false;
}
