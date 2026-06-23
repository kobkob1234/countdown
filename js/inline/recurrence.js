// ============================================
// Recurrence helpers — pure date math.
// Extracted verbatim from main.js. No DOM, no shared state, no imports —
// safe to use from any module. See REFACTOR-main-split.md (step 1).
// ============================================

export const RECURRENCE_UNIT_LABELS = {
  days: { singular: 'יום', plural: 'ימים' },
  weeks: { singular: 'שבוע', plural: 'שבועות' },
  months: { singular: 'חודש', plural: 'חודשים' },
  years: { singular: 'שנה', plural: 'שנים' }
};

export function parseRecurrenceValue(value) {
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

export function normalizeRecurrence(value) {
  return parseRecurrenceValue(value).type || 'none';
}

export function getNextRecurrenceDate(baseIso, recurrence) {
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

// Expand a (possibly recurring) task's due date into the occurrences whose
// reminder could fire within the current check window. Mirrors the server's
// getOccurrencesToCheck so in-app reminders match push reminders for every
// occurrence of a recurring task (not just the first one).
export function getReminderOccurrences(baseIso, recurrence, nowMs, maxReminderMs, windowStartMs) {
  const parsed = parseRecurrenceValue(recurrence);
  const type = parsed.type || 'none';
  const base = baseIso ? new Date(baseIso) : null;
  if (!base || Number.isNaN(base.getTime())) return [];
  if (type === 'none') return [base];

  const advance = (date) => {
    const next = new Date(date);
    switch (type) {
      case 'daily': next.setDate(next.getDate() + 1); break;
      case 'weekdays':
        do { next.setDate(next.getDate() + 1); } while (next.getDay() === 5 || next.getDay() === 6);
        break;
      case 'weekly': next.setDate(next.getDate() + 7); break;
      case 'biweekly': next.setDate(next.getDate() + 14); break;
      case 'monthly': next.setMonth(next.getMonth() + 1); break;
      case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
      case 'custom':
        if (!parsed.interval || !parsed.unit) return null;
        if (parsed.unit === 'days') next.setDate(next.getDate() + parsed.interval);
        else if (parsed.unit === 'weeks') next.setDate(next.getDate() + parsed.interval * 7);
        else if (parsed.unit === 'months') next.setMonth(next.getMonth() + parsed.interval);
        else if (parsed.unit === 'years') next.setFullYear(next.getFullYear() + parsed.interval);
        else return null;
        break;
      default: return null;
    }
    return next;
  };

  const maxFutureTime = nowMs + maxReminderMs + 60000;
  const minTime = (Number.isFinite(windowStartMs) ? windowStartMs : (nowMs - maxReminderMs)) - 60000;
  const occurrences = [];
  let cur = base;
  let iterations = 0;
  while (cur && cur.getTime() <= maxFutureTime && iterations < 10000) {
    if (cur.getTime() >= minTime) occurrences.push(new Date(cur));
    cur = advance(cur);
    iterations++;
  }
  return occurrences;
}
