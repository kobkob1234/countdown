import { ctx } from './context.js';

export function initCalendar() {
  const calendarGrid = document.getElementById('calendarGrid');
  const calendarTitle = document.getElementById('calendarTitle');
  const monthEventsEl = document.getElementById('monthEvents');
  const monthEventsTitle = document.getElementById('monthEventsTitle');

  const getCurrentMonth = () => ctx.currentMonth;
  const setCurrentMonth = (val) => { ctx.currentMonth = val; };
  const getEventCalendarView = () => ctx.eventCalendarView;
  const setEventCalendarView = (val) => { ctx.eventCalendarView = val; };
  const getEventCalendarFocusDate = () => ctx.eventCalendarFocusDate;
  const setEventCalendarFocusDate = (val) => { ctx.eventCalendarFocusDate = val; };

  let calendarRenderTimer = null;

  function scheduleCalendarRender() {
    if (calendarRenderTimer) return;
    const run = () => {
      calendarRenderTimer = null;
      renderCalendar();
    };
    if ('requestIdleCallback' in window) {
      calendarRenderTimer = requestIdleCallback(run, { timeout: 200 });
    } else {
      calendarRenderTimer = setTimeout(run, 0);
    }
  }

  const getActiveEvents = () => {
    if (typeof ctx.getActiveEvents === 'function') return ctx.getActiveEvents();
    return ctx.events || [];
  };

  function getMonthEvents() {
    const currentMonth = getCurrentMonth();
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    return getActiveEvents().filter(evt => {
      const d = new Date(evt.date);
      return d.getFullYear() === year && d.getMonth() === month;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  function renderMonthEventsList() {
    if (!monthEventsEl || !monthEventsTitle) return;
    const currentMonth = getCurrentMonth();
    const monthEvents = getMonthEvents();
    monthEventsTitle.textContent = `אירועי ${ctx.HEBREW_MONTHS[currentMonth.getMonth()]}`;

    if (monthEvents.length === 0) {
      monthEventsEl.innerHTML = '<div class="no-events-msg">אין אירועים החודש</div>';
      return;
    }

    monthEventsEl.innerHTML = monthEvents.map(evt => {
      const color = ctx.getEventColor ? ctx.getEventColor(evt.id) : '#667eea';
      const d = new Date(evt.date);
      const dateStr = `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return `
        <div class="month-event-item" style="border-right-color: ${color}">
          <div class="month-event-color" style="background: ${color}"></div>
          <div class="month-event-info">
            <div class="month-event-name">${ctx.escapeHtml ? ctx.escapeHtml(evt.name) : evt.name}</div>
            <div class="month-event-date">${dateStr}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderCalendar() {
    if (!calendarGrid || !calendarTitle) return;
    const today = new Date();
    const todayKey = ctx.toDateKey ? ctx.toDateKey(today) : today.toISOString().slice(0, 10);

    // Build event map by date
    const eventsByDate = {};
    getActiveEvents().forEach(evt => {
      const key = ctx.toDateKey ? ctx.toDateKey(evt.date) : new Date(evt.date).toISOString().slice(0, 10);
      if (!eventsByDate[key]) eventsByDate[key] = [];
      eventsByDate[key].push(evt);
    });

    let html = '';
    const sidebar = document.getElementById('sidebar');

    // Update view classes on sidebar
    const view = getEventCalendarView();
    if (sidebar) {
      sidebar.classList.toggle('calendar-view-week', view === 'week');
      sidebar.classList.toggle('calendar-view-day', view === 'day');
    }

    if (view === 'month') {
      const currentMonth = getCurrentMonth();
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      calendarTitle.textContent = `${ctx.HEBREW_MONTHS[month]} ${year}`;

      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const startDay = firstDay.getDay();
      const daysInMonth = lastDay.getDate();

      // Day names
      for (let i = 0; i < 7; i++) {
        html += `<div class="calendar-day-name">${ctx.HEBREW_DAYS[i]}</div>`;
      }

      // Previous month days
      const prevMonth = new Date(year, month, 0);
      const prevDays = prevMonth.getDate();
      for (let i = startDay - 1; i >= 0; i--) {
        const day = prevDays - i;
        html += `<div class="calendar-day other-month"><div class="calendar-day-number">${day}</div></div>`;
      }

      // Current month days
      for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = dateKey === todayKey;
        const dayEvents = eventsByDate[dateKey] || [];

        let classes = 'calendar-day';
        if (isToday) classes += ' today';

        let eventsHtml = '<div class="calendar-day-events">';
        const maxShow = 2;
        const showTime = dayEvents.length > 1;
        dayEvents.slice(0, maxShow).forEach(evt => {
          const color = ctx.getEventColor ? ctx.getEventColor(evt.id) : '#667eea';
          const safeName = ctx.escapeHtml ? ctx.escapeHtml(evt.name) : evt.name;
          const evtDate = new Date(evt.date);
          const timeStr = showTime ? `${String(evtDate.getHours()).padStart(2, '0')}:${String(evtDate.getMinutes()).padStart(2, '0')} ` : '';
          const displayText = timeStr + safeName;
          eventsHtml += `<div class="calendar-event-chip" style="background: ${color}" title="${safeName}" aria-label="${safeName}" data-event-id="${evt.id}">${displayText}</div>`;
        });
        if (dayEvents.length > maxShow) {
          eventsHtml += `<div class="calendar-more">+${dayEvents.length - maxShow} עוד</div>`;
        }
        eventsHtml += '</div>';

        html += `<div class="${classes}" data-date="${dateKey}">
          <div class="calendar-day-number">${day}</div>
          ${eventsHtml}
        </div>`;
      }

      // Next month days
      const totalCells = startDay + daysInMonth;
      const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
      for (let i = 1; i <= remainingCells; i++) {
        html += `<div class="calendar-day other-month"><div class="calendar-day-number">${i}</div></div>`;
      }
    } else if (view === 'week') {
      const focus = getEventCalendarFocusDate() || new Date();
      const start = ctx.getStartOfWeek ? ctx.getStartOfWeek(focus) : new Date(focus);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const formatShort = ctx.formatHebrewShortDate || ((d) => d.toLocaleDateString('he-IL'));
      calendarTitle.textContent = `שבוע ${formatShort(start)} - ${formatShort(end)}`;

      for (let i = 0; i < 7; i++) {
        const dayDate = new Date(start);
        dayDate.setDate(start.getDate() + i);
        html += `<div class="calendar-day-name">${ctx.HEBREW_DAYS[dayDate.getDay()]}</div>`;
      }

      for (let i = 0; i < 7; i++) {
        const dayDate = new Date(start);
        dayDate.setDate(start.getDate() + i);
        const dateKey = ctx.toDateKey ? ctx.toDateKey(dayDate) : dayDate.toISOString().slice(0, 10);
        const dayEvents = eventsByDate[dateKey] || [];
        const isToday = dateKey === todayKey;
        let classes = 'calendar-day';
        if (isToday) classes += ' today';

        let eventsHtml = '<div class="calendar-day-events">';
        const maxShow = 4;
        dayEvents.slice(0, maxShow).forEach(evt => {
          const color = ctx.getEventColor ? ctx.getEventColor(evt.id) : '#667eea';
          const safeName = ctx.escapeHtml ? ctx.escapeHtml(evt.name) : evt.name;
          const evtDate = new Date(evt.date);
          const timeStr = `${String(evtDate.getHours()).padStart(2, '0')}:${String(evtDate.getMinutes()).padStart(2, '0')} `;
          eventsHtml += `<div class="calendar-event-chip" style="background: ${color}" title="${safeName}" data-event-id="${evt.id}">${timeStr}${safeName}</div>`;
        });
        if (dayEvents.length > maxShow) {
          eventsHtml += `<div class="calendar-more">+${dayEvents.length - maxShow} עוד</div>`;
        }
        eventsHtml += '</div>';

        html += `<div class="${classes}" data-date="${dateKey}">
          <div class="calendar-day-number">${dayDate.getDate()}</div>
          ${eventsHtml}
        </div>`;
      }
    } else if (view === 'day') {
      const focus = getEventCalendarFocusDate() || new Date();
      const dateKey = ctx.toDateKey ? ctx.toDateKey(focus) : focus.toISOString().slice(0, 10);
      const dayEvents = eventsByDate[dateKey] || [];
      const dayOfWeek = focus.getDay();
      const hebrewDayNames = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת'];
      const formatShort = ctx.formatHebrewShortDate || ((d) => d.toLocaleDateString('he-IL'));
      calendarTitle.textContent = `${hebrewDayNames[dayOfWeek]}, ${formatShort(focus)}`;

      html += `<div class="calendar-day-name">${hebrewDayNames[dayOfWeek]}</div>`;

      const isToday = dateKey === todayKey;
      let classes = 'calendar-day';
      if (isToday) classes += ' today';

      let eventsHtml = '<div class="calendar-day-events">';
      dayEvents.forEach(evt => {
        const color = ctx.getEventColor ? ctx.getEventColor(evt.id) : '#667eea';
        const safeName = ctx.escapeHtml ? ctx.escapeHtml(evt.name) : evt.name;
        const evtDate = new Date(evt.date);
        const timeStr = `${String(evtDate.getHours()).padStart(2, '0')}:${String(evtDate.getMinutes()).padStart(2, '0')} `;
        eventsHtml += `<div class="calendar-event-chip" style="background: ${color}" title="${safeName}" data-event-id="${evt.id}">${timeStr}${safeName}</div>`;
      });
      if (dayEvents.length === 0) {
        eventsHtml += '<div class="no-events-msg" style="padding: 20px; text-align: center;">אין אירועים ביום זה</div>';
      }
      eventsHtml += '</div>';

      html += `<div class="${classes}" data-date="${dateKey}">
        <div class="calendar-day-number">${focus.getDate()}</div>
        ${eventsHtml}
      </div>`;
    }

    calendarGrid.innerHTML = html;
    renderMonthEventsList();
  }

  // Day Drawer functionality
  const dayDrawer = document.getElementById('dayDrawer');
  const dayDrawerTitle = document.getElementById('dayDrawerTitle');
  const dayDrawerSubtitle = document.getElementById('dayDrawerSubtitle');
  const dayEventsList = document.getElementById('dayEventsList');
  const dayTasksList = document.getElementById('dayTasksList');
  const dayEventsCount = document.getElementById('dayEventsCount');
  const dayTasksCount = document.getElementById('dayTasksCount');
  const closeDayDrawerBtn = document.getElementById('closeDayDrawer');
  const addEventToDay = document.getElementById('addEventToDay');
  const addTaskToDay = document.getElementById('addTaskToDay');
  const inputPanel = document.getElementById('inputPanel');
  const eventDate = document.getElementById('eventDate');
  const eventName = document.getElementById('eventName');

  let selectedDayKey = null;

  function openDayDrawer(dateKey) {
    if (!dayDrawer) return;
    selectedDayKey = dateKey;
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    // Format title (Hebrew day + date)
    const dayOfWeek = date.getDay();
    const hebrewDayNames = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת'];
    dayDrawerTitle.textContent = hebrewDayNames[dayOfWeek];
    dayDrawerSubtitle.textContent = `${day} ב${ctx.HEBREW_MONTHS[month - 1]} ${year}`;

    // Get events for this day
    const dayEvents = getActiveEvents().filter(evt => (ctx.toDateKey ? ctx.toDateKey(evt.date) : new Date(evt.date).toISOString().slice(0, 10)) === dateKey)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Get tasks due this day
    const allTasks = Array.isArray(ctx.tasks) ? ctx.tasks : [];
    const dayTasks = allTasks.filter(task => {
      if (!task.dueDate) return false;
      return (ctx.toDateKey ? ctx.toDateKey(task.dueDate) : new Date(task.dueDate).toISOString().slice(0, 10)) === dateKey;
    }).sort((a, b) => {
      // Sort by completed, then priority
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
      return (PRIORITY_ORDER[a.priority] || 4) - (PRIORITY_ORDER[b.priority] || 4);
    });

    // Update counts
    if (dayEventsCount) dayEventsCount.textContent = dayEvents.length;
    if (dayTasksCount) dayTasksCount.textContent = dayTasks.length;

    // Render events
    if (dayEventsList) {
      if (dayEvents.length === 0) {
        dayEventsList.innerHTML = '<div class="day-drawer-empty">אין אירועים ביום זה</div>';
      } else {
        dayEventsList.innerHTML = dayEvents.map(evt => {
          const color = ctx.getEventColor ? ctx.getEventColor(evt.id) : '#667eea';
          const evtDate = new Date(evt.date);
          const timeStr = `${String(evtDate.getHours()).padStart(2, '0')}:${String(evtDate.getMinutes()).padStart(2, '0')}`;
          return `
          <div class="day-drawer-item" data-event-id="${evt.id}">
            <div class="day-drawer-item-color" style="background: ${color}"></div>
            <div class="day-drawer-item-info">
              <div class="day-drawer-item-name">${ctx.escapeHtml ? ctx.escapeHtml(evt.name) : evt.name}</div>
              <div class="day-drawer-item-time">🕐 ${timeStr}</div>
            </div>
          </div>
        `;
        }).join('');
      }
    }

    // Render tasks
    if (dayTasksList) {
      if (dayTasks.length === 0) {
        dayTasksList.innerHTML = '<div class="day-drawer-empty">אין משימות ביום זה</div>';
      } else {
        const PRIORITY_COLORS = { urgent: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e', none: '#6b7280' };
        const PRIORITY_BG = { urgent: 'rgba(239,68,68,0.15)', high: 'rgba(249,115,22,0.15)', medium: 'rgba(234,179,8,0.15)', low: 'rgba(34,197,94,0.15)', none: 'var(--day-other)' };
        const PRIORITY_LABELS_HE = { urgent: 'דחוף', high: 'גבוה', medium: 'בינוני', low: 'נמוך', none: '' };

        dayTasksList.innerHTML = dayTasks.map(task => {
          const priority = task.priority || 'none';
          const priorityLabel = PRIORITY_LABELS_HE[priority];
          const completedClass = task.completed ? 'task-completed' : '';
          const due = task.dueDate ? new Date(task.dueDate) : null;
          const timeStr = due ? `${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}` : '';

          return `
          <div class="day-drawer-item ${completedClass}" data-task-id="${task.id}">
            <div class="day-drawer-item-color" style="background: ${PRIORITY_COLORS[priority]}"></div>
            <div class="day-drawer-item-info">
              <div class="day-drawer-item-name">${ctx.escapeHtml ? ctx.escapeHtml(task.title) : task.title}</div>
              ${timeStr ? `<div class=\"day-drawer-item-time\">🕐 ${timeStr}</div>` : ''}
            </div>
            ${priorityLabel ? `<div class=\"day-drawer-item-priority\" style=\"background: ${PRIORITY_BG[priority]}; color: ${PRIORITY_COLORS[priority]}\">${priorityLabel}</div>` : ''}
          </div>
        `;
        }).join('');
      }
    }

    // Add click handlers for items
    if (dayEventsList) {
      dayEventsList.querySelectorAll('.day-drawer-item').forEach(item => {
        item.addEventListener('click', () => {
          const eventId = item.dataset.eventId;
          if (eventId) {
            closeDayDrawer();
            // Scroll to event in main list
            setTimeout(() => {
              const eventRow = document.querySelector(`.event-row[data-id="${eventId}"]`);
              if (eventRow) {
                eventRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                eventRow.style.transition = 'background 0.3s';
                eventRow.style.background = 'var(--accent)';
                setTimeout(() => { eventRow.style.background = ''; }, 800);
              }
            }, 200);
          }
        });
      });
    }

    if (dayTasksList) {
      dayTasksList.querySelectorAll('.day-drawer-item').forEach(item => {
        item.addEventListener('click', () => {
          const taskId = item.dataset.taskId;
          if (taskId) {
            closeDayDrawer();
            // Open task manager and highlight task
            setTimeout(() => {
              if (typeof ctx.showView === 'function' && ctx.currentView !== 'tasks') {
                ctx.showView('tasks');
              } else {
                const tmOverlay = document.getElementById('taskManagerOverlay');
                if (tmOverlay && !tmOverlay.classList.contains('open')) {
                  tmOverlay.classList.add('open');
                  if (typeof ctx.renderSubjectsSidebar === 'function') ctx.renderSubjectsSidebar();
                  if (typeof ctx.renderTasks === 'function') ctx.renderTasks();
                  if (typeof ctx.startTaskTicker === 'function') ctx.startTaskTicker();
                }
              }
              setTimeout(() => {
                const taskItem = document.querySelector(`.task-item[data-id="${taskId}"]`);
                if (taskItem) {
                  taskItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  taskItem.style.transition = 'box-shadow 0.3s';
                  taskItem.style.boxShadow = '0 0 0 3px var(--accent)';
                  setTimeout(() => { taskItem.style.boxShadow = ''; }, 1000);
                }
              }, 300);
            }, 200);
          }
        });
      });
    }

    dayDrawer.classList.add('open');
  }

  function closeDayDrawer() {
    if (!dayDrawer) return;
    dayDrawer.classList.remove('open');
    selectedDayKey = null;
  }

  if (closeDayDrawerBtn) closeDayDrawerBtn.onclick = closeDayDrawer;
  if (dayDrawer) {
    dayDrawer.addEventListener('click', (e) => {
      if (e.target === dayDrawer) closeDayDrawer();
    });
  }

  if (addEventToDay) {
    addEventToDay.onclick = () => {
      if (!selectedDayKey) return;
      const dateToUse = selectedDayKey; // Save before closing
      closeDayDrawer();
      if (eventDate) eventDate.value = dateToUse + 'T12:00';
      if (eventName) eventName.focus();
      if (inputPanel) inputPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
  }

  if (addTaskToDay) {
    addTaskToDay.onclick = () => {
      if (!selectedDayKey) return;
      const dateToUse = selectedDayKey; // Save before closing
      closeDayDrawer();
      // Open task manager
      if (typeof ctx.showView === 'function' && ctx.currentView !== 'tasks') {
        ctx.showView('tasks');
      } else {
        const tmOverlay = document.getElementById('taskManagerOverlay');
        if (tmOverlay) {
          tmOverlay.classList.add('open');
          if (typeof ctx.renderSubjectsSidebar === 'function') ctx.renderSubjectsSidebar();
          if (typeof ctx.renderTasks === 'function') ctx.renderTasks();
          if (typeof ctx.startTaskTicker === 'function') ctx.startTaskTicker();
        }
      }
      // Pre-fill the due date
      setTimeout(() => {
        const taskDueInput = document.getElementById('newTaskDue');
        const taskTitleInput = document.getElementById('newTaskTitle');
        const quickRow = document.getElementById('quickAddRow');
        if (taskDueInput) taskDueInput.value = dateToUse + 'T23:59';
        if (taskTitleInput) taskTitleInput.focus();
        if (quickRow) quickRow.style.display = 'flex';
      }, 200);
    };
  }

  if (calendarGrid) {
    calendarGrid.addEventListener('click', (e) => {
      const chip = e.target.closest('.calendar-event-chip');
      if (chip) {
        e.stopPropagation();
        const eventId = chip.dataset.eventId;
        if (eventId) {
          const eventRow = document.querySelector(`.event-row[data-id="${eventId}"]`);
          if (eventRow) {
            eventRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            eventRow.style.transition = 'background 0.3s';
            eventRow.style.background = 'var(--accent)';
            setTimeout(() => { eventRow.style.background = ''; }, 800);
          }
        }
        return;
      }

      const day = e.target.closest('.calendar-day:not(.other-month)');
      if (day) {
        const dateKey = day.dataset.date;
        if (!dateKey) return;
        openDayDrawer(dateKey);
      }
    });
  }

  const prevMonthBtn = document.getElementById('prevMonth');
  const nextMonthBtn = document.getElementById('nextMonth');
  if (prevMonthBtn) {
    prevMonthBtn.onclick = () => {
      const view = getEventCalendarView();
      if (view === 'month') {
        const currentMonth = getCurrentMonth();
        const next = new Date(currentMonth);
        next.setMonth(next.getMonth() - 1);
        setCurrentMonth(next);
      } else if (view === 'week') {
        const focus = new Date(getEventCalendarFocusDate());
        focus.setDate(focus.getDate() - 7);
        setEventCalendarFocusDate(focus);
      } else if (view === 'day') {
        const focus = new Date(getEventCalendarFocusDate());
        focus.setDate(focus.getDate() - 1);
        setEventCalendarFocusDate(focus);
      }
      renderCalendar();
    };
  }

  if (nextMonthBtn) {
    nextMonthBtn.onclick = () => {
      const view = getEventCalendarView();
      if (view === 'month') {
        const currentMonth = getCurrentMonth();
        const next = new Date(currentMonth);
        next.setMonth(next.getMonth() + 1);
        setCurrentMonth(next);
      } else if (view === 'week') {
        const focus = new Date(getEventCalendarFocusDate());
        focus.setDate(focus.getDate() + 7);
        setEventCalendarFocusDate(focus);
      } else if (view === 'day') {
        const focus = new Date(getEventCalendarFocusDate());
        focus.setDate(focus.getDate() + 1);
        setEventCalendarFocusDate(focus);
      }
      renderCalendar();
    };
  }

  const todayBtn = document.getElementById('todayBtn');
  if (todayBtn) {
    todayBtn.onclick = () => {
      setCurrentMonth(new Date());
      setEventCalendarFocusDate(new Date());
      renderCalendar();
    };
  }

  const eventCalendarViewToggle = document.getElementById('eventCalendarViewToggle');
  if (eventCalendarViewToggle) {
    eventCalendarViewToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-view]');
      if (!btn) return;
      setEventCalendarView(btn.dataset.view);
      setEventCalendarFocusDate(new Date());
      eventCalendarViewToggle.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderCalendar();
    });
  }

  // CALENDAR SYNC FUNCTIONALITY
  const calendarSyncBtn = document.getElementById('calendarSyncBtn');
  const calendarSyncModal = document.getElementById('calendarSyncModal');
  const closeCalendarSyncBtn = document.getElementById('closeCalendarSyncBtn');
  const syncGoogleCalendar = document.getElementById('syncGoogleCalendar');
  const syncAppleCalendar = document.getElementById('syncAppleCalendar');
  const calendarSyncStatus = document.getElementById('calendarSyncStatus');
  const calendarEventsList = document.getElementById('calendarEventsList');
  const calendarEventsContent = document.getElementById('calendarEventsContent');
  const importCalendarEventsBtn = document.getElementById('importCalendarEventsBtn');

  let pendingCalendarEvents = [];

  // Google Calendar API Configuration
  const GOOGLE_API_KEY_DEFAULT = 'AIzaSyBH6g_Wz_RJKmEZL9xYWB6J2QaQ5f8z7hY';
  const GOOGLE_CLIENT_ID_DEFAULT = '';
  const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';

  const googleSettingsDetails = document.getElementById('googleSettingsDetails');
  const googleApiKeyInput = document.getElementById('googleApiKeyInput');
  const googleClientIdInput = document.getElementById('googleClientIdInput');
  const saveGoogleSettingsBtn = document.getElementById('saveGoogleSettingsBtn');
  const resetGoogleSettingsBtn = document.getElementById('resetGoogleSettingsBtn');

  const getGoogleApiKey = () => (localStorage.getItem(ctx.STORAGE_KEYS?.GOOGLE_API_KEY) || GOOGLE_API_KEY_DEFAULT || '').trim();
  const getGoogleClientId = () => (localStorage.getItem(ctx.STORAGE_KEYS?.GOOGLE_CLIENT_ID) || GOOGLE_CLIENT_ID_DEFAULT || '').trim();

  const isPlaceholderClientId = (clientId) =>
    !clientId ||
    clientId === 'YOUR_CLIENT_ID.apps.googleusercontent.com' ||
    clientId.includes('123456789');

  const isPlaceholderApiKey = (apiKey) =>
    !apiKey ||
    apiKey === 'YOUR_API_KEY_HERE' ||
    apiKey.includes('YOUR_API_KEY');

  const syncGoogleSettingsInputsFromStorage = () => {
    if (googleApiKeyInput) googleApiKeyInput.value = getGoogleApiKey();
    if (googleClientIdInput) googleClientIdInput.value = getGoogleClientId();
  };

  const openGoogleSettings = () => {
    if (googleSettingsDetails) googleSettingsDetails.open = true;
    if (googleClientIdInput) googleClientIdInput.focus();
  };

  const showCalendarStatus = (message, type = 'info') => {
    if (!calendarSyncStatus) return;
    calendarSyncStatus.textContent = message;
    calendarSyncStatus.style.display = 'block';
    calendarSyncStatus.style.background = type === 'error' ? '#fef2f2'
      : type === 'success' ? '#f0fdf4' : 'var(--day-other)';
    calendarSyncStatus.style.color = type === 'error' ? '#ef4444'
      : type === 'success' ? '#10b981' : 'var(--muted)';
  };

  const hideCalendarStatus = () => {
    if (!calendarSyncStatus) return;
    calendarSyncStatus.style.display = 'none';
  };

  if (saveGoogleSettingsBtn) {
    saveGoogleSettingsBtn.onclick = () => {
      const apiKey = (googleApiKeyInput?.value || '').trim();
      const clientId = (googleClientIdInput?.value || '').trim();

      if (apiKey) localStorage.setItem(ctx.STORAGE_KEYS.GOOGLE_API_KEY, apiKey);
      else localStorage.removeItem(ctx.STORAGE_KEYS.GOOGLE_API_KEY);

      if (clientId) localStorage.setItem(ctx.STORAGE_KEYS.GOOGLE_CLIENT_ID, clientId);
      else localStorage.removeItem(ctx.STORAGE_KEYS.GOOGLE_CLIENT_ID);

      showCalendarStatus('✅ Saved Google settings', 'success');
    };
  }

  if (resetGoogleSettingsBtn) {
    resetGoogleSettingsBtn.onclick = () => {
      localStorage.removeItem(ctx.STORAGE_KEYS.GOOGLE_API_KEY);
      localStorage.removeItem(ctx.STORAGE_KEYS.GOOGLE_CLIENT_ID);
      syncGoogleSettingsInputsFromStorage();
      showCalendarStatus('🔄 Reset Google settings', 'info');
    };
  }

  if (calendarSyncBtn && calendarSyncModal) {
    calendarSyncBtn.onclick = () => {
      calendarSyncModal.classList.add('open');
      hideCalendarStatus();
      syncGoogleSettingsInputsFromStorage();
      if (calendarEventsList) calendarEventsList.style.display = 'none';
      if (importCalendarEventsBtn) importCalendarEventsBtn.style.display = 'none';
      pendingCalendarEvents = [];
    };
  }

  const clearImportedEventsBtn = document.getElementById('clearImportedEventsBtn');
  if (closeCalendarSyncBtn && calendarSyncModal) {
    closeCalendarSyncBtn.onclick = () => {
      calendarSyncModal.classList.remove('open');
    };
  }

  if (clearImportedEventsBtn) {
    clearImportedEventsBtn.onclick = async () => {
      if (!confirm('Are you sure you want to delete ALL imported calendar events? This cannot be undone.')) return;

      const allEvents = ctx.events || [];
      const imported = allEvents.filter(e => e.externalId || (e.notes && e.notes.includes('[Imported')));

      if (imported.length === 0) {
        showCalendarStatus('No imported events found to delete.', 'info');
        return;
      }

      showCalendarStatus(`🗑️ Deleting ${imported.length} imported events...`, 'info');

      let deleted = 0;
      for (const evt of imported) {
        try {
          if (typeof ctx.deleteFromCloud === 'function') {
            await ctx.deleteFromCloud(evt.id);
            deleted++;
          }
        } catch (err) {
          console.error('Failed to delete', evt.id, err);
        }
      }
      showCalendarStatus(`✅ Deleted ${deleted} events.`, 'success');
    };
  }

  if (calendarSyncModal) {
    calendarSyncModal.addEventListener('click', (e) => {
      if (e.target === calendarSyncModal) {
        calendarSyncModal.classList.remove('open');
      }
    });
  }

  if (syncGoogleCalendar) {
    syncGoogleCalendar.onclick = async () => {
      if (location.protocol === 'file:') {
        showCalendarStatus('❌ Google Calendar sign-in does not work from file://. Run the app via http://localhost (e.g. `python3 -m http.server 8000`).', 'error');
        openGoogleSettings();
        return;
      }

      const apiKey = getGoogleApiKey();
      const clientId = getGoogleClientId();
      if (isPlaceholderClientId(clientId)) {
        showCalendarStatus('❌ Missing OAuth Client ID. Open “Google Settings” and paste your Client ID (ends with .apps.googleusercontent.com).', 'error');
        openGoogleSettings();
        return;
      }
      if (isPlaceholderApiKey(apiKey)) {
        showCalendarStatus('⚠️ Missing Google API Key. It may still work, but recommended to add one in “Google Settings”.', 'info');
        openGoogleSettings();
      }

      showCalendarStatus('🔄 Connecting to Google Calendar...', 'info');

      try {
        if (!window.gapi) {
          await loadGoogleAPI();
        }

        await new Promise((resolve, reject) => {
          gapi.load('client:auth2', {
            callback: resolve,
            onerror: () => reject(new Error('Failed to load Google auth library')),
            timeout: 15000,
            ontimeout: () => reject(new Error('Timed out loading Google auth library'))
          });
        });

        await gapi.client.init({
          apiKey: apiKey || undefined,
          clientId,
          discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
          scope: GOOGLE_SCOPES
        });

        const auth = gapi.auth2.getAuthInstance();
        if (!auth.isSignedIn.get()) {
          await auth.signIn();
        }

        showCalendarStatus('✅ Connected! Fetching events...', 'success');

        const now = new Date();
        const oneMonthLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const response = await gapi.client.calendar.events.list({
          calendarId: 'primary',
          timeMin: now.toISOString(),
          timeMax: oneMonthLater.toISOString(),
          showDeleted: false,
          singleEvents: true,
          maxResults: 50,
          orderBy: 'startTime'
        });

        const events = response.result.items || [];

        if (events.length === 0) {
          showCalendarStatus('No upcoming events found in your Google Calendar', 'info');
          return;
        }

        displayCalendarEvents(events, 'google');

      } catch (error) {
        console.error('Google Calendar sync error:', error);
        const details =
          error?.result?.error?.message ||
          error?.details ||
          error?.error ||
          error?.message ||
          (typeof error === 'string' ? error : '');

        let hint = '';
        const combined = String(details || '');
        if (/idpiframe_initialization_failed/i.test(combined)) {
          hint = ' (Tip: allow third‑party cookies or try a different browser/profile.)';
        } else if (/redirect_uri_mismatch|origin_mismatch/i.test(combined)) {
          hint = ' (Tip: add this site to “Authorized JavaScript origins” in Google OAuth settings.)';
        } else if (/invalid_client/i.test(combined)) {
          hint = ' (Tip: check your OAuth Client ID.)';
        }

        showCalendarStatus(`❌ Error: ${details || 'Failed to connect to Google Calendar'}${hint}`, 'error');
        openGoogleSettings();
      }
    };
  }

  if (syncAppleCalendar) {
    syncAppleCalendar.onclick = async () => {
      showCalendarStatus('🍎 Apple Calendar requires .ics file import', 'info');

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.ics,.ical';

      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        showCalendarStatus('🔄 Reading calendar file...', 'info');

        try {
          const text = await file.text();
          const events = parseICalendar(text);

          if (events.length === 0) {
            showCalendarStatus('No events found in the .ics file', 'info');
            return;
          }

          displayCalendarEvents(events, 'apple');

        } catch (error) {
          console.error('iCal parse error:', error);
          showCalendarStatus(`❌ Error: ${error.message || 'Failed to read calendar file'}`, 'error');
        }
      };

      input.click();
    };
  }

  function loadGoogleAPI() {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[src*="apis.google.com"]')) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function parseICalendar(icsText) {
    const events = [];
    const lines = icsText.split(/\r?\n/);
    let currentEvent = null;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();

      while (i + 1 < lines.length && /^[ \t]/.test(lines[i + 1])) {
        line += lines[++i].trim();
      }

      if (line === 'BEGIN:VEVENT') {
        currentEvent = {};
      } else if (line === 'END:VEVENT' && currentEvent) {
        if (currentEvent.summary && currentEvent.start) {
          events.push(currentEvent);
        }
        currentEvent = null;
      } else if (currentEvent) {
        const match = line.match(/^([^:;]+)(?:;([^:]+))?:(.+)$/);
        if (match) {
          const [, key, params, value] = match;

          if (key === 'SUMMARY') {
            currentEvent.summary = value;
          } else if (key === 'DTSTART') {
            currentEvent.start = parseICalDate(value, params);
          } else if (key === 'DTEND') {
            currentEvent.end = parseICalDate(value, params);
            currentEvent.description = value.replace(/\\n/g, '\n');
          } else if (key === 'UID') {
            currentEvent.uid = value;
          } else if (key === 'RRULE') {
            currentEvent.rrule = value;
          }
        }
      }
    }

    return events;
  }

  function parseICalDate(dateStr) {
    const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
    if (!match) return null;

    const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
    return new Date(year, month - 1, day, hour, minute, second);
  }

  function displayCalendarEvents(calendarEvents, source) {
    // Filter events from today onwards
    const now = new Date();
    // Reset to start of day to include events from earlier today
    now.setHours(0, 0, 0, 0);

    const getNextOccurrence = (start, rrule, fromDate) => {
      if (!rrule) return null;
      const parts = rrule.split(';');
      const freqPart = parts.find(p => p.startsWith('FREQ='));
      if (!freqPart) return null;
      const freq = freqPart.split('=')[1];

      let interval = 1;
      const intervalPart = parts.find(p => p.startsWith('INTERVAL='));
      if (intervalPart) interval = parseInt(intervalPart.split('=')[1], 10);

      let next = new Date(start);

      // Safety break to prevent infinite loops
      let attempts = 0;
      const MAX_ATTEMPTS = 1000;

      while (next < fromDate && attempts < MAX_ATTEMPTS) {
        attempts++;
        switch (freq) {
          case 'DAILY':
            next.setDate(next.getDate() + interval);
            break;
          case 'WEEKLY':
            next.setDate(next.getDate() + (7 * interval));
            break;
          case 'MONTHLY':
            next.setMonth(next.getMonth() + interval);
            break;
          case 'YEARLY':
            next.setFullYear(next.getFullYear() + interval);
            break;
          default:
            return null; // Unsupported frequency
        }
      }

      return (next >= fromDate) ? next : null;
    };

    pendingCalendarEvents = calendarEvents
      .map(evt => {
        let start = evt.start.dateTime ? new Date(evt.start.dateTime) : (evt.start.date ? new Date(evt.start.date) : evt.start);

        // If start is in the past and we have an RRULE, try to find next occurrence
        if (start < now && evt.rrule) {
          const next = getNextOccurrence(start, evt.rrule, now);
          if (next) {
            start = next;
            // Update the original object's start so downstream logic works
            if (evt.start instanceof Date) evt.start = next;
            else if (evt.start.dateTime) evt.start.dateTime = next.toISOString();
            else if (evt.start.date) evt.start.date = next.toISOString().split('T')[0];
          }
        }
        return { evt, start };
      })
      .filter(({ start }) => start >= now)
      .map(({ evt, start }) => {
        if (source === 'google') {
          return {
            name: evt.summary || 'Untitled Event',
            date: evt.start.dateTime || evt.start.date,
            notes: evt.description || '',
            source: 'Google Calendar'
          };
        }

        // Use the potentially updated start date (for recurring events)
        const end = evt.end ?
          (evt.end.dateTime ? new Date(evt.end.dateTime) : (evt.end.date ? new Date(evt.end.date) : evt.end))
          : new Date(start.getTime() + 60 * 60 * 1000);

        // Recalculate duration just in case
        let duration = 60;
        if (evt.end) {
          const originalStart = evt.start.dateTime ? new Date(evt.start.dateTime) : (evt.start.date ? new Date(evt.start.date) : evt.start);
          // Use original duration logic
          duration = Math.max(15, Math.round((end - originalStart) / (1000 * 60)));
          // Fix: if projected, keep duration same
          if (duration < 0 || isNaN(duration)) duration = 60;
        }

        return {
          name: evt.summary || 'Untitled Event',
          date: start.toISOString(),
          duration: duration,
          notes: evt.description || '',
          source: source === 'apple' ? 'iCal File' : 'Imported File',
          externalId: evt.uid || null
        };
      });

    showCalendarStatus(`✅ Found ${pendingCalendarEvents.length} events`, 'success');

    if (calendarEventsContent) {
      calendarEventsContent.innerHTML = pendingCalendarEvents.map((evt, idx) => {
        const eventDate = new Date(evt.date);
        const dateStr = eventDate.toLocaleString('he-IL', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        return `
        <label style="display: flex; align-items: center; padding: 8px; border-radius: 6px; background: var(--card); border: 1px solid var(--border); cursor: pointer; transition: all 0.2s;" 
               onmouseover="this.style.background='var(--day-hover)'" 
               onmouseout="this.style.background='var(--card)'">
          <input type="checkbox" checked data-event-idx="${idx}" style="margin-left: 8px;">
          <div style="flex: 1;">
            <div style="font-weight: 500; color: var(--text);">${ctx.escapeHtml ? ctx.escapeHtml(evt.name) : evt.name}</div>
            <div style="font-size: 12px; color: var(--muted);">${dateStr}</div>
          </div>
        </label>
      `;
      }).join('');
    }

    if (calendarEventsList) calendarEventsList.style.display = 'block';
    if (importCalendarEventsBtn) importCalendarEventsBtn.style.display = 'block';
  }

  if (importCalendarEventsBtn) {
    importCalendarEventsBtn.onclick = async () => {
      if (!calendarEventsContent) return;
      const checkboxes = calendarEventsContent.querySelectorAll('input[type="checkbox"]:checked');
      const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.dataset.eventIdx, 10));

      if (selectedIndices.length === 0) {
        showCalendarStatus('Please select at least one event to import', 'error');
        return;
      }

      showCalendarStatus(`🔄 Processing ${selectedIndices.length} events...`, 'info');

      let imported = 0;
      let updated = 0;
      const existingEvents = ctx.events || [];
      const processedExternalIds = [];

      for (const idx of selectedIndices) {
        const evt = pendingCalendarEvents[idx];
        if (evt.externalId) processedExternalIds.push(evt.externalId);
        try {
          // Check for existing event with same externalId/UID
          const existing = evt.externalId
            ? existingEvents.find(e => e.externalId === evt.externalId)
            : null;

          if (existing) {
            // Update existing event
            if (typeof ctx.updateInCloud === 'function') {
              const newNotes = evt.notes ? (evt.notes.includes('[Imported') ? evt.notes : `${evt.notes}\n\n[Imported]`) : existing.notes;
              await ctx.updateInCloud(existing.id, {
                ...existing,
                name: evt.name,
                date: evt.date,
                duration: evt.duration,
                notes: newNotes
              });
              updated++;
            }
          } else {
            // Create new event
            if (typeof ctx.saveToCloud === 'function') {
              await ctx.saveToCloud({
                name: evt.name,
                date: evt.date,
                duration: evt.duration,
                notes: evt.notes ? `${evt.notes}\n\n[Imported]` : `[Imported]`,
                reminder: 60,
                highlighted: false,
                pinned: false,
                externalId: evt.externalId || null
              });
              imported++;
            }
          }
        } catch (error) {
          console.error('Failed to process event:', evt.name, error);
        }
      }

      showCalendarStatus(`✅ Done! Added ${imported} new, Updated ${updated} events.`, 'success');

      // Auto-sync ALL imported events to planner (bulk)
      if (typeof ctx.bulkSyncImportedEvents === 'function' && processedExternalIds.length > 0) {
        // Wait a small moment to ensure events are saved in ctx.events (optimistic UI handles it usually)
        setTimeout(() => {
          const synced = ctx.bulkSyncImportedEvents(processedExternalIds);
          if (synced > 0) {
            console.log('Bulk synced to planner:', synced);
          }
        }, 100);
      }

      setTimeout(() => {
        if (calendarSyncModal) calendarSyncModal.classList.remove('open');
      }, 3000);
    };
  }

  return {
    renderCalendar,
    scheduleCalendarRender,
    openDayDrawer,
    closeDayDrawer
  };
}
