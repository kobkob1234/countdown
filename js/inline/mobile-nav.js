// Mobile Bottom Navigation Handler
export function initMobileNav() {
  (function () {
    const isMobile = () => window.innerWidth <= 768 ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches && window.innerWidth <= 1024);

    const mobileNav = document.getElementById('mobileBottomNav');
    const navItems = mobileNav.querySelectorAll('.mobile-nav-item');

    // Show/hide mobile nav based on screen size
    const updateMobileNavVisibility = () => {
      if (isMobile()) {
        mobileNav.style.display = 'flex';
      } else {
        mobileNav.style.display = 'none';
      }
    };

    // Initial check
    updateMobileNavVisibility();

    // Update on resize
    window.addEventListener('resize', updateMobileNavVisibility);

    // Handle navigation clicks
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const view = item.dataset.view;

        // Update active state
        navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        // Prefer the app's canonical view switcher (keeps tickers + state consistent)
        if (typeof window.showView === 'function') {
          if (view === 'calendar') {
            window.showView('countdown');
            document.getElementById('toggleSidebar')?.click();
          } else {
            window.showView(view);
            document.getElementById('sidebar')?.classList.add('hidden');
          }
          return;
        }
      });
    });

    // Sync with existing header button clicks
    const syncWithHeader = () => {
      const toggleCountdown = document.getElementById('toggleCountdown');
      const toggleTasks = document.getElementById('toggleTasks');
      const togglePomodoro = document.getElementById('togglePomodoro');
      const togglePlanner = document.getElementById('togglePlanner');
      const toggleSidebar = document.getElementById('toggleSidebar');

      const updateNav = (view) => {
        navItems.forEach(item => {
          item.classList.toggle('active', item.dataset.view === view);
        });
      };

      toggleCountdown?.addEventListener('click', () => updateNav('countdown'));
      toggleTasks?.addEventListener('click', () => updateNav('tasks'));
      togglePomodoro?.addEventListener('click', () => updateNav('pomodoro'));
      togglePlanner?.addEventListener('click', () => updateNav('planner'));
      toggleSidebar?.addEventListener('click', () => updateNav('calendar'));

      window.addEventListener('app:viewchange', (e) => {
        const v = e?.detail?.view;
        if (!v) return;
        updateNav(v);
      });
    };

    syncWithHeader();

    // Mobile Task Sidebar Handler
    const taskSidebar = document.getElementById('taskSidebar');
    const toggleTaskSidebarBtn = document.getElementById('toggleTaskSidebar');
    const mobileSidebarBackdrop = document.getElementById('mobileSidebarBackdrop');

    const toggleMobileTaskSidebar = () => {
      if (!isMobile()) return;

      const isOpen = taskSidebar.classList.contains('open');

      if (isOpen) {
        taskSidebar.classList.remove('open');
        mobileSidebarBackdrop.classList.remove('visible');
        toggleTaskSidebarBtn?.classList.remove('active');
      } else {
        taskSidebar.classList.add('open');
        mobileSidebarBackdrop.classList.add('visible');
        toggleTaskSidebarBtn?.classList.add('active');
      }
    };

    toggleTaskSidebarBtn?.addEventListener('click', (e) => {
      if (isMobile()) {
        e.preventDefault();
        e.stopPropagation();
        toggleMobileTaskSidebar();
      }
    });

    mobileSidebarBackdrop?.addEventListener('click', () => {
      if (taskSidebar?.classList.contains('open')) {
        toggleMobileTaskSidebar();
      }
    });

    // Close task sidebar when clicking on a subject/view on mobile
    if (taskSidebar) {
      taskSidebar.addEventListener('click', (e) => {
        if (isMobile() && (e.target.closest('.smart-view-item') || e.target.closest('.subject-list-header'))) {
          setTimeout(() => {
            toggleMobileTaskSidebar();
          }, 200);
        }
      });
    }

    // Mobile Floating Action Button (FAB)
    const mobileFab = document.getElementById('mobileFab');

    const updateFabVisibility = () => {
      if (!mobileFab) return;
      if (isMobile()) {
        mobileFab.style.display = 'flex';
      } else {
        mobileFab.style.display = 'none';
      }
    };


    updateFabVisibility();
    window.addEventListener('resize', updateFabVisibility);

    // ===== Mobile Event Bottom Sheet =====
    const mobileEventSheet = document.getElementById('mobileEventSheet');
    const mobileEventSheetBackdrop = document.getElementById('mobileEventSheetBackdrop');
    const mobileSheetClose = document.getElementById('mobileSheetClose');
    const mobileSheetCancel = document.getElementById('mobileSheetCancel');
    const mobileSheetAdd = document.getElementById('mobileSheetAdd');
    const mobileSheetTitle = document.getElementById('mobileSheetTitle');
    let mobileEditingId = null; // Track if we're editing an event

    function openMobileEventSheet(eventToEdit = null) {
      if (!mobileEventSheet || !mobileEventSheetBackdrop) return;

      const dateInput = document.getElementById('mobileEventDate');
      const nameInput = document.getElementById('mobileEventName');
      const reminderSelect = document.getElementById('mobileEventReminder');
      const notesInput = document.getElementById('mobileEventNotes');

      if (eventToEdit) {
        // Edit mode
        mobileEditingId = eventToEdit.id;
        if (mobileSheetTitle) mobileSheetTitle.innerHTML = '<span class="icon" style="font-size:16px;vertical-align:middle">edit</span> עריכת אירוע';
        if (mobileSheetAdd) mobileSheetAdd.textContent = 'שמור שינויים ✓';
        if (nameInput) nameInput.value = eventToEdit.name || '';
        if (dateInput) dateInput.value = window.ctx?.toLocalDatetime?.(eventToEdit.date) || eventToEdit.date || '';
        if (reminderSelect) reminderSelect.value = String(eventToEdit.reminder || 0);
        if (notesInput) notesInput.value = eventToEdit.notes || '';
      } else {
        // Add mode
        mobileEditingId = null;
        if (mobileSheetTitle) mobileSheetTitle.innerHTML = '<span class="icon" style="font-size:16px;vertical-align:middle">add_circle</span> הוסף אירוע חדש';
        if (mobileSheetAdd) mobileSheetAdd.textContent = 'הוסף אירוע';
        // Set default date to tomorrow at 9:00 AM
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        if (dateInput) {
          const year = tomorrow.getFullYear();
          const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
          const day = String(tomorrow.getDate()).padStart(2, '0');
          dateInput.value = `${year}-${month}-${day}T09:00`;
        }
        if (nameInput) nameInput.value = '';
        if (reminderSelect) reminderSelect.value = '0';
        if (notesInput) notesInput.value = '';
      }

      mobileEventSheetBackdrop.classList.add('open');
      mobileEventSheet.classList.add('open');
      document.body.style.overflow = 'hidden';

      // Focus on name input after animation
      setTimeout(() => {
        nameInput?.focus();
      }, 350);
    }

    function closeMobileEventSheet() {
      if (!mobileEventSheet || !mobileEventSheetBackdrop) return;
      mobileEventSheetBackdrop.classList.remove('open');
      mobileEventSheet.classList.remove('open');
      document.body.style.overflow = '';
      mobileEditingId = null; // Reset edit mode
      if (mobileEventSheet) delete mobileEventSheet.dataset.editingId; // Also reset dataset.editingId from startEdit

      // Clear form
      const nameInput = document.getElementById('mobileEventName');
      const notesInput = document.getElementById('mobileEventNotes');
      const reminderSelect = document.getElementById('mobileEventReminder');
      if (nameInput) nameInput.value = '';
      if (notesInput) notesInput.value = '';
      if (reminderSelect) reminderSelect.value = '0';

      // Reset title and button text
      if (mobileSheetTitle) mobileSheetTitle.innerHTML = '<span class="icon" style="font-size:16px;vertical-align:middle">add_circle</span> הוסף אירוע חדש';
      if (mobileSheetAdd) mobileSheetAdd.textContent = 'הוסף אירוע';
    }

    // Close handlers
    mobileSheetClose?.addEventListener('click', closeMobileEventSheet);
    mobileSheetCancel?.addEventListener('click', closeMobileEventSheet);
    mobileEventSheetBackdrop?.addEventListener('click', closeMobileEventSheet);

    // Expose to ctx for cross-script access (used by startEdit for mobile)
    if (window.ctx) {
      window.ctx.openMobileEventSheet = openMobileEventSheet;
      window.ctx.closeMobileEventSheet = closeMobileEventSheet;
    }

    // Add/Edit event handler
    mobileSheetAdd?.addEventListener('click', () => {
      const name = document.getElementById('mobileEventName')?.value?.trim();
      const dateValue = document.getElementById('mobileEventDate')?.value;
      const reminder = document.getElementById('mobileEventReminder')?.value || '0';
      const notes = document.getElementById('mobileEventNotes')?.value?.trim() || '';

      if (!name) {
        document.getElementById('mobileEventName')?.focus();
        return;
      }

      if (!dateValue) {
        document.getElementById('mobileEventDate')?.focus();
        return;
      }

      // Check for edit mode - either from mobileEditingId or from dataset.editingId (set by startEdit)
      const editId = mobileEditingId || mobileEventSheet?.dataset?.editingId;

      if (editId) {
        // Edit mode - update existing event using context
        if (window.ctx && window.ctx.updateInCloud) {
          const existingEvents = window.ctx.events || [];
          const existingEvent = existingEvents.find(e => e.id === editId);
          if (existingEvent) {
            window.ctx.updateInCloud(editId, {
              ...existingEvent,
              name: name,
              date: new Date(dateValue).toISOString(),
              reminder: Number.parseInt(reminder) || null,
              reminderUserSet: (Number.parseInt(reminder) || 0) > 0,
              notes: notes
            });
          }
        }
        closeMobileEventSheet();
        return;
      }

      // Add mode - Sync values to the original form inputs and trigger add
      const originalName = document.getElementById('eventName');
      const originalDate = document.getElementById('eventDate');
      const originalReminder = document.getElementById('eventReminder');
      const originalNotes = document.getElementById('eventNotes');
      const addBtn = document.getElementById('addBtn');

      if (originalName) originalName.value = name;
      if (originalDate) originalDate.value = dateValue;
      if (originalReminder) originalReminder.value = reminder;
      if (originalNotes) originalNotes.value = notes;

      // Trigger the existing add event logic
      addBtn?.click();

      // Close the sheet
      closeMobileEventSheet();
    });

    // FAB click handler - context-aware action
    mobileFab?.addEventListener('click', (e) => {
      e.preventDefault(); // Prevent double taps or focus issues
      const activeNavItem = document.querySelector('.mobile-nav-item.active');
      // Default to countdown if detection fails
      const currentView = activeNavItem?.dataset.view || window.currentView || 'countdown';


      switch (currentView) {
        case 'countdown':
          // Open bottom sheet for adding event
          openMobileEventSheet();
          break;
        case 'tasks':
          // Open quick-add task sheet
          if (window.openMobileQuickAddSheet) {
            window.openMobileQuickAddSheet();
          } else {
            // Fallback: focus on task input
            const taskInput = document.getElementById('newTaskTitle');
            if (taskInput) {
              taskInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setTimeout(() => taskInput.focus(), 300);
            }
          }
          break;
        case 'pomodoro':
          // Start/pause pomodoro
          const pomodoroStartBtn = document.querySelector('.pomodoro-btn.primary');
          pomodoroStartBtn?.click();
          break;
        case 'planner':
          // Open planner add task
          const plannerAddBtn = document.querySelector('.planner-add-task-btn');
          plannerAddBtn?.click();
          break;
        case 'calendar':
          // Open bottom sheet for adding event
          openMobileEventSheet();
          break;
        default:
          openMobileEventSheet();
          break;
      }
    });
  })();



  // ============ AUTO-DELETE SETTINGS & CLEANUP ============
  function initAutoDeleteSettings() {
    const toggle = document.getElementById('autoDeleteToggle');
    const container = document.getElementById('taskSettingsPopover');
    const btn = document.getElementById('taskSettingsBtn');

    const context = (typeof ctx !== 'undefined') ? ctx : window.ctx;
    const storageKey = context?.STORAGE_KEYS?.SETTINGS_AUTO_DELETE || 'countdown-settings-auto-delete';

    if (!toggle || !container || !btn) return;

    // Load initial state
    const savedState = localStorage.getItem(storageKey);
    toggle.checked = savedState === 'true';

    // Toggle Listener
    toggle.addEventListener('change', (e) => {
      const isEnabled = e.target.checked;
      localStorage.setItem(storageKey, isEnabled);
      if (isEnabled) {
        runAutoDeleteCleanup();
      }
    });

    // Popover Logic
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = container.style.display === 'block';
      container.style.display = isVisible ? 'none' : 'block';
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target) && e.target !== btn) {
        if (container.style.display === 'block') {
          container.style.display = 'none';
        }
      }
    });
  }

  function runAutoDeleteCleanup() {
    // Use window.ctx if available globally, or try to access the imported ctx
    // Since this function is called via setTimeout from renderTasks, scope might be an issue.
    // We will access ctx from window if possible, or fallback.
    const context = (typeof ctx !== 'undefined') ? ctx : window.ctx;

    if (!context) {
      console.warn('[AutoDelete] CTX not found, skipping cleanup.');
      return;
    }

    const storageKey = context.STORAGE_KEYS?.SETTINGS_AUTO_DELETE || 'countdown-settings-auto-delete';
    const isEnabled = localStorage.getItem(storageKey) === 'true';

    const tasksList = window.ctx?.tasks || [];
    if (!isEnabled || !tasksList || tasksList.length === 0) return;

    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let deletedCount = 0;

    // Filter tasks to delete
    const tasksToDelete = tasksList.filter(t => {
      // 1. Completed tasks older than 30 days
      if (t.completed && t.completedAt) {
        const completedTime = new Date(t.completedAt).getTime();
        if (!Number.isNaN(completedTime) && (now - completedTime) > thirtyDaysMs) return true;
      }

      // 2. Active tasks overdue by more than 30 days
      if (!t.completed && t.dueDate) {
        const dueTime = new Date(t.dueDate).getTime();
        if (!Number.isNaN(dueTime) && (now - dueTime) > thirtyDaysMs) return true;
      }

      return false;
    });

    if (tasksToDelete.length > 0) {
      console.log(`[AutoDelete] Found ${tasksToDelete.length} tasks to delete.`);
      tasksToDelete.forEach(task => {
        if (window.ctx?.removeTask) window.ctx.removeTask(task);
        deletedCount++;
      });
      if (deletedCount > 0) {
        console.log(`[AutoDelete] Successfully deleted ${deletedCount} old tasks.`);
      }
    }
  }

  // Expose cleanup to window so renderTasks can find it
  window.runAutoDeleteCleanup = runAutoDeleteCleanup;
  window.runAutoDeleteEventsCleanup = runAutoDeleteEventsCleanup;

  // --- Countdown Settings ---
  function initCountdownSettings() {
    const toggle = document.getElementById('autoDeleteEventsToggle');
    const container = document.getElementById('countdownSettingsPopover');
    const btn = document.getElementById('countdownSettingsBtn');

    const context = (typeof ctx !== 'undefined') ? ctx : window.ctx;
    const storageKey = context?.STORAGE_KEYS?.SETTINGS_AUTO_DELETE_EVENTS || 'countdown-settings-auto-delete-events';

    if (!toggle || !container || !btn) return;

    // Load initial state
    const savedState = localStorage.getItem(storageKey);
    toggle.checked = savedState === 'true';

    // Toggle Listener
    toggle.addEventListener('change', (e) => {
      const isEnabled = e.target.checked;
      localStorage.setItem(storageKey, isEnabled);
      if (isEnabled) {
        runAutoDeleteEventsCleanup();
      }
    });

    // Popover Logic
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = container.style.display === 'block';
      container.style.display = isVisible ? 'none' : 'block';
    });

    // Close on outside click is handled by the global click listener
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target) && !btn.contains(e.target)) {
        container.style.display = 'none';
      }
    });
  }

  function runAutoDeleteEventsCleanup() {
    const context = (typeof ctx !== 'undefined') ? ctx : window.ctx;
    if (!context) return;

    const storageKey = context.STORAGE_KEYS?.SETTINGS_AUTO_DELETE_EVENTS || 'countdown-settings-auto-delete-events';
    const isEnabled = localStorage.getItem(storageKey) === 'true';

    if (!isEnabled) return;

    const eventsList = (typeof context.getActiveEvents === 'function') ? context.getActiveEvents() : (context.events || []);
    if (!eventsList || eventsList.length === 0) return;

    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let deletedCount = 0;

    const eventsToDelete = eventsList.filter(evt => {
      if (!evt.date) return false;
      const eventTime = new Date(evt.date).getTime();
      if (Number.isNaN(eventTime)) return false;
      // Delete if event was more than 30 days ago
      return (now - eventTime) > thirtyDaysMs;
    });

    if (eventsToDelete.length > 0) {
      console.log(`[AutoDeleteEvents] Found ${eventsToDelete.length} events to delete.`);
      eventsToDelete.forEach(evt => {
        if (typeof context.deleteFromCloud === 'function') {
          context.deleteFromCloud(evt.id);
          deletedCount++;
        }
      });
      if (deletedCount > 0) {
        console.log(`[AutoDeleteEvents] Successfully deleted ${deletedCount} old events.`);
      }
    }
  }

  // Initialize Settings
  // Initialize Settings with robust polling
  try {
    const checkCtx = (attempts = 0) => {
      if (typeof window.ctx !== 'undefined') {
        initAutoDeleteSettings();
        initCountdownSettings();
      } else if (attempts < 20) {
        // Poll every 500ms for up to 10 seconds
        setTimeout(() => checkCtx(attempts + 1), 500);
      } else {
        console.warn('CTX not defined for AutoDeleteSettings after 10s');
      }
    };

    checkCtx();
  } catch (e) {
    console.error('Error initializing AutoDeleteSettings:', e);
  }
}
