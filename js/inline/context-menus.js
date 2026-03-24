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
        h.innerHTML = item.header;
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

  // Expose for use by other modules (e.g., daily planner)
  ctx.createContextMenu = createContextMenu;

  // Task Context Menu
  function showTaskContextMenu(x, y, taskId) {
    const task = ctx.tasks.find(t => t.id === taskId);
    if (!task) return;

    const priorityItems = [
      { header: '<span class="icon" style="font-size:16px;vertical-align:middle">bolt</span> עדיפות' },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">circle</span>', label: 'דחוף', action: () => updateTaskPriority(taskId, 'urgent') },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">circle</span>', label: 'גבוה', action: () => updateTaskPriority(taskId, 'high') },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">circle</span>', label: 'בינוני', action: () => updateTaskPriority(taskId, 'medium') },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">circle</span>', label: 'נמוך', action: () => updateTaskPriority(taskId, 'low') },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">check_box_outline_blank</span>', label: 'ללא', action: () => updateTaskPriority(taskId, 'none') },
    ];

    const subjects = ctx.subjects;
    const subjectItems = subjects.length > 0 ? [
      { header: '<span class="icon" style="font-size:16px;vertical-align:middle">folder</span> העבר לנושא' },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">folder</span>', label: 'ללא נושא', action: () => moveTaskToSubject(taskId, null) },
      ...subjects.slice(0, 5).map(s => ({
        icon: '<span class="icon" style="font-size:16px;vertical-align:middle">folder</span>', label: s.name, action: () => moveTaskToSubject(taskId, s.id)
      }))
    ] : [];

    const dateItems = [
      { header: '<span class="icon" style="font-size:16px;vertical-align:middle">event</span> תאריך יעד' },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">date_range</span>', label: 'היום', action: () => setTaskDueDate(taskId, 0) },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">date_range</span>', label: 'מחר', action: () => setTaskDueDate(taskId, 1) },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">date_range</span>', label: 'בעוד שבוע', action: () => setTaskDueDate(taskId, 7) },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">block</span>', label: 'הסר תאריך', action: () => setTaskDueDate(taskId, null) },
    ];

    const reminderItems = [
      { header: '<span class="icon" style="font-size:16px;vertical-align:middle">alarm</span> תזכורת' },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">notifications</span>', label: '10 דקות לפני', action: () => setTaskReminder(taskId, 10) },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">notifications</span>', label: '30 דקות לפני', action: () => setTaskReminder(taskId, 30) },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">notifications</span>', label: 'שעה לפני', action: () => setTaskReminder(taskId, 60) },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">notifications</span>', label: 'יום לפני', action: () => setTaskReminder(taskId, 1440) },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">notifications_off</span>', label: 'ללא תזכורת', action: () => setTaskReminder(taskId, 0) },
    ];

    const items = [
      { icon: task.completed ? '<span class="icon" style="font-size:16px;vertical-align:middle">check_box_outline_blank</span>' : '<span class="icon" style="font-size:16px;vertical-align:middle">check_circle</span>', label: task.completed ? 'סמן כלא הושלם' : 'סמן כהושלם', shortcut: 'X', action: () => toggleTaskComplete(taskId) },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">edit</span>', label: 'עריכה', shortcut: 'Enter', action: () => ctx.openTaskEditModal(taskId) },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">content_copy</span>', label: 'שכפל', action: () => duplicateTask(taskId) },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">delete</span>', label: 'מחק', action: () => deleteTaskById(taskId) },
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
        ctx.pushToUndoStack({ type: 'completeTask', taskId, message: `<span class="icon" style="font-size:16px;vertical-align:middle">check_circle</span> "${task.title}" הושלם` });
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
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">check_circle</span>', label: 'הוסף משימה ליום זה', action: () => addTaskToDate(dateStr) },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">event</span>', label: 'הוסף אירוע ליום זה', action: () => addEventToDate(dateStr) },
      { divider: true },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">list_alt</span>', label: 'הצג פרטי יום', action: () => openDayDrawerForDate(dateStr) },
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
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">keyboard</span>', label: 'קיצורי מקלדת', shortcut: 'H', action: () => ctx.openShortcuts() },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">help</span>', label: 'מדריך ועזרה', shortcut: 'H', action: () => ctx.openGuide() },
      { divider: true },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">dark_mode</span>', label: 'מצב כהה/בהיר', shortcut: 'D', action: () => ctx.toggleTheme() },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">search</span>', label: 'פלטת פקודות', shortcut: '⌘K', action: () => ctx.openCommandPalette() },
      { divider: true },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">event</span>', label: 'עבור להיום', shortcut: 'T', action: () => ctx.goToToday() },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">timelapse</span>', label: 'פתח פומודורו', shortcut: 'P', action: () => ctx.openPomodoro() },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">check_circle</span>', label: 'פתח משימות', shortcut: 'M', action: () => ctx.showView('tasks') },
    ];
    createContextMenu(x, y, items, 'header-context-menu');
  }

  // Countdown View Context Menu
  function showCountdownContextMenu(x, y) {
    const items = [
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">event</span>', label: 'הוסף אירוע חדש', action: () => { ctx.eventName?.focus(); } },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">event</span>', label: 'אירוע למחר', action: () => addEventToDate(getTomorrowDateStr()) },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">event</span>', label: 'אירוע לשבוע הבא', action: () => addEventToDate(getNextWeekDateStr()) },
      { divider: true },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">check_circle</span>', label: 'פתח משימות', shortcut: 'M', action: () => ctx.showView('tasks') },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">timelapse</span>', label: 'פתח פומודורו', shortcut: 'P', action: () => ctx.openPomodoro() },
      { divider: true },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">keyboard</span>', label: 'קיצורי מקלדת', shortcut: 'H', action: () => ctx.openShortcuts() },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">help</span>', label: 'מדריך ועזרה', shortcut: 'H', action: () => ctx.openGuide() },
    ];
    createContextMenu(x, y, items, 'countdown-context-menu');
  }

  // Sidebar Context Menu
  function showSidebarContextMenu(x, y) {
    const items = [
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">folder</span>', label: 'נושא חדש', action: () => { if (ctx.openSubjectModal) ctx.openSubjectModal(); } },
      { divider: true },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">list_alt</span>', label: 'הכל', action: () => { ctx.currentSmartView = null; ctx.currentSubject = null; if (ctx.renderTasks) ctx.renderTasks(); } },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">event</span>', label: 'היום', action: () => { ctx.currentSmartView = 'today'; ctx.currentSubject = null; if (ctx.renderTasks) ctx.renderTasks(); } },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">date_range</span>', label: 'מחר', action: () => { ctx.currentSmartView = 'tomorrow'; ctx.currentSubject = null; if (ctx.renderTasks) ctx.renderTasks(); } },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">event</span>', label: 'השבוע', action: () => { ctx.currentSmartView = 'week'; ctx.currentSubject = null; if (ctx.renderTasks) ctx.renderTasks(); } },
      { divider: true },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">check_circle</span>', label: 'הושלמו', action: () => { ctx.currentSmartView = 'completed'; ctx.currentSubject = null; if (ctx.renderTasks) ctx.renderTasks(); } },
    ];
    createContextMenu(x, y, items, 'sidebar-context-menu');
  }

  // Pomodoro Area Context Menu
  function showPomodoroContextMenu(x, y) {
    const items = [
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">play_arrow</span>', label: 'התחל/המשך', action: () => { if (ctx.Pomodoro?.toggle) ctx.Pomodoro.toggle(); } },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">sync</span>', label: 'אפס טיימר', action: () => { if (ctx.Pomodoro?.reset) ctx.Pomodoro.reset(); } },
      { divider: true },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">check_circle</span>', label: 'פתח משימות', action: () => ctx.showView('tasks') },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">event</span>', label: 'פתח אירועים', action: () => ctx.showView('countdown') },
      { divider: true },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">close</span>', label: 'סגור פומודורו', action: () => ctx.closePomodoro() },
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
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">check_circle</span>', label: 'משימה חדשה', shortcut: 'N', action: () => { if (ctx.showView) ctx.showView('tasks'); setTimeout(() => ctx.newTaskTitle?.focus(), 100); } },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">event</span>', label: 'אירוע חדש', shortcut: 'G', action: () => { if (ctx.showView) ctx.showView('countdown'); setTimeout(() => ctx.eventName?.focus(), 100); } },
      { divider: true },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">timelapse</span>', label: 'פתח פומודורו', shortcut: 'P', action: () => ctx.openPomodoro() },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">event</span>', label: 'עבור להיום', shortcut: 'T', action: () => ctx.goToToday() },
      { divider: true },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">keyboard</span>', label: 'קיצורי מקלדת', shortcut: 'H', action: () => ctx.openShortcuts() },
      { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">help</span>', label: 'מדריך ועזרה', shortcut: 'H', action: () => ctx.openGuide() },
    ];
    createContextMenu(x, y, items, 'quick-add-context-menu');
  }
}
