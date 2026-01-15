import { ctx } from './context.js';

export function initUi() {
  const shortcutsModal = document.getElementById('shortcutsModal');
  const shortcutsClose = document.getElementById('shortcutsClose');
  const helpShortcuts = document.getElementById('helpShortcuts');
  const guideModal = document.getElementById('guideModal');
  const guideClose = document.getElementById('guideClose');
  const commandPaletteEl = document.getElementById('commandPalette');
  const commandPaletteInput = document.getElementById('commandPaletteInput');
  const commandPaletteResults = document.getElementById('commandPaletteResults');

  let shortcutsLastFocus = null;
  let guideLastFocus = null;
  let commandPaletteSelectedIndex = 0;
  let commandPaletteItems = [];

  const isEditableTarget = (el) => {
    if (!el) return false;
    const tag = el.tagName;
    return el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  };

  const openShortcuts = () => {
    if (!shortcutsModal) return;
    shortcutsLastFocus = document.activeElement;
    shortcutsModal.classList.add('open');
  };

  const closeShortcuts = () => {
    if (!shortcutsModal) return;
    shortcutsModal.classList.remove('open');
    if (shortcutsLastFocus && typeof shortcutsLastFocus.focus === 'function') {
      shortcutsLastFocus.focus();
    }
    shortcutsLastFocus = null;
  };

  const toggleShortcuts = () => {
    if (!shortcutsModal) return;
    shortcutsModal.classList.contains('open') ? closeShortcuts() : openShortcuts();
  };

  if (shortcutsClose) shortcutsClose.onclick = closeShortcuts;

  const openGuide = () => {
    if (!guideModal) return;
    guideLastFocus = document.activeElement;
    guideModal.classList.add('open');
  };

  const closeGuide = () => {
    if (!guideModal) return;
    guideModal.classList.remove('open');
    if (guideLastFocus && typeof guideLastFocus.focus === 'function') {
      guideLastFocus.focus();
    }
    guideLastFocus = null;
  };

  const toggleGuide = () => {
    if (!guideModal) return;
    guideModal.classList.contains('open') ? closeGuide() : openGuide();
  };

  if (guideClose) guideClose.onclick = closeGuide;
  if (guideModal) {
    guideModal.addEventListener('click', (e) => {
      if (e.target === guideModal) closeGuide();
    });
  }

  // H key opens/closes guide modal

  if (shortcutsModal) {
    shortcutsModal.addEventListener('click', (e) => {
      if (e.target === shortcutsModal) closeShortcuts();
    });
  }
  if (helpShortcuts) helpShortcuts.onclick = openShortcuts;

  const focusQuickAdd = () => {
    if (ctx.currentView === 'tasks') {
      if (ctx.quickAddRow) ctx.quickAddRow.style.display = 'flex';
      if (ctx.newTaskTitle) {
        ctx.newTaskTitle.focus();
        if (typeof ctx.newTaskTitle.select === 'function') ctx.newTaskTitle.select();
      }
      return;
    }
    if (typeof ctx.showView === 'function' && ctx.currentView !== 'countdown') ctx.showView('countdown');
    if (ctx.eventName) {
      ctx.eventName.focus();
      if (typeof ctx.eventName.select === 'function') ctx.eventName.select();
    }
    if (ctx.inputPanel) ctx.inputPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const goToToday = () => {
    if (ctx.currentView === 'tasks') {
      ctx.currentTaskMonth = new Date();
      if (typeof ctx.renderTaskCalendar === 'function') ctx.renderTaskCalendar();
      return;
    }
    if (typeof ctx.showView === 'function' && ctx.currentView !== 'countdown') ctx.showView('countdown');
    ctx.currentMonth = new Date();
    if (typeof ctx.renderCalendar === 'function') ctx.renderCalendar();
  };

  const openPomodoro = () => {
    if (typeof ctx.showView === 'function') ctx.showView('pomodoro');
  };

  const closePomodoro = () => {
    if (typeof ctx.showView === 'function') ctx.showView('countdown');
  };

  const toggleCalendarSidebar = () => {
    if (typeof ctx.showView === 'function' && ctx.currentView !== 'countdown') ctx.showView('countdown');
    const toggleBtn = document.getElementById('toggleSidebar');
    if (toggleBtn) toggleBtn.click();
  };

  const openTasksView = () => {
    if (typeof ctx.showView === 'function') ctx.showView('tasks');
  };

  const openCountdownView = () => {
    if (typeof ctx.showView === 'function') ctx.showView('countdown');
  };

  const focusTaskSearch = () => {
    if (typeof ctx.showView === 'function' && ctx.currentView !== 'tasks') ctx.showView('tasks');
    if (ctx.taskSearch) {
      ctx.taskSearch.focus();
      if (typeof ctx.taskSearch.select === 'function') ctx.taskSearch.select();
    }
  };

  const toggleTheme = () => {
    if (ctx.themeToggle) ctx.themeToggle.click();
  };

  document.addEventListener('keydown', (e) => {
    if (!e.key) return; // Guard against undefined key
    if (e.key.toLowerCase() === 'h' && !isEditableTarget(e.target)) {
      e.preventDefault();
      toggleGuide();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isEditableTarget(e.target)) return;
    const key = e.key.toLowerCase();
    if (key === 'n') {
      e.preventDefault();
      focusQuickAdd();
    } else if (key === 't') {
      e.preventDefault();
      goToToday();
    } else if (key === 'p') {
      e.preventDefault();
      openPomodoro();
    } else if (key === 'c') {
      e.preventDefault();
      toggleCalendarSidebar();
    } else if (key === 'm') {
      e.preventDefault();
      openTasksView();
    } else if (key === 'g') {
      e.preventDefault();
      openCountdownView();
    } else if (key === '/') {
      e.preventDefault();
      focusTaskSearch();
    } else if (key === 'd') {
      e.preventDefault();
      toggleTheme();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const cmdPalette = document.getElementById('commandPalette');
      if (cmdPalette && cmdPalette.classList.contains('open')) {
        closeCommandPalette();
        return;
      }
      if (shortcutsModal && shortcutsModal.classList.contains('open')) {
        closeShortcuts();
        return;
      }
      if (typeof ctx.hideContextMenu === 'function') ctx.hideContextMenu();
      if (typeof ctx.hideAddEventContextMenu === 'function') ctx.hideAddEventContextMenu();
      if (typeof ctx.hideEventContextMenu === 'function') ctx.hideEventContextMenu();

      const tEditModal = document.getElementById('taskEditModal');
      if (tEditModal && tEditModal.classList.contains('open')) {
        if (typeof ctx.closeTaskEditModal === 'function') ctx.closeTaskEditModal();
        return;
      }
      const tmOverlay = document.getElementById('taskManagerOverlay');
      if (tmOverlay && tmOverlay.classList.contains('open')) {
        if (typeof ctx.showView === 'function') ctx.showView('countdown');
        return;
      }
      const pOverlay = document.getElementById('pomodoroOverlay');
      if (pOverlay && pOverlay.classList.contains('open')) {
        if (typeof ctx.showView === 'function') ctx.showView('countdown');
        return;
      }
      if (ctx.eventAlertModal && ctx.eventAlertModal.classList.contains('open')) {
        if (typeof ctx.closeEventAlert === 'function') ctx.closeEventAlert();
        return;
      }
      if (ctx.dayDrawer && ctx.dayDrawer.classList.contains('open')) {
        if (typeof ctx.closeDayDrawer === 'function') ctx.closeDayDrawer();
        return;
      }
      if (ctx.clearModal && ctx.clearModal.classList.contains('open')) {
        if (typeof ctx.closeClearModal === 'function') ctx.closeClearModal();
        return;
      }
      if (ctx.editingId) {
        if (typeof ctx.cancelEdit === 'function') ctx.cancelEdit();
        return;
      }
    }
  });

  const COMMANDS = [
    { id: 'newTask', icon: '✅', label: 'משימה חדשה', shortcut: 'N', action: () => { if (typeof ctx.showView === 'function') ctx.showView('tasks'); setTimeout(() => ctx.newTaskTitle?.focus(), 100); } },
    { id: 'newEvent', icon: '📅', label: 'אירוע חדש', shortcut: 'G', action: () => { if (typeof ctx.showView === 'function') ctx.showView('countdown'); setTimeout(() => ctx.eventName?.focus(), 100); } },
    { id: 'goToday', icon: '📆', label: 'עבור להיום', shortcut: 'T', action: goToToday },
    { id: 'openPomodoro', icon: '🍅', label: 'פתח פומודורו', shortcut: 'P', action: openPomodoro },
    { id: 'openTasks', icon: '📋', label: 'עבור למשימות', shortcut: 'M', action: openTasksView },
    { id: 'openCountdown', icon: '⏱️', label: 'עבור לספירה לאחור', shortcut: 'G', action: openCountdownView },
    { id: 'toggleCalendar', icon: '📅', label: 'הצג/הסתר לוח שנה', shortcut: 'C', action: toggleCalendarSidebar },
    { id: 'toggleTheme', icon: '🌙', label: 'מצב כהה/בהיר', shortcut: 'D', action: toggleTheme },
    { id: 'openGuide', icon: '❓', label: 'מדריך ועזרה', shortcut: 'H', action: openGuide },
    { id: 'search', icon: '🔍', label: 'חפש משימות', shortcut: '/', action: focusTaskSearch }
  ];

  function openCommandPalette() {
    if (!commandPaletteEl) return;
    commandPaletteEl.classList.add('open');
    commandPaletteInput.value = '';
    commandPaletteSelectedIndex = 0;
    renderCommandPaletteResults('');
    setTimeout(() => commandPaletteInput.focus(), 50);
  }

  function closeCommandPalette() {
    if (!commandPaletteEl) return;
    commandPaletteEl.classList.remove('open');
  }

  function toggleCommandPalette() {
    if (!commandPaletteEl) return;
    commandPaletteEl.classList.contains('open') ? closeCommandPalette() : openCommandPalette();
  }

  function renderCommandPaletteResults(query) {
    if (!commandPaletteResults) return;
    const q = query.trim().toLowerCase();
    commandPaletteItems = COMMANDS.filter(cmd => cmd.label.toLowerCase().includes(q) || cmd.shortcut.toLowerCase().includes(q));
    if (commandPaletteItems.length === 0) {
      commandPaletteResults.innerHTML = '<div class="command-palette-empty">No results</div>';
      return;
    }
    commandPaletteResults.innerHTML = commandPaletteItems.map((cmd, idx) => {
      const isActive = idx === commandPaletteSelectedIndex ? 'active' : '';
      return `
        <div class="command-palette-item ${isActive}" data-id="${cmd.id}">
          <div class="command-palette-icon">${cmd.icon}</div>
          <div class="command-palette-label">${cmd.label}</div>
          <div class="command-palette-shortcut">${cmd.shortcut}</div>
        </div>
      `;
    }).join('');
  }

  if (commandPaletteInput) {
    commandPaletteInput.addEventListener('input', () => {
      commandPaletteSelectedIndex = 0;
      renderCommandPaletteResults(commandPaletteInput.value);
    });

    commandPaletteInput.addEventListener('keydown', (e) => {
      if (!commandPaletteItems.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        commandPaletteSelectedIndex = (commandPaletteSelectedIndex + 1) % commandPaletteItems.length;
        renderCommandPaletteResults(commandPaletteInput.value);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        commandPaletteSelectedIndex = (commandPaletteSelectedIndex - 1 + commandPaletteItems.length) % commandPaletteItems.length;
        renderCommandPaletteResults(commandPaletteInput.value);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = commandPaletteItems[commandPaletteSelectedIndex];
        if (cmd) {
          cmd.action();
          closeCommandPalette();
        }
      } else if (e.key === 'Escape') {
        closeCommandPalette();
      }
    });
  }

  if (commandPaletteResults) {
    commandPaletteResults.addEventListener('click', (e) => {
      const item = e.target.closest('.command-palette-item');
      if (!item) return;
      const cmd = commandPaletteItems.find(c => c.id === item.dataset.id);
      if (cmd) {
        cmd.action();
        closeCommandPalette();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      toggleCommandPalette();
    }
  });

  return {
    openShortcuts,
    closeShortcuts,
    toggleShortcuts,
    openGuide,
    closeGuide,
    toggleGuide,
    openCommandPalette,
    closeCommandPalette,
    toggleCommandPalette,
    focusQuickAdd,
    goToToday,
    openPomodoro,
    closePomodoro,
    toggleCalendarSidebar,
    openTasksView,
    openCountdownView,
    focusTaskSearch,
    toggleTheme
  };
}
