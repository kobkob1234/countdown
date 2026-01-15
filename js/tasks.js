import { ctx } from './context.js';

export function initTasks(hooks = {}) {
  const {
    onTasksUpdated,
    onTasksCacheLoaded,
    onTasksLoadError
  } = hooks;

  const getTasks = () => ctx.tasks || [];
  const setTasks = (val) => { ctx.tasks = val; };
  const getOwnTasks = () => ctx.ownTasks || [];
  const setOwnTasks = (val) => { ctx.ownTasks = val; };

  const runUpdated = () => {
    if (typeof onTasksUpdated === 'function') onTasksUpdated();
  };

  const runCacheLoaded = () => {
    if (typeof onTasksCacheLoaded === 'function') onTasksCacheLoaded();
  };

  const runLoadError = (error) => {
    if (typeof onTasksLoadError === 'function') onTasksLoadError(error);
  };

  const cachedTasksKey = `${ctx.CACHE_KEYS?.TASKS_PREFIX || ''}${ctx.currentUser || ''}`;
  const cachedTasks = ctx.readCache ? ctx.readCache(cachedTasksKey) : null;
  if (cachedTasks && cachedTasks.length) {
    setTasks(cachedTasks);
    ctx.hasTasksCache = true;
    if (ctx.syncCacheUsed) ctx.syncCacheUsed.tasks = true;
    if (typeof ctx.markSyncReady === 'function') ctx.markSyncReady('tasks', 'cache');
    if (typeof ctx.updateSyncBadge === 'function') ctx.updateSyncBadge();
    if (ctx.Pomodoro?.updateTasks) ctx.Pomodoro.updateTasks(getTasks());
    runCacheLoaded();
  } else {
    if (typeof ctx.showTasksLoading === 'function') ctx.showTasksLoading();
  }

  if (typeof ctx.startSyncTimeout === 'function') {
    ctx.startSyncTimeout('tasks', ctx.SYNC_TIMEOUT_MS, 'firebase', () => {
      ctx.tasksLoaded = true;
      if (typeof ctx.resetTasksEmptyMessage === 'function') ctx.resetTasksEmptyMessage();
      runUpdated();
    });
  }

  if (typeof ctx.onValue === 'function' && ctx.tasksRef) {
    ctx.onValue(ctx.tasksRef, (snapshot) => {
      if (typeof ctx.clearSyncTimeouts === 'function') ctx.clearSyncTimeouts('tasks');
      const data = snapshot.val();
      if (data) {
        const next = Object.keys(data).map(key => ({ id: key, ...data[key], isOwn: true }));
        setOwnTasks(next);
      } else {
        setOwnTasks([]);
      }
      ctx.tasksLoaded = true;
      if (typeof ctx.markSyncReady === 'function') ctx.markSyncReady('tasks', 'firebase');
      if (typeof ctx.writeCache === 'function') ctx.writeCache(cachedTasksKey, getOwnTasks(), 500);
      if (typeof ctx.resetTasksEmptyMessage === 'function') ctx.resetTasksEmptyMessage();
      if (typeof ctx.mergeTasks === 'function') ctx.mergeTasks();
      if (ctx.Pomodoro?.updateTasks) ctx.Pomodoro.updateTasks(getTasks());
      runUpdated();
    }, (error) => {
      console.error('Tasks sync error:', error);
      if (typeof ctx.clearSyncTimeouts === 'function') ctx.clearSyncTimeouts('tasks');
      ctx.tasksLoaded = true;
      if (typeof ctx.markSyncReady === 'function') ctx.markSyncReady('tasks', 'error');
      if (typeof ctx.resetTasksEmptyMessage === 'function') ctx.resetTasksEmptyMessage();
      if (typeof ctx.updateSyncBadge === 'function') ctx.updateSyncBadge();
      runLoadError(error);
    });
  }

  // Helper function to get the correct task reference based on subject type
  function getTaskRef(task) {
    if (!task) return null;
    const subject = (ctx.subjects || []).find(s => s.id === task.subject);
    if (subject?.isShared) {
      return ctx.ref(ctx.db, `sharedSubjects/${task.subject}/tasks/${task.id}`);
    }
    return ctx.ref(ctx.db, `users/${ctx.currentUser}/tasks/${task.id}`);
  }

  // Helper to save task to correct location
  function saveTask(taskId, taskData, subjectId) {
    const subject = (ctx.subjects || []).find(s => s.id === subjectId);
    if (subject?.isShared) {
      return ctx.set(ctx.ref(ctx.db, `sharedSubjects/${subjectId}/tasks/${taskId}`), taskData);
    }
    return ctx.set(ctx.ref(ctx.db, `users/${ctx.currentUser}/tasks/${taskId}`), taskData);
  }

  // Helper to remove task from correct location
  function removeTask(task) {
    if (!task) return;
    // Push to undo stack before deleting
    if (typeof ctx.pushToUndoStack === 'function') {
      ctx.pushToUndoStack({ type: 'deleteTask', taskId: task.id, taskData: { ...task }, message: `🗑️ "${task.title}" נמחק` });
    }
    const subject = (ctx.subjects || []).find(s => s.id === task.subject);
    if (subject?.isShared || task.isShared) {
      return ctx.remove(ctx.ref(ctx.db, `sharedSubjects/${task.subject}/tasks/${task.id}`));
    }
    return ctx.remove(ctx.ref(ctx.db, `users/${ctx.currentUser}/tasks/${task.id}`));
  }

  // Helper to create a new task in the correct location based on subject
  function createTask(taskData) {
    const subjectId = taskData.subject;
    const subject = (ctx.subjects || []).find(s => s.id === subjectId);
    // Check both subject lookup AND taskData.isShared flag (for cloned tasks)
    if (subject?.isShared || taskData.isShared) {
      const targetSubjectId = subjectId || taskData.subject;
      if (targetSubjectId) {
        const newTaskRef = ctx.push(ctx.ref(ctx.db, `sharedSubjects/${targetSubjectId}/tasks`));
        return ctx.set(newTaskRef, taskData);
      }
    }
    const newTaskRef = ctx.push(ctx.tasksRef);
    return ctx.set(newTaskRef, taskData);
  }

  return {
    getTaskRef,
    saveTask,
    removeTask,
    createTask
  };
}
