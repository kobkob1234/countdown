// ============ TASK CALENDAR ============
import { ctx } from '../context.js';

const $ = id => document.getElementById(id);

export function initTaskCalendar() {
  let currentTaskMonth = new Date();
  Object.defineProperty(ctx, 'currentTaskMonth', { get: () => currentTaskMonth, set: (val) => { currentTaskMonth = val; } });
  let taskCalendarExpanded = false;
  let taskCalendarView = 'month';
  let taskCalendarFocusDate = new Date();
  const taskCalendarGrid = $("taskCalendarGrid");
  const taskCalendarTitle = $("taskCalendarTitle");
  const taskMonthEvents = $("taskMonthEvents");
  const taskMonthEventsTitle = $("taskMonthEventsTitle");
  const toggleTaskCalendarSize = $("toggleTaskCalendarSize");
  const taskCalendarViewToggle = $("taskCalendarViewToggle");
  const taskRightSidebar = $("taskRightSidebar");

  // Event delegation for Task calendar in Task Manager
  if (taskCalendarGrid) {
    taskCalendarGrid.addEventListener('click', (e) => {
      const chip = e.target.closest('.calendar-event-chip');
      if (chip) {
        e.stopPropagation();
        const taskId = chip.dataset.taskId;
        if (taskId) {
          const taskRow = document.querySelector(`.task-item[data-id="${taskId}"]`);
          if (taskRow) {
            taskRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            taskRow.style.transition = 'box-shadow 0.3s';
            taskRow.style.boxShadow = '0 0 0 3px var(--accent)';
            setTimeout(() => { taskRow.style.boxShadow = ''; }, 800);
          }
        }
        return;
      }

      const day = e.target.closest('.calendar-day:not(.other-month)');
      if (day) {
        const dateKey = day.dataset.date;
        if (!dateKey) return;
        const focusDate = new Date(`${dateKey}T00:00`);
        if (!Number.isNaN(focusDate.getTime())) {
          setTaskCalendarFocus(focusDate);
        }
        const taskDueInput = $("newTaskDue");
        const taskTitleInput = $("newTaskTitle");
        const quickRow = $("quickAddRow");
        const quickAddTask = $("quickAddTask");
        if (taskDueInput) taskDueInput.value = dateKey + 'T23:59';
        if (taskTitleInput) taskTitleInput.focus();
        if (quickRow) quickRow.style.display = 'flex';
        if (quickAddTask) {
          quickAddTask.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    });
  }

  function getTaskCalendarMaxShow() {
    if (taskCalendarView === 'day') return taskCalendarExpanded ? 15 : 8;
    if (taskCalendarView === 'week') return taskCalendarExpanded ? 8 : 4;
    return taskCalendarExpanded ? 5 : 3;
  }

  function updateTaskCalendarViewToggle() {
    if (!taskCalendarViewToggle) return;
    taskCalendarViewToggle.querySelectorAll('button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === taskCalendarView);
    });
  }

  function updateTaskCalendarViewClasses() {
    if (!taskRightSidebar) return;
    taskRightSidebar.classList.toggle('calendar-view-week', taskCalendarView === 'week');
    taskRightSidebar.classList.toggle('calendar-view-day', taskCalendarView === 'day');
  }

  function setTaskCalendarView(view) {
    const prevView = taskCalendarView;
    taskCalendarView = view;
    if (taskCalendarView === 'month') {
      currentTaskMonth = new Date(taskCalendarFocusDate.getFullYear(), taskCalendarFocusDate.getMonth(), 1);
    } else if (prevView === 'month') {
      const base = new Date(currentTaskMonth.getFullYear(), currentTaskMonth.getMonth(), taskCalendarFocusDate.getDate() || 1);
      setTaskCalendarFocus(base);
    }
    updateTaskCalendarViewToggle();
    updateTaskCalendarViewClasses();
    renderTaskCalendar();
  }

  function setTaskCalendarFocus(date) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return;
    d.setHours(0, 0, 0, 0);
    taskCalendarFocusDate = d;
  }

  function getStartOfWeek(date) {
    const d = new Date(date);
    const dayIndex = d.getDay();
    d.setDate(d.getDate() - dayIndex);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function formatHebrewShortDate(date) {
    return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  }
  Object.assign(ctx, { getStartOfWeek, formatHebrewShortDate });

  function renderTaskCalendar() {
    if (!taskCalendarGrid || !taskCalendarTitle) return;

    const { tasks, subjects, toDateKey, escapeHtml, HEBREW_MONTHS, HEBREW_DAYS, resolveTaskColor } = ctx;

    updateTaskCalendarViewToggle();
    updateTaskCalendarViewClasses();

    const today = new Date();
    const todayKey = toDateKey(today);

    const tasksByDate = {};
    tasks.forEach(task => {
      if (!task.dueDate) return;
      if (task.isCountdown || task.isEvent) return;
      const key = toDateKey(task.dueDate);
      if (!tasksByDate[key]) tasksByDate[key] = [];
      tasksByDate[key].push(task);
    });

    let html = '';
    const maxShow = getTaskCalendarMaxShow();

    if (taskCalendarView === 'month') {
      const year = currentTaskMonth.getFullYear();
      const month = currentTaskMonth.getMonth();
      taskCalendarTitle.textContent = `${HEBREW_MONTHS[month]} ${year}`;

      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const startDay = firstDay.getDay();
      const daysInMonth = lastDay.getDate();

      for (let i = 0; i < 7; i++) {
        html += `<div class="calendar-day-name">${HEBREW_DAYS[i]}</div>`;
      }

      const prevMonth = new Date(year, month, 0);
      const prevDays = prevMonth.getDate();
      for (let i = startDay - 1; i >= 0; i--) {
        const day = prevDays - i;
        html += `<div class="calendar-day other-month"><div class="calendar-day-number">${day}</div></div>`;
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = dateKey === todayKey;
        const dayTasks = tasksByDate[dateKey] || [];
        let classes = 'calendar-day';
        if (isToday) classes += ' today';

        let eventsHtml = '<div class="calendar-day-events">';
        const showTime = dayTasks.length > 1;
        dayTasks.slice(0, maxShow).forEach(task => {
          const subjectColor = subjects.find(s => s.id === task.subject)?.color;
          const resolvedColor = resolveTaskColor(task, subjectColor);
          const color = resolvedColor || subjectColor || '#667eea';
          const safeName = escapeHtml(task.title);
          const evtDate = new Date(task.dueDate);
          const timeStr = showTime ? `${String(evtDate.getHours()).padStart(2, '0')}:${String(evtDate.getMinutes()).padStart(2, '0')} ` : '';
          const displayText = timeStr + safeName;
          eventsHtml += `<div class="calendar-event-chip" style="background: ${color}" title="${safeName}" aria-label="${safeName}" data-task-id="${task.id}">${displayText}</div>`;
        });
        if (dayTasks.length > maxShow) {
          eventsHtml += `<div class="calendar-more">+${dayTasks.length - maxShow} עוד</div>`;
        }
        eventsHtml += '</div>';

        html += `<div class="${classes}" data-date="${dateKey}">
        <div class="calendar-day-number">${day}</div>
        ${eventsHtml}
      </div>`;
      }

      const totalCells = startDay + daysInMonth;
      const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
      for (let i = 1; i <= remainingCells; i++) {
        html += `<div class="calendar-day other-month"><div class="calendar-day-number">${i}</div></div>`;
      }
    } else if (taskCalendarView === 'week') {
      const focus = taskCalendarFocusDate || new Date();
      const start = getStartOfWeek(focus);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      taskCalendarTitle.textContent = `שבוע ${formatHebrewShortDate(start)} - ${formatHebrewShortDate(end)}`;

      for (let i = 0; i < 7; i++) {
        const dayDate = new Date(start);
        dayDate.setDate(start.getDate() + i);
        html += `<div class="calendar-day-name">${HEBREW_DAYS[dayDate.getDay()]}</div>`;
      }

      for (let i = 0; i < 7; i++) {
        const dayDate = new Date(start);
        dayDate.setDate(start.getDate() + i);
        const dateKey = toDateKey(dayDate);
        const dayTasks = tasksByDate[dateKey] || [];
        const isToday = dateKey === todayKey;
        const isOtherMonth = dayDate.getMonth() !== focus.getMonth();
        let classes = 'calendar-day';
        if (isToday) classes += ' today';
        if (isOtherMonth) classes += ' other-month';

        let eventsHtml = '<div class="calendar-day-events">';
        const showTime = true;
        dayTasks.slice(0, maxShow).forEach(task => {
          const subjectColor = subjects.find(s => s.id === task.subject)?.color;
          const resolvedColor = resolveTaskColor(task, subjectColor);
          const color = resolvedColor || subjectColor || '#667eea';
          const safeName = escapeHtml(task.title);
          const evtDate = new Date(task.dueDate);
          const timeStr = showTime ? `${String(evtDate.getHours()).padStart(2, '0')}:${String(evtDate.getMinutes()).padStart(2, '0')} ` : '';
          const displayText = timeStr + safeName;
          eventsHtml += `<div class="calendar-event-chip" style="background: ${color}" title="${safeName}" aria-label="${safeName}" data-task-id="${task.id}">${displayText}</div>`;
        });
        if (dayTasks.length > maxShow) {
          eventsHtml += `<div class="calendar-more">+${dayTasks.length - maxShow} עוד</div>`;
        }
        eventsHtml += '</div>';

        html += `<div class="${classes}" data-date="${dateKey}">
        <div class="calendar-day-number">${dayDate.getDate()}</div>
        ${eventsHtml}
      </div>`;
      }
    } else {
      const focus = taskCalendarFocusDate || new Date();
      const dateKey = toDateKey(focus);
      taskCalendarTitle.textContent = focus.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      html += `<div class="calendar-day-name">${HEBREW_DAYS[focus.getDay()]}</div>`;

      const dayTasks = tasksByDate[dateKey] || [];
      const isToday = dateKey === todayKey;
      let classes = 'calendar-day';
      if (isToday) classes += ' today';

      let eventsHtml = '<div class="calendar-day-events">';
      const showTime = true;
      dayTasks.slice(0, maxShow).forEach(task => {
        const subjectColor = subjects.find(s => s.id === task.subject)?.color;
        const resolvedColor = resolveTaskColor(task, subjectColor);
        const color = resolvedColor || subjectColor || '#667eea';
        const safeName = escapeHtml(task.title);
        const evtDate = new Date(task.dueDate);
        const timeStr = showTime ? `${String(evtDate.getHours()).padStart(2, '0')}:${String(evtDate.getMinutes()).padStart(2, '0')} ` : '';
        const displayText = timeStr + safeName;
        eventsHtml += `<div class="calendar-event-chip" style="background: ${color}" title="${safeName}" aria-label="${safeName}" data-task-id="${task.id}">${displayText}</div>`;
      });
      if (dayTasks.length > maxShow) {
        eventsHtml += `<div class="calendar-more">+${dayTasks.length - maxShow} עוד</div>`;
      }
      eventsHtml += '</div>';

      html += `<div class="${classes}" data-date="${dateKey}">
      <div class="calendar-day-number">${focus.getDate()}</div>
      ${eventsHtml}
    </div>`;
    }

    taskCalendarGrid.innerHTML = html;
    renderTaskMonthList();
  }
  ctx.renderTaskCalendar = renderTaskCalendar;

  function renderTaskMonthList() {
    if (!taskMonthEvents || !taskMonthEventsTitle) return;

    const { tasks, subjects, toDateKey, escapeHtml, HEBREW_MONTHS, resolveTaskColor } = ctx;

    let rangeStart;
    let rangeEnd;
    let titleText = '';
    let emptyText;

    if (taskCalendarView === 'month') {
      const year = currentTaskMonth.getFullYear();
      const month = currentTaskMonth.getMonth();
      rangeStart = new Date(year, month, 1);
      rangeEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
      titleText = `משימות (ללא ספירות לאחור) ${HEBREW_MONTHS[month]}`;
      emptyText = 'אין משימות החודש';
    } else if (taskCalendarView === 'week') {
      const focus = taskCalendarFocusDate || new Date();
      const start = getStartOfWeek(focus);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      rangeStart = start;
      rangeEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
      titleText = `משימות לשבוע ${formatHebrewShortDate(start)} - ${formatHebrewShortDate(end)}`;
      emptyText = 'אין משימות השבוע';
    } else {
      const focus = taskCalendarFocusDate || new Date();
      rangeStart = new Date(focus.getFullYear(), focus.getMonth(), focus.getDate());
      rangeEnd = new Date(focus.getFullYear(), focus.getMonth(), focus.getDate(), 23, 59, 59, 999);
      titleText = `משימות ליום ${focus.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}`;
      emptyText = 'אין משימות היום';
    }

    taskMonthEventsTitle.textContent = titleText;

    const rangeTasks = tasks.filter(t => {
      if (!t.dueDate) return false;
      if (t.isCountdown || t.isEvent) return false;
      const d = new Date(t.dueDate);
      return d >= rangeStart && d <= rangeEnd;
    }).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    if (rangeTasks.length === 0) {
      taskMonthEvents.innerHTML = `<div class="no-events-msg">${emptyText}</div>`;
      return;
    }

    taskMonthEvents.innerHTML = rangeTasks.map(task => {
      const subjectColor = subjects.find(s => s.id === task.subject)?.color;
      const resolvedColor = resolveTaskColor(task, subjectColor);
      const color = resolvedColor || subjectColor || '#667eea';
      const d = new Date(task.dueDate);
      const dateStr = d.toLocaleDateString('he-IL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      return `
      <div class="month-event-item" style="border-right-color: ${color}">
        <div class="month-event-color" style="background: ${color}"></div>
        <div class="month-event-info">
          <div class="month-event-name" style="${task.completed ? 'text-decoration: line-through; opacity: 0.7;' : ''}">${escapeHtml(task.title)}</div>
          <div class="month-event-date">${dateStr}</div>
        </div>
      </div>
    `;
    }).join('');
  }

  function shiftTaskCalendar(step) {
    if (taskCalendarView === 'month') {
      currentTaskMonth.setMonth(currentTaskMonth.getMonth() + step);
      setTaskCalendarFocus(new Date(currentTaskMonth.getFullYear(), currentTaskMonth.getMonth(), 1));
    } else if (taskCalendarView === 'week') {
      const next = new Date(taskCalendarFocusDate);
      next.setDate(next.getDate() + step * 7);
      setTaskCalendarFocus(next);
    } else {
      const next = new Date(taskCalendarFocusDate);
      next.setDate(next.getDate() + step);
      setTaskCalendarFocus(next);
    }
    renderTaskCalendar();
  }

  function jumpTaskCalendarToToday() {
    const today = new Date();
    currentTaskMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    setTaskCalendarFocus(today);
    renderTaskCalendar();
  }

  // Task Calendar Navigation
  $("prevTaskMonth").onclick = () => {
    shiftTaskCalendar(-1);
  };
  if (taskCalendarViewToggle) {
    taskCalendarViewToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-view]');
      if (!btn) return;
      setTaskCalendarView(btn.dataset.view);
    });
  }

  // Toggle Task Calendar
  const toggleTaskCalendar = $("toggleTaskCalendar");
  if (toggleTaskCalendarSize && taskRightSidebar) {
    toggleTaskCalendarSize.onclick = () => {
      taskCalendarExpanded = !taskCalendarExpanded;
      taskRightSidebar.classList.toggle('calendar-expanded', taskCalendarExpanded);
      toggleTaskCalendarSize.textContent = taskCalendarExpanded ? '⤡' : '⤢';
      const label = taskCalendarExpanded ? 'הקטן' : 'הגדל';
      toggleTaskCalendarSize.title = label;
      toggleTaskCalendarSize.setAttribute('aria-label', label);
      renderTaskCalendar();
    };
  }
  if (toggleTaskCalendar && taskRightSidebar) {
    toggleTaskCalendar.onclick = () => {
      const wasHidden = taskRightSidebar.classList.contains("hidden") || getComputedStyle(taskRightSidebar).display === 'none';
      if (wasHidden) {
        taskRightSidebar.classList.remove('hidden');
        taskRightSidebar.style.display = '';
        jumpTaskCalendarToToday();
      } else {
        taskRightSidebar.classList.add('hidden');
        taskRightSidebar.style.display = 'none';
      }
    };
  }
  // Toggle Task Manager Sidebar (subjects)
  const toggleTaskSidebarBtn = $("toggleTaskSidebar");
  const taskSidebar = $("taskSidebar");
  if (toggleTaskSidebarBtn && taskSidebar) {
    toggleTaskSidebarBtn.onclick = () => {
      const wasHidden = taskSidebar.classList.contains('hidden') || getComputedStyle(taskSidebar).display === 'none';
      if (wasHidden) {
        taskSidebar.classList.remove('hidden');
        taskSidebar.style.display = '';
      } else {
        taskSidebar.classList.add('hidden');
        taskSidebar.style.display = 'none';
      }
    };
  }
  $("nextTaskMonth").onclick = () => {
    shiftTaskCalendar(1);
  };
  $("todayTaskBtn").onclick = () => {
    jumpTaskCalendarToToday();
  };
}
