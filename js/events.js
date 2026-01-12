import { ctx } from './context.js';

export function initEvents(hooks = {}) {
  const {
    onEventsUpdated,
    onEventsCacheLoaded,
    onEventsLoadError
  } = hooks;

  const getEvents = () => ctx.events || [];
  const setEvents = (val) => { ctx.events = val; };
  const eventsById = ctx.eventsById;

  const runUpdated = () => {
    if (typeof onEventsUpdated === 'function') onEventsUpdated();
  };

  const runCacheLoaded = () => {
    if (typeof onEventsCacheLoaded === 'function') onEventsCacheLoaded();
  };

  const runLoadError = (error) => {
    if (typeof onEventsLoadError === 'function') onEventsLoadError(error);
  };

  const cachedEvents = ctx.readCache ? ctx.readCache(ctx.CACHE_KEYS?.EVENTS) : null;
  if (cachedEvents && cachedEvents.length) {
    setEvents(cachedEvents);
    eventsById?.clear?.();
    cachedEvents.forEach(e => eventsById?.set?.(e.id, e));
    ctx.hasEventsCache = true;
    if (ctx.syncCacheUsed) ctx.syncCacheUsed.events = true;
    ctx.eventsLoaded = true;
    if (typeof ctx.markSyncReady === 'function') ctx.markSyncReady('events', 'cache');
    if (typeof ctx.setEventsLoading === 'function') ctx.setEventsLoading(false);
    if (typeof ctx.updateSyncBadge === 'function') ctx.updateSyncBadge();
    runCacheLoaded();
  } else {
    if (typeof ctx.setEventsLoading === 'function') ctx.setEventsLoading(true);
  }

  if (typeof ctx.startSyncTimeout === 'function') {
    ctx.startSyncTimeout('events', ctx.SYNC_TIMEOUT_MS, 'firebase', () => {
      ctx.eventsLoaded = true;
      if (typeof ctx.setEventsLoading === 'function') ctx.setEventsLoading(false);
      runUpdated();
    });
  }

  if (typeof ctx.onValue === 'function' && ctx.eventsRef) {
    ctx.onValue(ctx.eventsRef, (snapshot) => {
      if (typeof ctx.clearSyncTimeouts === 'function') ctx.clearSyncTimeouts('events');
      const data = snapshot.val();
      eventsById?.clear?.();
      if (data) {
        const next = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        setEvents(next);
        next.forEach(e => eventsById?.set?.(e.id, e));
      } else {
        setEvents([]);
      }
      ctx.eventsLoaded = true;
      if (typeof ctx.markSyncReady === 'function') ctx.markSyncReady('events', 'firebase');
      if (typeof ctx.writeCache === 'function') ctx.writeCache(ctx.CACHE_KEYS?.EVENTS, getEvents(), 300);
      if (typeof ctx.setEventsLoading === 'function') ctx.setEventsLoading(false);
      runUpdated();
    }, (error) => {
      console.error('Events sync error:', error);
      if (typeof ctx.clearSyncTimeouts === 'function') ctx.clearSyncTimeouts('events');
      ctx.eventsLoaded = true;
      if (typeof ctx.markSyncReady === 'function') ctx.markSyncReady('events', 'error');
      if (typeof ctx.setEventsLoading === 'function') ctx.setEventsLoading(false);
      if (typeof ctx.updateSyncBadge === 'function') ctx.updateSyncBadge();
      runLoadError(error);
    });
  }

  const saveToCloud = async (eventData) => {
    if (!ctx.push || !ctx.eventsRef || !ctx.set) return;
    const newEventRef = ctx.push(ctx.eventsRef);
    const id = newEventRef.key;

    // Optimistic UI
    if (typeof ctx.upsertLocalEvent === 'function') {
      ctx.upsertLocalEvent(id, eventData);
    }
    runUpdated();
    if (typeof ctx.writeCache === 'function') ctx.writeCache(ctx.CACHE_KEYS?.EVENTS, getEvents(), 300);

    try {
      await ctx.set(newEventRef, eventData);
    } catch (err) {
      // Rollback on failure
      const filtered = getEvents().filter(e => e.id !== id);
      setEvents(filtered);
      eventsById?.delete?.(id);
      runUpdated();
      console.error(err);
      alert('Save failed (check connection).');
    }
  };

  const updateInCloud = async (id, data) => {
    if (!ctx.set || !ctx.ref || !ctx.db) return;
    const { id: _ignore, ...payload } = data;
    const prev = eventsById?.get?.(id) ? { ...eventsById.get(id) } : null;

    // Optimistic UI
    if (typeof ctx.upsertLocalEvent === 'function') {
      ctx.upsertLocalEvent(id, payload);
    }
    runUpdated();
    if (typeof ctx.writeCache === 'function') ctx.writeCache(ctx.CACHE_KEYS?.EVENTS, getEvents(), 300);

    try {
      await ctx.set(ctx.ref(ctx.db, 'events/' + id), payload);
    } catch (err) {
      // Rollback
      if (prev && typeof ctx.upsertLocalEvent === 'function') ctx.upsertLocalEvent(id, prev);
      runUpdated();
      console.error(err);
      alert('Update failed (check connection).');
    }
  };

  const deleteFromCloud = async (id) => {
    if (!ctx.remove || !ctx.ref || !ctx.db) return;

    // Snapshot for rollback
    const prevEvents = getEvents();
    const eventToDelete = eventsById?.get?.(id);

    // Optimistic Update
    const filtered = prevEvents.filter(e => e.id !== id);
    setEvents(filtered);
    eventsById?.delete?.(id);
    runUpdated();

    // Update Cache Immediately
    if (typeof ctx.writeCache === 'function') {
      ctx.writeCache(ctx.CACHE_KEYS?.EVENTS, filtered, 300);
    }

    try {
      await ctx.remove(ctx.ref(ctx.db, 'events/' + id));
    } catch (err) {
      // Rollback on failure
      console.error('Delete failed, rolling back:', err);
      setEvents(prevEvents);
      if (eventToDelete && eventsById) eventsById.set(id, eventToDelete);
      runUpdated();
      if (typeof ctx.writeCache === 'function') {
        ctx.writeCache(ctx.CACHE_KEYS?.EVENTS, prevEvents, 300);
      }
      alert('Delete failed (check connection).');
    }
  };

  const clearAllCloud = () => {
    if (!ctx.set || !ctx.eventsRef) return;
    ctx.set(ctx.eventsRef, null);
  };

  return {
    saveToCloud,
    updateInCloud,
    deleteFromCloud,
    clearAllCloud
  };
}
