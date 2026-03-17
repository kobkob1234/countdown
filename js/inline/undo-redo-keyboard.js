// ============ UNDO/REDO STACK + KEYBOARD NAVIGATION ============
import { ctx } from '../context.js';

const $ = id => document.getElementById(id);

export function initUndoRedoKeyboard() {
  // ── Undo / Redo ──────────────────────────────────────────────
  const undoStack = [];
  const redoStack = [];
  const MAX_UNDO_STACK = 50;
  const undoStackToast = $("undoStackToast");
  const undoStackMessage = $("undoStackMessage");
  const undoStackUndoBtn = $("undoStackUndo");
  const undoStackDismissBtn = $("undoStackDismiss");
  let undoStackTimeout = null;

  function pushToUndoStack(action) {
    undoStack.push(action);
    if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();
    redoStack.length = 0;
    showUndoStackToast(action.message);
  }
  ctx.pushToUndoStack = pushToUndoStack;

  function showUndoStackToast(message) {
    if (!undoStackToast) return;
    undoStackMessage.textContent = message;
    undoStackToast.classList.add('show');
    if (undoStackTimeout) clearTimeout(undoStackTimeout);
    undoStackTimeout = setTimeout(() => undoStackToast.classList.remove('show'), 8000);
  }

  function hideUndoStackToast() {
    if (!undoStackToast) return;
    undoStackToast.classList.remove('show');
    if (undoStackTimeout) clearTimeout(undoStackTimeout);
  }

  function performUndo() {
    const action = undoStack.pop();
    if (!action) return;
    redoStack.push(action);

    if (action.type === 'deleteTask' && action.taskData) {
      const { id, ...data } = action.taskData;
      ctx.createTask(data);
    } else if (action.type === 'deleteEvent' && action.eventData) {
      ctx.saveToCloud(action.eventData);
    } else if (action.type === 'completeTask' && action.taskId) {
      const task = ctx.tasks.find(t => t.id === action.taskId);
      if (task) {
        const { id, ...clean } = task;
        ctx.saveTask(action.taskId, { ...clean, completed: !task.completed }, task.subject);
      }
    }
    hideUndoStackToast();
  }

  function performRedo() {
    const action = redoStack.pop();
    if (!action) return;
    undoStack.push(action);

    if (action.type === 'deleteTask' && action.taskId) {
      const task = ctx.tasks.find(t => t.id === action.taskId);
      if (task) ctx.removeTask(task);
    } else if (action.type === 'deleteEvent' && action.eventId) {
      ctx.deleteFromCloud(action.eventId);
    }
  }

  if (undoStackUndoBtn) undoStackUndoBtn.onclick = performUndo;
  if (undoStackDismissBtn) undoStackDismissBtn.onclick = hideUndoStackToast;

  // Cmd+Z for undo, Cmd+Shift+Z for redo
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      if (ctx.isEditableTarget(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) {
        performRedo();
      } else {
        performUndo();
      }
    }
  });

  // ── Keyboard Navigation (Vim-style j/k) ─────────────────────
  let vimFocusedTaskIndex = -1;

  function updateVimFocus() {
    document.querySelectorAll('.task-item.vim-focused').forEach(el => el.classList.remove('vim-focused'));
    const taskItems = Array.from(document.querySelectorAll('.task-item:not(.completed-task)'));
    if (vimFocusedTaskIndex >= 0 && vimFocusedTaskIndex < taskItems.length) {
      taskItems[vimFocusedTaskIndex].classList.add('vim-focused');
      taskItems[vimFocusedTaskIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  document.addEventListener('keydown', (e) => {
    if (ctx.isEditableTarget(e.target)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const taskItems = Array.from(document.querySelectorAll('.task-item:not(.completed-task)'));
    if (taskItems.length === 0) return;

    if (e.key === 'j') {
      e.preventDefault();
      vimFocusedTaskIndex = Math.min(vimFocusedTaskIndex + 1, taskItems.length - 1);
      if (vimFocusedTaskIndex < 0) vimFocusedTaskIndex = 0;
      updateVimFocus();
    } else if (e.key === 'k') {
      e.preventDefault();
      vimFocusedTaskIndex = Math.max(vimFocusedTaskIndex - 1, 0);
      updateVimFocus();
    } else if (e.key === 'Enter' && vimFocusedTaskIndex >= 0) {
      e.preventDefault();
      const taskEl = taskItems[vimFocusedTaskIndex];
      if (taskEl) {
        const taskId = taskEl.dataset.id;
        if (taskId && ctx.openTaskEditModal) ctx.openTaskEditModal(taskId);
      }
    } else if (e.key === 'x' && vimFocusedTaskIndex >= 0) {
      e.preventDefault();
      const taskEl = taskItems[vimFocusedTaskIndex];
      if (taskEl) {
        const checkbox = taskEl.querySelector('.task-checkbox');
        if (checkbox) checkbox.click();
      }
    }
  });
}
