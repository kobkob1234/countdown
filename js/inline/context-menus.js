// ============ CONTEXT MENUS ============
import { ctx } from '../context.js';
import { createConfetti } from './confetti.js';

const $ = id => document.getElementById(id);

export function initContextMenus() {
  // Helper to create context menu
  function createContextMenu(x, y, items, className = '') {
    document.querySelectorAll('.dynamic-context-menu').forEach(m => m.remove());

    const menu = document.createElement('div');
    menu.className = `context-menu dynamic-context-menu ${className}`.trim();
    menu.classList.add('open');
    menu.style.cssText = `position: fixed; left: ${x}px; top: ${y}px; z-index: 15000;`;

    items.forEach(item => {
      if (item.divider) {
        const div = document.createElement('div');
        div.className = 'context-menu-divider';
        menu.appendChild(div);
        return;
      }
      if (item.header) {
        const h = document.createElement('div');
        h.className = 'context-menu-header';
        h.style.cssText = 'padding: 8px 16px; font-size: 11px; color: var(--muted); font-weight: 600;';
        h.textContent = item.header;
        menu.appendChild(h);
        return;
      }
      const el = document.createElement('div');
      el.className = 'context-menu-item';
      if (item.shortcut) {
        el.innerHTML = `<span class="context-menu-item-icon">${item.icon}</span><span style="flex:1">${item.label}</span><span class="context-menu-item-shortcut">${item.shortcut}</span>`;
      } else {
        el.innerHTML = `<span class="context-menu-item-icon">${item.icon}</span>${item.label}`;
      }
      el.onclick = () => { menu.remove(); item.action(); };
      menu.appendChild(el);
    });

    document.body.appendChild(menu);

    // Ensure menu stays within viewport
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 10) + 'px';

    setTimeout(() => {
      const closeHandler = (e) => {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener('click', closeHandler);
          document.removeEventListener('contextmenu', closeHandler);
        }
      };
      document.addEventListener('click', closeHandler);
      document.addEventListener('contextmenu', closeHandler);
    }, 0);

    return menu;
  }

  // Task Context Menu
  function showTaskContextMenu(x, y, taskId) {
    const task = ctx.tasks.find(t => t.id === taskId);
    if (!task) return;

    const priorityItems = [
      { header: '⚡ עדיפות' },
      { icon: '🔴', label: 'דחוף', action: () => updateTaskPriority(taskId, 'urgent') },
      { icon: '🟠', label: 'גבוה', action: () => updateTaskPriority(taskId, 'high') },
      { icon: '🟡', label: 'בינוני', action: () => updateTaskPriority(taskId, 'medium') },
      { icon: '🟢', label: 'נמוך', action: () => updateTaskPriority(taskId, 'low') },
      { icon: '⬜', label: 'ללא', action: () => updateTaskPriority(taskId, 'none') },
    ];

    const subjects = ctx.subjects;
    const subjectItems = subjects.length > 0 ? [
      { header: '📁 העבר לנושא' },
      { icon: '📂', label: 'ללא נושא', action: () => moveTaskToSubject(taskId, null) },
      ...subjects.slice(0, 5).map(s => ({
        icon: '📁', label: s.name, action: () => moveTaskToSubject(taskId, s.id)
      }))
    ] : [];

    const dateItems = [
      { header: '📅 תאריך יעד' },
      { icon: '📆', label: 'היום', action: () => setTaskDueDate(taskId, 0) },
      { icon: '📆', label: 'מחר', action: () => setTaskDueDate(taskId, 1) },
      { icon: '📆', label: 'בעוד שבוע', action: () => setTaskDueDate(taskId, 7) },
      { icon: '🚫', label: 'הסר תאריך', action: () => setTaskDueDate(taskId, null) },
    ];

    const reminderItems = [
      { header: '⏰ תזכורת' },
      { icon: '🔔', label: '10 דקות לפני', action: () => setTaskReminder(taskId, 10) },
      { icon: '🔔', label: '30 דקות לפני', action: () => setTaskReminder(taskId, 30) },
      { icon: '🔔', label: 'שעה לפני', action: () => setTaskReminder(taskId, 60) },
      { icon: '🔔', label: 'יום לפני', action: () => setTaskReminder(taskId, 1440) },
      { icon: '🔕', label: 'ללא תזכורת', action: () => setTaskReminder(taskId, 0) },
    ];

    const items = [
      { icon: task.completed ? '⬜' : '✅', label: task.completed ? 'סמן כלא הושלם' : 'סמן כהושלם', shortcut: 'X', action: () => toggleTaskComplete(taskId) },
      { icon: '✏️', label: 'עריכה', shortcut: 'Enter', action: () => ctx.openTaskEditModal(taskId) },
      { icon: '📋', label: 'שכפל', action: () => duplicateTask(taskId) },
      { icon: '🗑️', label: 'מחק', action: () => deleteTaskById(taskId) },
      { divider: true },
      ...priorityItems,
      { divider: true },
      ...dateItems,
      { divider: true },
      ...reminderItems,
      ...(subjectItems.length > 0 ? [{ divider: true }, ...subjectItems] : []),
    ];

    createContextMenu(x, y, items, 'task-context-menu');
  }

  function setTaskReminder(taskId, minutes) {
    const task = ctx.tasks.find(t => t.id === taskId);
    if (!task) return;
    const { id, isOwn, isShared, ...clean } = task;
    ctx.saveTask(taskId, { ...clean, reminder: minutes || null }, task.subject);
  }

  function updateTaskPriority(taskId, priority) {
    const task = ctx.tasks.find(t => t.id === taskId);
    if (!task) return;
    const { id, isOwn, isShared, ...clean } = task;
    ctx.saveTask(taskId, { ...clean, priority }, task.subject);
  }

  function moveTaskToSubject(taskId, subjectId) {
    const task = ctx.tasks.find(t => t.id === taskId);
    if (!task) return;
    const { id, isOwn, isShared, ...clean } = task;
    ctx.saveTask(taskId, { ...clean, subject: subjectId || '' }, subjectId || '');
  }

  function setTaskDueDate(taskId, daysFromNow) {
    const task = ctx.tasks.find(t => t.id === taskId);
    if (!task) return;
    const { id, isOwn, isShared, ...clean } = task;
    if (daysFromNow === null) {
      ctx.saveTask(taskId, { ...clean, dueDate: null }, task.subject);
    } else {
      const date = new Date();
      date.setDate(date.getDate() + daysFromNow);
      date.setHours(23, 59, 59, 0);
      ctx.saveTask(taskId, { ...clean, dueDate: date.toISOString() }, task.subject);
    }
  }

  function toggleTaskComplete(taskId) {
    const task = ctx.tasks.find(t => t.id === taskId);
    if (!task) return;
    const nextCompleted = !task.completed;
    if (nextCompleted) {
      const taskEl = document.querySelector(`.task-item[data-id="${taskId}"]`);
      if (taskEl) {
        const rect = taskEl.getBoundingClientRect();
        createConfetti(rect.left + 20, rect.top + rect.height / 2);
      }
      if (ctx.maybeCreateRecurringTask) ctx.maybeCreateRecurringTask(task);
      if (ctx.pushToUndoStack) {
        ctx.pushToUndoStack({ type: 'completeTask', taskId, message: `✅ "${task.title}" הושלם` });
      }
    }
    const { id, isOwn, isShared, ...clean } = task;
    ctx.saveTask(taskId, { ...clean, completed: nextCompleted }, task.subject);
  }

  function duplicateTask(taskId) {
    const task = ctx.tasks.find(t => t.id === taskId);
    if (task) ctx.pushTaskClone(task);
  }

  function deleteTaskById(taskId) {
    const task = ctx.tasks.find(t => t.id === taskId);
    if (task) ctx.removeTask(task);
  }

  // Calendar Day Context Menu
  function showCalendarDayContextMenu(x, y, dateStr) {
    const items = [
      { icon: '✅', label: 'הוסף משימה ליום זה', action: () => addTaskToDate(dateStr) },
      { icon: '📅', label: 'הוסף אירוע ליום זה', action: () => addEventToDate(dateStr) },
      { divider: true },
      { icon: '📋', label: 'הצג פרטי יום', action: () => openDayDrawerForDate(dateStr) },
    ];
    createContextMenu(x, y, items, 'calendar-day-context-menu');
  }

  function addTaskToDate(dateStr) {
    if (ctx.showView) ctx.showView('tasks');
    setTimeout(() => {
      if (ctx.newTaskDue) {
        ctx.newTaskDue.value = dateStr + 'T23:59';
      }
      ctx.newTaskTitle?.focus();
    }, 100);
  }

  function addEventToDate(dateStr) {
    if (ctx.showView) ctx.showView('countdown');
    setTimeout(() => {
      if (ctx.eventDate) {
        ctx.eventDate.value = dateStr + 'T12:00';
      }
      ctx.eventName?.focus();
    }, 100);
  }

  function openDayDrawerForDate(dateStr) {
    const date = new Date(dateStr);
    if (ctx.openDayDrawer) ctx.openDayDrawer(date);
  }

  // Header/Logo Context Menu
  function showHeaderContextMenu(x, y) {
    const items = [
      { icon: '⌨️', label: 'קיצורי מקלדת', shortcut: 'H', action: () => ctx.openShortcuts() },
      { icon: '❓', label: 'מדריך ועזרה', shortcut: 'H', action: () => ctx.openGuide() },
      { divider: true },
      { icon: '🌙', label: 'מצב כהה/בהיר', shortcut: 'D', action: () => ctx.toggleTheme() },
      { icon: '🔍', label: 'פלטת פקודות', shortcut: '⌘K', action: () => ctx.openCommandPalette() },
      { divider: true },
      { icon: '📅', label: 'עבור להיום', shortcut: 'T', action: () => ctx.goToToday() },
      { icon: '🍅', label: 'פתח פומודורו', shortcut: 'P', action: () => ctx.openPomodoro() },
      { icon: '✅', label: 'פתח משימות', shortcut: 'M', action: () => ctx.showView('tasks') },
    ];
    createContextMenu(x, y, items, 'header-context-menu');
  }

  // Countdown View Context Menu
  function showCountdownContextMenu(x, y) {
    const items = [
      { icon: '📅', label: 'הוסף אירוע חדש', action: () => { ctx.eventName?.focus(); } },
      { icon: '📅', label: 'אירוע למחר', action: () => addEventToDate(getTomorrowDateStr()) },
      { icon: '📅', label: 'אירוע לשבוע הבא', action: () => addEventToDate(getNextWeekDateStr()) },
      { divider: true },
      { icon: '✅', label: 'פתח משימות', shortcut: 'M', action: () => ctx.showView('tasks') },
      { icon: '🍅', label: 'פתח פומודורו', shortcut: 'P', action: () => ctx.openPomodoro() },
      { divider: true },
      { icon: '⌨️', label: 'קיצורי מקלדת', shortcut: 'H', action: () => ctx.openShortcuts() },
      { icon: '❓', label: 'מדריך ועזרה', shortcut: 'H', action: () => ctx.openGuide() },
    ];
    createContextMenu(x, y, items, 'countdown-context-menu');
  }

  // Sidebar Context Menu
  function showSidebarContextMenu(x, y) {
    const items = [
      { icon: '📁', label: 'נושא חדש', action: () => { if (ctx.openSubjectModal) ctx.openSubjectModal(); } },
      { divider: true },
      { icon: '📋', label: 'הכל', action: () => { ctx.currentSmartView = null; ctx.currentSubject = null; if (ctx.renderTasks) ctx.renderTasks(); } },
      { icon: '📅', label: 'היום', action: () => { ctx.currentSmartView = 'today'; ctx.currentSubject = null; if (ctx.renderTasks) ctx.renderTasks(); } },
      { icon: '📆', label: 'מחר', action: () => { ctx.currentSmartView = 'tomorrow'; ctx.currentSubject = null; if (ctx.renderTasks) ctx.renderTasks(); } },
      { icon: '📅', label: 'השבוע', action: () => { ctx.currentSmartView = 'week'; ctx.currentSubject = null; if (ctx.renderTasks) ctx.renderTasks(); } },
      { divider: true },
      { icon: '✅', label: 'הושלמו', action: () => { ctx.currentSmartView = 'completed'; ctx.currentSubject = null; if (ctx.renderTasks) ctx.renderTasks(); } },
    ];
    createContextMenu(x, y, items, 'sidebar-context-menu');
  }

  // Pomodoro Area Context Menu
  function showPomodoroContextMenu(x, y) {
    const items = [
      { icon: '▶️', label: 'התחל/המשך', action: () => { if (ctx.Pomodoro?.toggle) ctx.Pomodoro.toggle(); } },
      { icon: '🔄', label: 'אפס טיימר', action: () => { if (ctx.Pomodoro?.reset) ctx.Pomodoro.reset(); } },
      { divider: true },
      { icon: '✅', label: 'פתח משימות', action: () => ctx.showView('tasks') },
      { icon: '📅', label: 'פתח אירועים', action: () => ctx.showView('countdown') },
      { divider: true },
      { icon: '❌', label: 'סגור פומודורו', action: () => ctx.closePomodoro() },
    ];
    createContextMenu(x, y, items, 'pomodoro-context-menu');
  }

  // Helper functions for dates
  function getTomorrowDateStr() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }

  function getNextWeekDateStr() {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  }

  // Attach context menus to various areas
  document.addEventListener('contextmenu', (e) => {
    if (e.shiftKey) return;

    const taskItem = e.target.closest('.task-item');
    if (taskItem) {
      e.preventDefault();
      const taskId = taskItem.dataset.id;
      if (taskId) showTaskContextMenu(e.clientX, e.clientY, taskId);
      return;
    }

    const calendarDay = e.target.closest('.calendar-day');
    if (calendarDay && calendarDay.dataset.date) {
      e.preventDefault();
      showCalendarDayContextMenu(e.clientX, e.clientY, calendarDay.dataset.date);
      return;
    }

    const header = e.target.closest('.header, .app-title');
    if (header) {
      e.preventDefault();
      showHeaderContextMenu(e.clientX, e.clientY);
      return;
    }

    const pomodoroOverlay = e.target.closest('#pomodoroOverlay');
    if (pomodoroOverlay && pomodoroOverlay.classList.contains('open')) {
      e.preventDefault();
      showPomodoroContextMenu(e.clientX, e.clientY);
      return;
    }

    const sidebar = e.target.closest('.subjects-sidebar, .task-sidebar');
    if (sidebar && !e.target.closest('.subject-list-header') && !e.target.closest('.subject-child-item')) {
      e.preventDefault();
      showSidebarContextMenu(e.clientX, e.clientY);
      return;
    }

    if (e.target.closest('.event-row')) return;

    const inTaskView = $("taskManagerOverlay")?.classList.contains('open');
    if (!inTaskView) {
      const mainContent = e.target.closest('.main-content');
      if (['INPUT', 'TEXTAREA', 'BUTTON', 'A', 'SELECT', 'LABEL'].includes(e.target.tagName)) return;

      if (mainContent && !e.target.closest('.event-list') && !e.target.closest('.empty-state')) {
        e.preventDefault();
        showCountdownContextMenu(e.clientX, e.clientY);
        return;
      }
    }

    const taskContent = e.target.closest('.task-list-container, .task-content');
    if (taskContent && inTaskView) {
      e.preventDefault();
      showQuickAddContextMenu(e.clientX, e.clientY, true);
      return;
    }
  });

  function showQuickAddContextMenu(x, y, isTaskView) {
    const items = [
      { icon: '✅', label: 'משימה חדשה', shortcut: 'N', action: () => { if (ctx.showView) ctx.showView('tasks'); setTimeout(() => ctx.newTaskTitle?.focus(), 100); } },
      { icon: '📅', label: 'אירוע חדש', shortcut: 'G', action: () => { if (ctx.showView) ctx.showView('countdown'); setTimeout(() => ctx.eventName?.focus(), 100); } },
      { divider: true },
      { icon: '🍅', label: 'פתח פומודורו', shortcut: 'P', action: () => ctx.openPomodoro() },
      { icon: '📅', label: 'עבור להיום', shortcut: 'T', action: () => ctx.goToToday() },
      { divider: true },
      { icon: '⌨️', label: 'קיצורי מקלדת', shortcut: 'H', action: () => ctx.openShortcuts() },
      { icon: '❓', label: 'מדריך ועזרה', shortcut: 'H', action: () => ctx.openGuide() },
    ];
    createContextMenu(x, y, items, 'quick-add-context-menu');
  }
}
