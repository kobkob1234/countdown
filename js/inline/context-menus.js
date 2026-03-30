// ============ CONTEXT MENUS ============
import { ctx } from '../context.js';
import { createConfetti } from './confetti.js';

const $ = id => document.getElementById(id);

export function initContextMenus() {
  // Helper to create context menu with optional submenu support
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
        h.innerHTML = item.header;
        menu.appendChild(h);
        return;
      }
      // Expandable submenu group
      if (item.submenu) {
        const trigger = document.createElement('div');
        trigger.className = 'context-menu-item context-menu-submenu-trigger';
        trigger.innerHTML = `<span class="context-menu-item-icon">${item.icon}</span><span style="flex:1">${item.label}</span><span class="context-menu-item-arrow"><span class="icon" style="font-size:14px">chevron_left</span></span>`;
        const subWrap = document.createElement('div');
        subWrap.className = 'context-menu-submenu-panel';
        subWrap.style.display = 'none';
        item.submenu.forEach(sub => {
          if (sub.divider) {
            const d = document.createElement('div');
            d.className = 'context-menu-divider';
            subWrap.appendChild(d);
            return;
          }
          const subEl = document.createElement('div');
          subEl.className = 'context-menu-item context-menu-subitem';
          subEl.innerHTML = `<span class="context-menu-item-icon">${sub.icon || ''}</span>${sub.label}`;
          if (sub.active) subEl.classList.add('active');
          subEl.onclick = () => { menu.remove(); sub.action(); };
          subWrap.appendChild(subEl);
        });
        trigger.onclick = (e) => {
          e.stopPropagation();
          const isOpen = subWrap.style.display !== 'none';
          // Close all other submenus
          menu.querySelectorAll('.context-menu-submenu-panel').forEach(p => { p.style.display = 'none'; p.previousElementSibling?.classList.remove('expanded'); });
          if (!isOpen) {
            subWrap.style.display = '';
            trigger.classList.add('expanded');
          }
        };
        menu.appendChild(trigger);
        menu.appendChild(subWrap);
        return;
      }
      const el = document.createElement('div');
      el.className = `context-menu-item ${item.danger ? 'danger' : ''}`;
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
    if (rect.left < 0) menu.style.left = '10px';

    // Attach close handler synchronously — the contextmenu event that opened the menu
    // has already bubbled past, so this won't immediately close the menu.
    const closeHandler = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeHandler);
        document.removeEventListener('contextmenu', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
    document.addEventListener('contextmenu', closeHandler);

    return menu;
  }

  // Shared subtle toast helper (auto-dismissing, no action button)
  function showSubtleToast(message, durationMs = 3000) {
    const existing = document.querySelector('.subtle-info-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'subtle-info-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('visible'));

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, durationMs);
  }

  // Expose for use by other modules (e.g., daily planner, exam-mode)
  ctx.createContextMenu = createContextMenu;
  ctx.showSubtleToast = showSubtleToast;
  window.showSubtleToast = showSubtleToast;

  // ============================================
  // Icon helper (shorter)
  // ============================================
  const I = name => `<span class="icon" style="font-size:16px;vertical-align:middle">${name}</span>`;

  // ============================================
  // TASK CONTEXT MENU (compact with submenus)
  // ============================================
  function showTaskContextMenu(x, y, taskId) {
    const task = ctx.tasks.find(t => t.id === taskId);
    if (!task) return;

    // Current priority indicator
    const priorityLabels = { urgent: 'דחוף', high: 'גבוה', medium: 'בינוני', low: 'נמוך', none: 'ללא' };
    const priorityDots = { urgent: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e', none: '#9ca3af' };
    const currentPriority = task.priority || 'none';

    const prioritySub = ['urgent', 'high', 'medium', 'low', 'none'].map(p => ({
      icon: `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${priorityDots[p]};vertical-align:middle"></span>`,
      label: priorityLabels[p],
      active: currentPriority === p,
      action: () => updateTaskPriority(taskId, p)
    }));

    // Date submenu
    const dateSub = [
      { icon: I('today'), label: 'היום', action: () => setTaskDueDate(taskId, 0) },
      { icon: I('event'), label: 'מחר', action: () => setTaskDueDate(taskId, 1) },
      { icon: I('date_range'), label: 'בעוד שבוע', action: () => setTaskDueDate(taskId, 7) },
      { divider: true },
      { icon: I('block'), label: 'הסר תאריך', action: () => setTaskDueDate(taskId, null) },
    ];

    // Reminder submenu
    const reminderSub = [
      { icon: I('notifications'), label: '10 דקות לפני', action: () => setTaskReminder(taskId, 10) },
      { icon: I('notifications'), label: '30 דקות לפני', action: () => setTaskReminder(taskId, 30) },
      { icon: I('notifications'), label: 'שעה לפני', action: () => setTaskReminder(taskId, 60) },
      { icon: I('notifications'), label: 'יום לפני', action: () => setTaskReminder(taskId, 1440) },
      { divider: true },
      { icon: I('notifications_off'), label: 'ללא תזכורת', action: () => setTaskReminder(taskId, 0) },
    ];

    // Subject submenu
    const subjects = ctx.subjects;
    const subjectSub = subjects.length > 0 ? [
      { icon: I('folder_off'), label: 'ללא נושא', active: !task.subject, action: () => moveTaskToSubject(taskId, null) },
      ...subjects.slice(0, 8).map(s => ({
        icon: `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.color || '#667eea'};vertical-align:middle"></span>`,
        label: s.name,
        active: task.subject === s.id,
        action: () => moveTaskToSubject(taskId, s.id)
      }))
    ] : [];

    // Build items — core actions first, then collapsible groups
    const items = [
      { icon: task.completed ? I('undo') : I('check_circle'), label: task.completed ? 'בטל השלמה' : 'סמן כהושלם', shortcut: 'X', action: () => toggleTaskComplete(taskId) },
      { icon: I('edit'), label: 'ערוך', shortcut: 'Enter', action: () => ctx.openTaskEditModal(taskId) },
      { icon: I('content_copy'), label: 'שכפל', action: () => duplicateTask(taskId) },
      { divider: true },
      { icon: `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${priorityDots[currentPriority]};vertical-align:middle"></span>`, label: 'עדיפות', submenu: prioritySub },
      { icon: I('event'), label: 'תאריך יעד', submenu: dateSub },
      { icon: I('alarm'), label: 'תזכורת', submenu: reminderSub },
      ...(subjectSub.length > 0 ? [{ icon: I('folder'), label: 'העבר לנושא', submenu: subjectSub }] : []),
    ];

    // Cross-system integrations
    const crossItems = [];
    if (window.addChipToExamCell) {
      crossItems.push({ icon: I('school'), label: 'הוסף ללוח בחינות', action: () => addTaskToExamCalendar(taskId) });
    }
    if (window.DailyPlanner?.addPlannerBlock && task.dueDate) {
      crossItems.push({ icon: I('event_note'), label: 'הוסף למתכנן היומי', action: () => addTaskToPlanner(taskId) });
    }
    if (crossItems.length > 0) {
      items.push({ divider: true });
      items.push(...crossItems);
    }

    // Delete at the end
    items.push({ divider: true });
    items.push({ icon: I('delete'), label: 'מחק', danger: true, action: () => deleteTaskById(taskId) });

    createContextMenu(x, y, items, 'task-context-menu');
  }

  // ============================================
  // Task action helpers
  // ============================================
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
    // Always normalize to null (not '') for "no subject" to keep Firebase paths consistent
    const normalized = subjectId || null;
    ctx.saveTask(taskId, { ...clean, subject: normalized }, normalized || '');
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
        ctx.pushToUndoStack({ type: 'completeTask', taskId, message: `${I('check_circle')} "${task.title}" הושלם` });
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

  function addTaskToExamCalendar(taskId) {
    const task = ctx.tasks.find(t => t.id === taskId);
    if (!task || !window.addChipToExamCell) return;
    if (!task.dueDate) {
      showSubtleToast('למשימה אין תאריך יעד');
      return;
    }
    const dateObj = new Date(task.dueDate);
    if (Number.isNaN(dateObj.getTime())) {
      showSubtleToast('תאריך לא תקין');
      return;
    }
    const subject = ctx.subjects?.find(s => s.id === task.subject);
    const color = subject?.color || '#667eea';
    const success = window.addChipToExamCell(dateObj, task.title, color);
    if (success === false) {
      showSubtleToast('התאריך לא בטווח תקופת הבחינות');
    } else {
      showSubtleToast('נוסף ללוח הבחינות');
    }
  }

  function addTaskToPlanner(taskId) {
    const task = ctx.tasks.find(t => t.id === taskId);
    if (!task || !window.DailyPlanner?.addPlannerBlock) return;
    const dateObj = task.dueDate ? new Date(task.dueDate) : new Date();
    const dateKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    const subject = ctx.subjects?.find(s => s.id === task.subject);
    window.DailyPlanner.addPlannerBlock({
      title: task.title,
      date: dateKey,
      duration: task.duration || 60,
      color: subject?.color || '',
      priority: task.priority || 'medium'
    });
    showSubtleToast('נוסף למתכנן היומי');
  }

  // ============================================
  // CALENDAR DAY CONTEXT MENU
  // ============================================
  function showCalendarDayContextMenu(x, y, dateStr) {
    const items = [
      { icon: I('check_circle'), label: 'הוסף משימה ליום זה', action: () => addTaskToDate(dateStr) },
      { icon: I('event'), label: 'הוסף אירוע ליום זה', action: () => addEventToDate(dateStr) },
      { divider: true },
      { icon: I('list_alt'), label: 'הצג פרטי יום', action: () => openDayDrawerForDate(dateStr) },
    ];
    createContextMenu(x, y, items, 'calendar-day-context-menu');
  }

  function addTaskToDate(dateStr) {
    if (ctx.showView) ctx.showView('tasks');
    setTimeout(() => {
      if (ctx.newTaskDue) ctx.newTaskDue.value = dateStr + 'T23:59';
      ctx.newTaskTitle?.focus();
    }, 100);
  }

  function addEventToDate(dateStr) {
    if (ctx.showView) ctx.showView('countdown');
    setTimeout(() => {
      if (ctx.eventDate) ctx.eventDate.value = dateStr + 'T12:00';
      ctx.eventName?.focus();
    }, 100);
  }

  function openDayDrawerForDate(dateStr) {
    const date = new Date(dateStr);
    if (ctx.openDayDrawer) ctx.openDayDrawer(date);
  }

  // ============================================
  // HEADER CONTEXT MENU
  // ============================================
  function showHeaderContextMenu(x, y) {
    const items = [
      { icon: I('dark_mode'), label: 'מצב כהה/בהיר', shortcut: 'D', action: () => ctx.toggleTheme() },
      { icon: I('search'), label: 'פלטת פקודות', shortcut: '⌘K', action: () => ctx.openCommandPalette() },
      { divider: true },
      { icon: I('event'), label: 'עבור להיום', shortcut: 'T', action: () => ctx.goToToday() },
      { icon: I('timelapse'), label: 'פומודורו', shortcut: 'P', action: () => ctx.openPomodoro() },
      { icon: I('check_circle'), label: 'משימות', shortcut: 'M', action: () => ctx.showView('tasks') },
      { divider: true },
      { icon: I('keyboard'), label: 'קיצורי מקלדת', shortcut: 'H', action: () => ctx.openShortcuts() },
    ];
    createContextMenu(x, y, items, 'header-context-menu');
  }

  // ============================================
  // COUNTDOWN VIEW CONTEXT MENU
  // ============================================
  function showCountdownContextMenu(x, y) {
    const items = [
      { icon: I('add_circle'), label: 'אירוע חדש', action: () => { ctx.eventName?.focus(); } },
      { icon: I('event'), label: 'אירוע למחר', action: () => addEventToDate(getTomorrowDateStr()) },
      { icon: I('date_range'), label: 'אירוע לשבוע הבא', action: () => addEventToDate(getNextWeekDateStr()) },
      { divider: true },
      { icon: I('check_circle'), label: 'משימות', shortcut: 'M', action: () => ctx.showView('tasks') },
      { icon: I('timelapse'), label: 'פומודורו', shortcut: 'P', action: () => ctx.openPomodoro() },
    ];
    createContextMenu(x, y, items, 'countdown-context-menu');
  }

  // ============================================
  // SIDEBAR CONTEXT MENU
  // ============================================
  function showSidebarContextMenu(x, y) {
    const items = [
      { icon: I('folder'), label: 'נושא חדש', action: () => { if (ctx.openSubjectModal) ctx.openSubjectModal(); } },
      { divider: true },
      { icon: I('list_alt'), label: 'הכל', action: () => { ctx.currentSmartView = null; ctx.currentSubject = null; if (ctx.renderTasks) ctx.renderTasks(); } },
      { icon: I('today'), label: 'היום', action: () => { ctx.currentSmartView = 'today'; ctx.currentSubject = null; if (ctx.renderTasks) ctx.renderTasks(); } },
      { icon: I('event'), label: 'מחר', action: () => { ctx.currentSmartView = 'tomorrow'; ctx.currentSubject = null; if (ctx.renderTasks) ctx.renderTasks(); } },
      { icon: I('date_range'), label: 'השבוע', action: () => { ctx.currentSmartView = 'week'; ctx.currentSubject = null; if (ctx.renderTasks) ctx.renderTasks(); } },
      { divider: true },
      { icon: I('check_circle'), label: 'הושלמו', action: () => { ctx.currentSmartView = 'completed'; ctx.currentSubject = null; if (ctx.renderTasks) ctx.renderTasks(); } },
    ];
    createContextMenu(x, y, items, 'sidebar-context-menu');
  }

  // ============================================
  // POMODORO CONTEXT MENU
  // ============================================
  function showPomodoroContextMenu(x, y) {
    const items = [
      { icon: I('play_arrow'), label: 'התחל/המשך', action: () => { if (ctx.Pomodoro?.toggle) ctx.Pomodoro.toggle(); } },
      { icon: I('sync'), label: 'אפס טיימר', action: () => { if (ctx.Pomodoro?.reset) ctx.Pomodoro.reset(); } },
      { divider: true },
      { icon: I('check_circle'), label: 'משימות', action: () => ctx.showView('tasks') },
      { icon: I('event'), label: 'אירועים', action: () => ctx.showView('countdown') },
      { divider: true },
      { icon: I('close'), label: 'סגור פומודורו', danger: true, action: () => ctx.closePomodoro() },
    ];
    createContextMenu(x, y, items, 'pomodoro-context-menu');
  }

  // ============================================
  // DAILY PLANNER CONTEXT MENU (right-click on empty area)
  // ============================================
  function showPlannerContextMenu(x, y) {
    const items = [
      { icon: I('add_circle'), label: 'הוסף פעילות', action: () => {
        // Click the current hour slot to open add modal
        const timeline = $('plannerTimeline');
        if (timeline) {
          const now = new Date();
          const hourRow = timeline.querySelector(`.planner-hour-row[data-hour="${now.getHours()}"] .planner-hour-content`);
          if (hourRow) hourRow.click();
        }
      }},
      { icon: I('sync'), label: 'סנכרן הכל ליום', action: () => {
        const btn = $('plannerSyncAllBtn');
        if (btn) btn.click();
      }},
      { divider: true },
      { icon: I('my_location'), label: 'גלול להשעה הנוכחית', action: () => {
        const timeline = $('plannerTimeline');
        if (timeline) {
          const now = new Date();
          const row = timeline.querySelector(`.planner-hour-row[data-hour="${Math.max(6, now.getHours() - 1)}"]`);
          if (row) {
            const content = timeline.closest('.planner-content');
            if (content) content.scrollTop = row.offsetTop - 40;
          }
        }
      }},
      { icon: I('view_day'), label: 'תצוגת יום', action: () => {
        const btn = document.querySelector('.planner-view-toggle button[data-view="day"]');
        if (btn) btn.click();
      }},
      { icon: I('view_week'), label: 'תצוגת שבוע', action: () => {
        const btn = document.querySelector('.planner-view-toggle button[data-view="week"]');
        if (btn) btn.click();
      }},
      { divider: true },
      { icon: I('check_circle'), label: 'משימות', action: () => ctx.showView('tasks') },
      { icon: I('event'), label: 'אירועים', action: () => ctx.showView('countdown') },
      { icon: I('timelapse'), label: 'פומודורו', action: () => ctx.openPomodoro() },
    ];
    createContextMenu(x, y, items, 'planner-context-menu');
  }

  // ============================================
  // Helper functions
  // ============================================
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

  // ============================================
  // GLOBAL CONTEXTMENU LISTENER
  // ============================================
  document.addEventListener('contextmenu', (e) => {
    if (e.shiftKey) return;

    // Task item
    const taskItem = e.target.closest('.task-item');
    if (taskItem) {
      e.preventDefault();
      const taskId = taskItem.dataset.id;
      if (taskId) showTaskContextMenu(e.clientX, e.clientY, taskId);
      return;
    }

    // Calendar day
    const calendarDay = e.target.closest('.calendar-day');
    if (calendarDay && calendarDay.dataset.date) {
      e.preventDefault();
      showCalendarDayContextMenu(e.clientX, e.clientY, calendarDay.dataset.date);
      return;
    }

    // Header/logo
    const header = e.target.closest('.header, .app-title');
    if (header) {
      e.preventDefault();
      showHeaderContextMenu(e.clientX, e.clientY);
      return;
    }

    // Pomodoro overlay
    const pomodoroOverlay = e.target.closest('#pomodoroOverlay');
    if (pomodoroOverlay && pomodoroOverlay.classList.contains('open')) {
      e.preventDefault();
      showPomodoroContextMenu(e.clientX, e.clientY);
      return;
    }

    // Daily planner overlay (empty areas — not blocks, not sidebar items)
    const plannerOverlay = e.target.closest('#plannerOverlay');
    if (plannerOverlay) {
      // Don't override planner-block, sidebar task/event context menus
      if (e.target.closest('.planner-block, .planner-scheduled-task-item, .planner-task-item, .planner-countdown-item')) return;
      // Don't override inputs
      if (['INPUT', 'TEXTAREA', 'BUTTON', 'A', 'SELECT', 'LABEL'].includes(e.target.tagName)) return;
      e.preventDefault();
      showPlannerContextMenu(e.clientX, e.clientY);
      return;
    }

    // Sidebar
    const sidebar = e.target.closest('.subjects-sidebar, .task-sidebar');
    if (sidebar && !e.target.closest('.subject-list-header') && !e.target.closest('.subject-child-item')) {
      e.preventDefault();
      showSidebarContextMenu(e.clientX, e.clientY);
      return;
    }

    // Event row — don't override
    if (e.target.closest('.event-row')) return;

    // Task view area (empty space)
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
      showQuickAddContextMenu(e.clientX, e.clientY);
      return;
    }
  });

  function showQuickAddContextMenu(x, y) {
    const items = [
      { icon: I('add_circle'), label: 'משימה חדשה', shortcut: 'N', action: () => { if (ctx.showView) ctx.showView('tasks'); setTimeout(() => ctx.newTaskTitle?.focus(), 100); } },
      { icon: I('event'), label: 'אירוע חדש', shortcut: 'G', action: () => { if (ctx.showView) ctx.showView('countdown'); setTimeout(() => ctx.eventName?.focus(), 100); } },
      { divider: true },
      { icon: I('timelapse'), label: 'פומודורו', shortcut: 'P', action: () => ctx.openPomodoro() },
      { icon: I('today'), label: 'עבור להיום', shortcut: 'T', action: () => ctx.goToToday() },
    ];
    createContextMenu(x, y, items, 'quick-add-context-menu');
  }
}
