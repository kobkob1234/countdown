import { ctx } from '../context.js';

const $ = id => document.getElementById(id);

// ============ 14. DAILY PLANNER ============
// Extracted from main.js - reads dependencies from ctx

export function initDailyPlanner() {
  // Read dependencies from ctx
  const { db, ref, set, get, onValue, push, remove, currentUser, escapeHtml,
          showSystemNotification, showEventAlert, getAudioContext,
          notifiedPlannerBlocks, reminderCheckState,
          getReminderWindow, persistLastCheck,
          wasDedupeKeySeen, markDedupeKeySeen,
          persistNotifiedMap, pruneNotifiedMap, NOTIFY_KEYS, REMINDER_CATCHUP_MAX_COUNT } = ctx;

  // Dynamic getters for reactive data (these arrays change over time)
  const getTasks = () => ctx.tasks || [];
  const getEvents = () => ctx.events || [];
  const getSubjects = () => ctx.subjects || [];

  // State
  let currentDate = new Date();
  let plannerView = 'day'; // 'day' or 'week'
  let plannerBlocks = [];
  let editingBlockId = null;
  let miniCalendarDate = new Date();
  let initialized = false;
  let blocksLoaded = false;
  let plannerReminderTickerHandle = null;
  let plannerReminderCheckInFlight = false;
  let plannerUpdatedAt = 0;

  // Storage key
  const STORAGE_KEY = 'dailyPlannerBlocks';
  const UPDATED_AT_KEY = 'dailyPlannerBlocksUpdatedAt';

  // DOM References
  const refs = {
    overlay: null,
    currentDate: null,
    prevDay: null,
    nextDay: null,
    todayBtn: null,
    viewToggle: null,
    timeline: null,
    dayView: null,
    weekView: null,
    miniGrid: null,
    miniTitle: null,
    quickTasks: null,
    addModal: null,
    totalBlocks: null,
    totalHours: null,
    completedBlocks: null,
    progress: null,
    dayTitle: null,
    daySummary: null,
    countdownsList: null,
    scheduledTasksList: null,
    syncAllBtn: null,
    syncCountdownsBtn: null,
    syncTasksBtn: null,
    aiDayPlanModal: null,
    aiDayPlanList: null,
    aiDayPlanTitle: null,
    aiDayPlanDesc: null,
    aiApplyPlanMergeBtn: null,
    aiApplyPlanReplaceBtn: null,
    aiCancelPlanBtn: null
  };

  // Hebrew day names
  const hebrewDays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const hebrewMonths = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

  // Priority colors
  const priorityColors = {
    urgent: { color: '#ef4444', bg: '#fef2f2' },
    high: { color: '#f97316', bg: '#fff7ed' },
    medium: { color: '#eab308', bg: '#fefce8' },
    low: { color: '#22c55e', bg: '#f0fdf4' },
    none: { color: '#6b7280', bg: '#f3f4f6' }
  };

  // Category icons
  const categoryIcons = {
    work: '<span class="icon" style="font-size:16px;vertical-align:middle">work</span>',
    study: '<span class="icon" style="font-size:16px;vertical-align:middle">school</span>',
    health: '<span class="icon" style="font-size:16px;vertical-align:middle">directions_run</span>',
    personal: '<span class="icon" style="font-size:16px;vertical-align:middle">home</span>',
    social: '<span class="icon" style="font-size:16px;vertical-align:middle">group</span>',
    creative: '<span class="icon" style="font-size:16px;vertical-align:middle">palette</span>',
    rest: '<span class="icon" style="font-size:16px;vertical-align:middle">self_improvement</span>'
  };

  // Templates
  const templates = {
    morning: [
      { title: 'התעוררות והתארגנות', start: '06:00', duration: 30, priority: 'medium', category: 'personal' },
      { title: 'ארוחת בוקר', start: '06:30', duration: 30, priority: 'low', category: 'health' },
      { title: 'פעילות גופנית', start: '07:00', duration: 45, priority: 'high', category: 'health' },
      { title: 'מקלחת והתארגנות', start: '07:45', duration: 30, priority: 'medium', category: 'personal' }
    ],
    work: [
      { title: 'בדיקת מיילים ותכנון יום', start: '09:00', duration: 30, priority: 'medium', category: 'work' },
      { title: 'עבודה ממוקדת - בלוק 1', start: '09:30', duration: 90, priority: 'high', category: 'work' },
      { title: 'הפסקה קצרה', start: '11:00', duration: 15, priority: 'low', category: 'rest' },
      { title: 'עבודה ממוקדת - בלוק 2', start: '11:15', duration: 90, priority: 'high', category: 'work' },
      { title: 'ארוחת צהריים', start: '12:45', duration: 45, priority: 'medium', category: 'health' },
      { title: 'פגישות / שיחות', start: '13:30', duration: 60, priority: 'medium', category: 'work' },
      { title: 'עבודה ממוקדת - בלוק 3', start: '14:30', duration: 90, priority: 'high', category: 'work' },
      { title: 'סיכום יום ותכנון מחר', start: '16:00', duration: 30, priority: 'medium', category: 'work' }
    ],
    study: [
      { title: 'לימוד - נושא ראשי', start: '08:00', duration: 90, priority: 'high', category: 'study' },
      { title: 'הפסקה וחטיף', start: '09:30', duration: 15, priority: 'low', category: 'rest' },
      { title: 'תרגול ופתרון בעיות', start: '09:45', duration: 60, priority: 'high', category: 'study' },
      { title: 'ארוחת צהריים', start: '10:45', duration: 45, priority: 'medium', category: 'health' },
      { title: 'לימוד - נושא משני', start: '11:30', duration: 75, priority: 'medium', category: 'study' },
      { title: 'הפסקה ארוכה', start: '12:45', duration: 30, priority: 'low', category: 'rest' },
      { title: 'חזרה וסיכום', start: '13:15', duration: 60, priority: 'medium', category: 'study' },
      { title: 'הכנת שיעורי בית', start: '14:15', duration: 90, priority: 'high', category: 'study' }
    ],
    relax: [
      { title: 'התעוררות טבעית', start: '09:00', duration: 30, priority: 'low', category: 'rest' },
      { title: 'ארוחת בוקר נינוחה', start: '09:30', duration: 45, priority: 'low', category: 'health' },
      { title: 'קריאה / מדיטציה', start: '10:15', duration: 60, priority: 'low', category: 'rest' },
      { title: 'טיול / פעילות חוץ', start: '11:15', duration: 90, priority: 'medium', category: 'health' },
      { title: 'ארוחת צהריים', start: '12:45', duration: 60, priority: 'low', category: 'health' },
      { title: 'תחביב / פעילות יצירתית', start: '13:45', duration: 120, priority: 'medium', category: 'creative' },
      { title: 'זמן חברתי / משפחתי', start: '16:00', duration: 120, priority: 'medium', category: 'social' }
    ]
  };

  const pruneNotifiedPlannerBlocks = () => {
    const ids = new Set(plannerBlocks.map(b => b.id));
    pruneNotifiedMap(NOTIFY_KEYS.PLANNER, notifiedPlannerBlocks, ids);
  };

  const parseUpdatedAt = (value) => {
    const num = Number.parseInt(value || '0', 10);
    return Number.isFinite(num) ? num : 0;
  };

  const computePlannerBlockStartAt = (block) => {
    if (!block || !block.date || !block.start) return null;
    const parts = String(block.date).split('-').map(Number);
    if (parts.length !== 3) return null;
    const [year, month, day] = parts;
    if (!year || !month || !day) return null;
    const startMinutes = parseTime(block.start);
    if (!Number.isFinite(startMinutes)) return null;
    const hours = Math.floor(startMinutes / 60);
    const minutes = startMinutes % 60;
    const dt = new Date(year, month - 1, day, hours, minutes, 0, 0);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString();
  };

  const normalizePlannerBlocks = () => {
    plannerBlocks.forEach((block) => {
      if (!block || typeof block !== 'object') return;
      const startAtKey = block.date && block.start ? `${block.date}|${block.start}` : '';
      if (!startAtKey) {
        if (block.startAt) delete block.startAt;
        if (block.startAtKey) delete block.startAtKey;
        return;
      }
      if (!block.startAt || block.startAtKey !== startAtKey) {
        const startAt = computePlannerBlockStartAt(block);
        if (startAt) {
          block.startAt = startAt;
          block.startAtKey = startAtKey;
        }
      }
    });
  };

  // Load blocks from storage
  const loadBlocks = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        plannerBlocks = Array.isArray(parsed) ? parsed : [];
      }
      plannerUpdatedAt = parseUpdatedAt(localStorage.getItem(UPDATED_AT_KEY));
      blocksLoaded = true;
      pruneNotifiedPlannerBlocks();
    } catch (e) {
      console.error('Error loading planner blocks:', e);
      plannerBlocks = [];
      plannerUpdatedAt = 0;
      blocksLoaded = true;
      pruneNotifiedPlannerBlocks();
    }
  };

  // Save blocks to storage
  const saveBlocksToCloud = (updatedAt) => {
    if (!currentUser || typeof db === 'undefined') return;
    if (typeof ref !== 'function' || typeof set !== 'function') return;
    const payload = { updatedAt, items: plannerBlocks };
    set(ref(db, `users/${currentUser}/plannerBlocks`), payload).catch((err) => {
      console.warn('[Planner] Cloud save failed:', err);
    });
  };

  const saveBlocks = (options = {}) => {
    try {
      normalizePlannerBlocks();
      const updatedAt = Number.isFinite(options.updatedAt) ? options.updatedAt : Date.now();
      plannerUpdatedAt = updatedAt;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plannerBlocks));
      localStorage.setItem(UPDATED_AT_KEY, String(updatedAt));
      blocksLoaded = true;
      if (!options.skipCloud) saveBlocksToCloud(updatedAt);
    } catch (e) {
      console.error('Error saving planner blocks:', e);
    }
  };

  // Generate unique ID
  const generateId = () => 'block_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

  // Format date for display
  const formatDate = (date) => {
    const day = hebrewDays[date.getDay()];
    const dayNum = date.getDate();
    const month = hebrewMonths[date.getMonth()];
    const year = date.getFullYear();
    return `יום ${day}, ${dayNum} ב${month} ${year}`;
  };

  // Check if two dates are the same day
  const isSameDay = (d1, d2) => {
    return d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();
  };

  // Check if date is today
  const isToday = (date) => isSameDay(date, new Date());

  // Get date string for storage (YYYY-MM-DD)
  const getDateKey = (date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  // Parse time string to minutes from midnight
  const parseTime = (timeStr) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + (m || 0);
  };

  // Format minutes to time string
  const formatTime = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const ensureBlocksLoaded = () => {
    if (!blocksLoaded) loadBlocks();
  };

  let plannerCloudSyncStarted = false;

  const startPlannerCloudSync = () => {
    if (plannerCloudSyncStarted) return;
    if (!currentUser || typeof db === 'undefined' || typeof ref !== 'function' || typeof onValue !== 'function') return;
    plannerCloudSyncStarted = true;
    const plannerRef = ref(db, `users/${currentUser}/plannerBlocks`);
    onValue(plannerRef, (snap) => {
      const data = snap.val();
      if (!data) {
        if (plannerBlocks.length > 0) {
          saveBlocks();
        }
        return;
      }
      const items = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
      if (!Array.isArray(items)) return;
      const updatedAt = parseUpdatedAt(data.updatedAt);
      const shouldApply = updatedAt > plannerUpdatedAt
        || (updatedAt === 0 && plannerUpdatedAt === 0 && plannerBlocks.length === 0 && items.length > 0);
      if (!shouldApply) return;
      plannerBlocks = items;
      if (updatedAt === 0) {
        saveBlocks();
      } else {
        saveBlocks({ updatedAt, skipCloud: true });
      }
      render();
    }, (error) => {
      console.warn('[Planner] Cloud sync failed:', error);
    });
  };

  const parsePlannerBlockDateTime = (block) => {
    if (!block) return null;
    if (block.startAt) {
      const dt = new Date(block.startAt);
      if (!Number.isNaN(dt.getTime())) return dt;
    }
    if (!block.date || !block.start) return null;
    const parts = String(block.date).split('-').map(Number);
    if (parts.length !== 3) return null;
    const [year, month, day] = parts;
    if (!year || !month || !day) return null;
    const startMinutes = parseTime(block.start);
    if (!Number.isFinite(startMinutes)) return null;
    const hours = Math.floor(startMinutes / 60);
    const minutes = startMinutes % 60;
    const dt = new Date(year, month - 1, day, hours, minutes, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  };

  const formatPlannerReminderMessage = (block) => {
    const blockDate = parsePlannerBlockDateTime(block);
    if (!blockDate) return 'מתחיל בקרוב';
    const dateStr = blockDate.toLocaleDateString('he-IL', { weekday: 'long', month: 'short', day: 'numeric' });
    const timeStr = blockDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    return `מתחיל ב-${timeStr} • ${dateStr}`;
  };

  async function checkPlannerReminders(nowMs = Date.now()) {
    if (plannerReminderCheckInFlight) return;
    plannerReminderCheckInFlight = true;
    try {
      ensureBlocksLoaded();
      pruneNotifiedPlannerBlocks();
      const state = reminderCheckState.planner;
      const { start, isCatchup } = getReminderWindow(state.lastCheck, nowMs);
      const candidates = [];

      plannerBlocks.forEach(block => {
        if (!block || block.completed) return;
        const reminderMinutes = Number.parseInt(block.reminder, 10) || 0;
        if (!reminderMinutes) return;
        const blockTime = parsePlannerBlockDateTime(block);
        if (!blockTime) return;
        const reminderKey = `${block.date || ''}|${block.start || ''}|${reminderMinutes}`;
        const entry = notifiedPlannerBlocks.get(block.id);
        if (entry && entry.key === reminderKey) return;
        const triggerTime = blockTime.getTime() - (reminderMinutes * 60000);
        if (triggerTime < start || triggerTime > nowMs) return;
        // Dedupe key matches server format: planner|user|blockKey|startAt||date|start|reminder
        const blockKey = block.id || `${block.title || ''}|${block.date || ''}|${block.start || ''}`;
        const dedupeKey = `planner|${currentUser || ''}|${blockKey}|${block.startAt || block.date || ''}|${block.start || ''}|${reminderMinutes}`;
        candidates.push({ block, reminderKey, triggerTime, dedupeKey });
      });

      if (candidates.length) {
        if (isCatchup && candidates.length > REMINDER_CATCHUP_MAX_COUNT) {
          candidates.sort((a, b) => b.triggerTime - a.triggerTime);
          candidates.length = REMINDER_CATCHUP_MAX_COUNT;
        } else {
          candidates.sort((a, b) => a.triggerTime - b.triggerTime);
        }
        for (const item of candidates) {
          if (item.dedupeKey && await wasDedupeKeySeen(item.dedupeKey, nowMs)) {
            notifiedPlannerBlocks.set(item.block.id, { key: item.reminderKey, ts: nowMs });
            continue;
          }
          if (item.dedupeKey) await markDedupeKeySeen(item.dedupeKey, nowMs);
          const title = `תזכורת יומן יומי: ${item.block.title || 'פעילות'}`;
          const message = formatPlannerReminderMessage(item.block);
          showSystemNotification(title, {
            body: message,
            tag: `planner-${item.block.id}`,
            renotify: true
          }).catch(() => { });
          showEventAlert(title, message, true);
          notifiedPlannerBlocks.set(item.block.id, { key: item.reminderKey, ts: nowMs });
        }
        persistNotifiedMap(NOTIFY_KEYS.PLANNER, notifiedPlannerBlocks);
      }

      state.lastCheck = nowMs;
      persistLastCheck(state, nowMs);
    } catch (e) {
      console.warn('[Notifications] Planner reminder check failed:', e);
    } finally {
      plannerReminderCheckInFlight = false;
    }
  }

  const startPlannerReminderTicker = () => {
    if (plannerReminderTickerHandle) return;
    ensureBlocksLoaded();
    startPlannerCloudSync();
    checkPlannerReminders();
    plannerReminderTickerHandle = setInterval(() => {
      checkPlannerReminders();
    }, 10000);
  };

  // Ensure recurring blocks are instantiated for the target date
  const ensureRecurringForDate = (date) => {
    const dateKey = getDateKey(date);
    let created = 0;
    plannerBlocks
      .filter(b => b.repeat)
      .forEach(base => {
        if (!base.date) return;
        const baseDate = new Date(base.date);
        // Only create occurrences after (or same as) the base date
        if (baseDate > date || isSameDay(baseDate, date)) return;
        // Avoid duplicate clones
        const alreadyExists = plannerBlocks.some(b => b.originId === (base.originId || base.id) && b.date === dateKey);
        if (alreadyExists) return;
        const clone = {
          ...base,
          id: generateId(),
          date: dateKey,
          completed: false,
          repeat: false, // clones themselves do not auto-repeat; the base drives future creation
          originId: base.originId || base.id,
          createdAt: new Date().toISOString()
        };
        plannerBlocks.push(clone);
        created++;
      });
    if (created > 0) saveBlocks();
  };

  // Get blocks for a specific date
  const getBlocksForDate = (date) => {
    ensureRecurringForDate(date);
    const dateKey = getDateKey(date);
    return plannerBlocks
      .filter(b => b.date === dateKey)
      .sort((a, b) => parseTime(a.start) - parseTime(b.start));
  };

  // Calculate stats for a date
  const calculateStats = (date) => {
    const blocks = getBlocksForDate(date);
    const total = blocks.length;
    const completed = blocks.filter(b => b.completed).length;
    const totalMinutes = blocks.reduce((sum, b) => sum + (b.duration || 60), 0);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, hours, mins, progress, totalMinutes };
  };

  // Update stats display
  const updateStats = () => {
    const stats = calculateStats(currentDate);

    if (refs.totalBlocks) refs.totalBlocks.textContent = stats.total;
    if (refs.totalHours) {
      refs.totalHours.textContent = stats.mins > 0 ? `${stats.hours}:${String(stats.mins).padStart(2, '0')} שעות` : `${stats.hours} שעות`;
    }
    if (refs.completedBlocks) refs.completedBlocks.textContent = stats.completed;
    if (refs.progress) refs.progress.textContent = `${stats.progress}%`;
    if (refs.daySummary) {
      refs.daySummary.textContent = `${stats.total} פעילויות • ${stats.hours}:${String(stats.mins).padStart(2, '0')} שעות`;
    }
  };

  // Render timeline for day view
  const renderTimeline = () => {
    if (!refs.timeline) return;

    const blocks = getBlocksForDate(currentDate);
    const now = new Date();
    const isCurrentDay = isToday(currentDate);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let html = '';

    // Generate hour rows (6 AM to 11 PM)
    for (let hour = 6; hour <= 23; hour++) {
      const hourLabel = `${String(hour).padStart(2, '0')}:00`;
      const hourMinutes = hour * 60;

      // Find blocks that start in this hour
      const hourBlocks = blocks.filter(b => {
        const startMin = parseTime(b.start);
        return startMin >= hourMinutes && startMin < hourMinutes + 60;
      });

      html += `
      <div class="planner-hour-row" data-hour="${hour}">
        <div class="planner-hour-label">${hourLabel}</div>
        <div class="planner-hour-content" data-hour="${hour}">
          <span class="planner-empty-hour">+ לחץ להוספה</span>
          ${hourBlocks.map(block => renderBlock(block, hourMinutes)).join('')}
          ${isCurrentDay && currentMinutes >= hourMinutes && currentMinutes < hourMinutes + 60 ? renderNowLine(currentMinutes - hourMinutes) : ''}
        </div>
      </div>
    `;
    }

    refs.timeline.innerHTML = html;

    // Add click handlers for hour content
    refs.timeline.querySelectorAll('.planner-hour-content').forEach(el => {
      el.addEventListener('click', (e) => {
        if (Date.now() < suppressBlockClickUntil) return;
        if (e.target.closest('.planner-block')) return;
        const hour = Number.parseInt(el.dataset.hour);
        openAddModal(hour);
      });

      // Drag and drop handlers for tasks from sidebar
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.classList.add('drop-target');
      });
      el.addEventListener('dragleave', () => {
        el.classList.remove('drop-target');
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drop-target');
        const taskId = e.dataTransfer.getData('text/plain');
        if (taskId) {
          handleTaskDrop(taskId, Number.parseInt(el.dataset.hour));
        }
      });
    });

    // Add click handlers for blocks
    refs.timeline.querySelectorAll('.planner-block').forEach(el => {
      el.addEventListener('click', (e) => {
        if (Date.now() < suppressBlockClickUntil) return;
        if (e.target.classList.contains('planner-block-resize-handle')) return;
        if (e.target.classList.contains('planner-block-checkbox')) return;
        openEditModal(el.dataset.id);
      });
    });

    // Add checkbox handlers
    refs.timeline.querySelectorAll('.planner-block-checkbox').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleBlockComplete(el.dataset.id);
      });
    });

    // Update day title
    if (refs.dayTitle) {
      const dayName = hebrewDays[currentDate.getDay()];
      const dayLabel = isToday(currentDate) ? 'היום' : (isSameDay(currentDate, new Date(Date.now() + 86400000)) ? 'מחר' : `יום ${dayName}`);
      refs.dayTitle.textContent = `${dayLabel} - יום ${dayName}`;
    }

    updateStats();
  };

  // Handle dropping a task from sidebar onto the timeline
  const handleTaskDrop = (taskId, hour) => {
    // Find the task
    const task = getTasks().find(t => t.id === taskId);
    if (!task) return;

    // Get duration from task or default to 30 minutes
    const duration = task.duration || 30;

    // Create a new block from the task
    const newBlock = {
      id: generateId(),
      title: task.title,
      start: formatTime(hour * 60),
      duration: duration,
      category: '',
      notes: '',
      repeat: false,
      priority: task.priority || 'medium',
      color: task.color || '',
      reminder: 0,
      completed: false,
      date: getDateKey(currentDate),
      createdAt: new Date().toISOString(),
      linkedTaskId: taskId // Link to original task
    };
    plannerBlocks.push(newBlock);

    saveBlocks();
    render();
  };

  // Render a single block
  const renderBlock = (block, hourMinutes) => {
    const startMin = parseTime(block.start);
    const offsetMin = startMin - hourMinutes;
    const duration = block.duration || 60;
    const heightPx = Math.max(15, duration * 1); // 1px per minute, min 15px
    const topPx = offsetMin * 1;

    // Determine compact mode based on duration
    let compactClass = '';
    if (duration <= 15) {
      compactClass = 'extra-compact';
    } else if (duration <= 30) {
      compactClass = 'compact';
    }

    const priority = block.priority || 'none';
    const defaultColors = priorityColors[priority] || priorityColors.none;
    // Use custom color if set, otherwise use priority color
    const blockColor = block.color || defaultColors.color;
    const blockBg = block.color ? `${block.color}20` : defaultColors.bg;
    const categoryIcon = block.category ? (categoryIcons[block.category] || '') : '';
    const endTime = formatTime(startMin + duration);
    const reminderText = block.reminder > 0 ? `<span class="icon" style="font-size:16px;vertical-align:middle">notifications</span> ${block.reminder} דק׳ לפני` : '';

    // Determine notes display for day view (not compact/weekly)
    let notesHtml = '';
    if (!compactClass && block.notes && block.notes.trim()) {
      const notesText = escapeHtml(block.notes.trim());
      const notesLength = block.notes.length;
      // Calculate available space based on duration
      // Each line ~30 chars, each line takes ~14px
      const availableHeight = heightPx - 32; // subtract title and time area
      const maxLines = Math.min(4, Math.max(1, Math.floor(availableHeight / 14)));

      // Determine font size class based on notes length and available lines
      let fontClass = '';
      if (notesLength > maxLines * 40) {
        fontClass = 'tiny-text';
      } else if (notesLength > maxLines * 30) {
        fontClass = 'small-text';
      }

      // Only show notes if we have at least 45px height (45 min+)
      if (duration >= 45) {
        notesHtml = `<div class="planner-block-notes ${fontClass}" style="--notes-lines: ${maxLines};">${notesText}</div>`;
      }
    }

    return `
	        <div class="planner-block priority-${priority} ${block.completed ? 'planner-block-completed' : ''} ${compactClass}" 
	             data-id="${block.id}" 
	             style="top: ${topPx}px; height: ${heightPx}px; --priority-color: ${blockColor}; --priority-bg: ${blockBg};">
	          <div class="planner-block-checkbox ${block.completed ? 'checked' : ''}" data-id="${block.id}"></div>
	          <div class="planner-block-title">${categoryIcon} ${escapeHtml(block.title)}</div>
	          <div class="planner-block-time">${block.start} - ${endTime}${reminderText ? ' · ' + reminderText : ''}</div>
	          ${notesHtml}
	          <div class="planner-block-resize-handle" data-id="${block.id}" aria-label="Resize block"></div>
	        </div>
	      `;
  };

  // Drag/Resize planner blocks directly on the timeline (Google Calendar-like)
  const DAY_START_MINUTES = 6 * 60;
  const DAY_END_MINUTES = 24 * 60;
  const DRAG_SNAP_MINUTES = 15;
  const MIN_BLOCK_MINUTES = 15;
  let suppressBlockClickUntil = 0;
  let timelineDragState = null;
  let timelineGhostEl = null;

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const snapMinutes = (minutes) => Math.round(minutes / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES;

  const getMinuteFromClientY = (clientY) => {
    if (!refs.timeline) return DAY_START_MINUTES;
    const rect = refs.timeline.getBoundingClientRect();
    const y = clientY - rect.top + refs.timeline.scrollTop;
    const minutes = DAY_START_MINUTES + y; // 1px per minute
    return clamp(minutes, DAY_START_MINUTES, DAY_END_MINUTES);
  };

  const getBlocksForCurrentDateExcluding = (blockId) => {
    const dateKey = getDateKey(currentDate);
    return plannerBlocks
      .filter(b => b && b.date === dateKey && b.id !== blockId)
      .filter(b => Number.isFinite(parseTime(b.start)));
  };

  const rangesOverlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && aEnd > bStart;

  const canPlace = (startMinutes, durationMinutes, others) => {
    const endMinutes = startMinutes + durationMinutes;
    if (startMinutes < DAY_START_MINUTES) return false;
    if (endMinutes > DAY_END_MINUTES) return false;
    return !others.some(o => {
      const oStart = parseTime(o.start);
      const oEnd = oStart + (o.duration || 60);
      return rangesOverlap(startMinutes, endMinutes, oStart, oEnd);
    });
  };

  const findNearestNonOverlappingStart = (proposedStart, duration, others) => {
    const minStart = DAY_START_MINUTES;
    const maxStart = DAY_END_MINUTES - duration;
    const base = clamp(snapMinutes(proposedStart), minStart, maxStart);
    if (canPlace(base, duration, others)) return base;
    // Try within closer range first for better UX
    for (let delta = DRAG_SNAP_MINUTES; delta <= 4 * 60; delta += DRAG_SNAP_MINUTES) {
      const forward = base + delta;
      if (forward <= maxStart && canPlace(forward, duration, others)) return forward;
      const backward = base - delta;
      if (backward >= minStart && canPlace(backward, duration, others)) return backward;
    }
    // If still not found, allow placement without checking overlap
    return base;
  };

  const adjustDurationToAvoidOverlap = (startMinutes, desiredDuration, others) => {
    const minDuration = MIN_BLOCK_MINUTES;
    const maxDuration = DAY_END_MINUTES - startMinutes;
    let duration = clamp(desiredDuration, minDuration, maxDuration);
    const desiredEnd = startMinutes + duration;

    let limitingEnd = desiredEnd;
    others.forEach(o => {
      const oStart = parseTime(o.start);
      if (!Number.isFinite(oStart)) return;
      if (oStart <= startMinutes) return;
      if (oStart < limitingEnd) {
        limitingEnd = oStart;
      }
    });

    duration = limitingEnd - startMinutes;
    if (duration < minDuration) duration = minDuration; // Allow minimum duration
    return duration;
  };

  const ensureTimelineGhost = () => {
    if (!refs.timeline) return null;
    // Check if ghost element is still attached to the DOM (it may be destroyed after render())
    if (timelineGhostEl && !refs.timeline.contains(timelineGhostEl)) {
      timelineGhostEl = null;
    }
    if (!timelineGhostEl) {
      timelineGhostEl = document.createElement('div');
      timelineGhostEl.className = 'planner-block-ghost';
      timelineGhostEl.style.display = 'none';
      timelineGhostEl.innerHTML = '<div class="planner-ghost-time"></div>';
      refs.timeline.appendChild(timelineGhostEl);
    }
    // Always recalculate positioning to ensure accuracy
    const timelineRect = refs.timeline.getBoundingClientRect();
    const content = refs.timeline.querySelector('.planner-hour-content');
    if (content) {
      const contentRect = content.getBoundingClientRect();
      const left = contentRect.left - timelineRect.left + 4;
      const right = timelineRect.right - contentRect.right + 4;
      timelineGhostEl.style.left = `${left}px`;
      timelineGhostEl.style.right = `${right}px`;
    } else {
      timelineGhostEl.style.left = '78px';
      timelineGhostEl.style.right = '8px';
    }
    return timelineGhostEl;
  };

  const showGhost = (startMinutes, durationMinutes) => {
    const ghost = ensureTimelineGhost();
    if (!ghost) return;

    // Force re-layout for smooth transition
    ghost.style.display = 'block';
    ghost.dataset.forceReflow = ghost.offsetHeight; // Force reflow

    ghost.style.top = `${startMinutes - DAY_START_MINUTES}px`;
    ghost.style.height = `${Math.max(15, durationMinutes)}px`;

    // Show time range in ghost
    const timeLabel = ghost.querySelector('.planner-ghost-time');
    if (timeLabel) {
      const startTime = formatTime(startMinutes);
      const endTime = formatTime(startMinutes + durationMinutes);
      timeLabel.textContent = `${startTime} - ${endTime} (${durationMinutes} דק׳)`;
    }
  };

  const hideGhost = () => {
    if (!timelineGhostEl) return;
    timelineGhostEl.style.display = 'none';
    // Reset transform and other properties
    timelineGhostEl.style.transform = '';
  };

  const updateBlockTime = (blockId, nextStartMinutes, nextDurationMinutes) => {
    const block = plannerBlocks.find(b => b.id === blockId);
    if (!block) return false;
    block.start = formatTime(nextStartMinutes);
    block.duration = nextDurationMinutes;
    saveBlocks();
    render();
    return true;
  };

  const onTimelinePointerMove = (e) => {
    if (!timelineDragState) return;
    e.preventDefault();
    e.stopPropagation(); // Prevent event bubbling

    const minute = getMinuteFromClientY(e.clientY);
    const movedPx = Math.abs(e.clientY - timelineDragState.startClientY);
    if (movedPx > 3) timelineDragState.moved = true;

    if (timelineDragState.mode === 'move') {
      const proposedStart = minute - timelineDragState.offsetMinutes;
      const start = clamp(snapMinutes(proposedStart), DAY_START_MINUTES, DAY_END_MINUTES - timelineDragState.duration);
      timelineDragState.proposedStart = start;

      // Update ghost with smooth animation
      requestAnimationFrame(() => {
        showGhost(start, timelineDragState.duration);
      });

      // Update cursor
      document.body.style.cursor = 'grabbing';
    } else {
      const end = snapMinutes(minute);
      const duration = clamp(end - timelineDragState.startMinutes, MIN_BLOCK_MINUTES, DAY_END_MINUTES - timelineDragState.startMinutes);
      timelineDragState.proposedDuration = duration;

      // Update ghost with smooth animation
      requestAnimationFrame(() => {
        showGhost(timelineDragState.startMinutes, duration);
      });

      // Update cursor and add resizing class
      document.body.style.cursor = 'ns-resize';
      if (timelineDragState.el) {
        timelineDragState.el.classList.add('resizing');
      }
    }
  };

  const onTimelinePointerUp = (e) => {
    if (!timelineDragState) return;

    const { el, blockId, mode, startMinutes, duration, proposedStart, proposedDuration, moved, pointerId } = timelineDragState;

    // Clean up pointer capture first
    if (el && pointerId !== undefined) {
      try {
        el.releasePointerCapture(pointerId);
      } catch (err) {
        // Ignore errors if capture was already released
      }
    }

    // Remove event listeners before clearing state
    window.removeEventListener('pointermove', onTimelinePointerMove, { passive: false });
    window.removeEventListener('pointerup', onTimelinePointerUp);
    window.removeEventListener('pointercancel', onTimelinePointerUp);

    // Clean up visual state
    document.body.style.cursor = '';
    if (el) {
      el.classList.remove('dragging');
      el.classList.remove('resizing');
    }

    // Hide ghost with animation
    requestAnimationFrame(() => {
      hideGhost();
    });

    // Clear drag state
    timelineDragState = null;

    if (!moved) return;
    suppressBlockClickUntil = Date.now() + 350;

    const others = getBlocksForCurrentDateExcluding(blockId);

    if (mode === 'move') {
      const targetStart = Number.isFinite(proposedStart) ? proposedStart : startMinutes;
      const resolvedStart = findNearestNonOverlappingStart(targetStart, duration, others);
      if (resolvedStart !== null) {
        updateBlockTime(blockId, resolvedStart, duration);
      }
    } else {
      const targetDuration = Number.isFinite(proposedDuration) ? proposedDuration : duration;
      const adjusted = adjustDurationToAvoidOverlap(startMinutes, targetDuration, others);
      if (adjusted !== null) {
        updateBlockTime(blockId, startMinutes, adjusted);
      }
    }
  };

  const onTimelinePointerDown = (e) => {
    const blockEl = e.target.closest('.planner-block');
    if (!blockEl || !refs.timeline || !refs.timeline.contains(blockEl)) return;
    if (e.target.classList.contains('planner-block-checkbox')) return;

    const isResize = !!e.target.closest('.planner-block-resize-handle');
    const blockId = blockEl.dataset.id;
    const block = plannerBlocks.find(b => b.id === blockId);
    if (!block) return;

    e.preventDefault();
    e.stopPropagation();

    const startMinutes = parseTime(block.start);
    const duration = block.duration || 60;
    const minute = getMinuteFromClientY(e.clientY);
    const offsetMinutes = clamp(minute - startMinutes, 0, duration);

    timelineDragState = {
      el: blockEl,
      blockId,
      mode: isResize ? 'resize' : 'move',
      startClientY: e.clientY,
      startMinutes,
      duration,
      offsetMinutes: isResize ? 0 : offsetMinutes,
      moved: false,
      proposedStart: startMinutes,
      proposedDuration: duration,
      pointerId: e.pointerId
    };

    blockEl.classList.add('dragging');
    showGhost(startMinutes, duration);

    // Capture pointer for better tracking
    if (e.pointerId !== undefined) {
      blockEl.setPointerCapture(e.pointerId);
    }

    window.addEventListener('pointermove', onTimelinePointerMove, { passive: false });
    window.addEventListener('pointerup', onTimelinePointerUp);
    window.addEventListener('pointercancel', onTimelinePointerUp);
  };

  // Render current time indicator
  const renderNowLine = (offsetMinutes) => {
    const topPx = offsetMinutes * 1;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return `
    <div class="planner-now-line" style="top: ${topPx}px;">
      <span class="planner-now-label">${timeStr}</span>
    </div>
  `;
  };

  // Render week view
  const renderWeekView = () => {
    if (!refs.weekView) return;

    const startOfWeek = new Date(currentDate);
    const dayOfWeek = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);

    let html = '';

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(date.getDate() + i);
      const blocks = getBlocksForDate(date);
      const isCurrentDay = isToday(date);
      const isSelected = isSameDay(date, currentDate);

      html += `
      <div class="planner-week-day ${isCurrentDay ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-date="${getDateKey(date)}">
        <div class="planner-week-day-header">
          <div class="planner-week-day-name">${hebrewDays[date.getDay()]}</div>
          <div class="planner-week-day-number">${date.getDate()}</div>
        </div>
        <div class="planner-week-day-content">
          ${blocks.slice(0, 8).map(block => `
            <div class="planner-week-block priority-${block.priority || 'none'}" data-id="${block.id}"
                 style="--priority-color: ${(priorityColors[block.priority] || priorityColors.none).color}; --priority-bg: ${(priorityColors[block.priority] || priorityColors.none).bg};">
              <div class="planner-week-block-time">${block.start}</div>
              <div class="planner-week-block-title">${escapeHtml(block.title)}</div>
            </div>
          `).join('')}
          ${blocks.length > 8 ? `<div style="text-align: center; font-size: 11px; color: var(--muted);">+${blocks.length - 8} עוד</div>` : ''}
        </div>
      </div>
    `;
    }

    refs.weekView.innerHTML = html;

    // Add click handlers for week days
    refs.weekView.querySelectorAll('.planner-week-day').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.planner-week-block')) {
          const blockEl = e.target.closest('.planner-week-block');
          openEditModal(blockEl.dataset.id);
        } else {
          const parts = el.dataset.date.split('-');
          currentDate = new Date(parts[0], parts[1] - 1, parts[2]);
          plannerView = 'day';
          updateViewToggle();
          render();
        }
      });
    });

    updateStats();
  };

  // Render mini calendar
  const renderMiniCalendar = () => {
    if (!refs.miniGrid || !refs.miniTitle) return;

    const year = miniCalendarDate.getFullYear();
    const month = miniCalendarDate.getMonth();

    refs.miniTitle.textContent = `${hebrewMonths[month]} ${year}`;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = firstDay.getDay();

    let html = '';

    // Day names
    const dayNames = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
    dayNames.forEach(name => {
      html += `<div class="planner-mini-day-name">${name}</div>`;
    });

    // Empty cells before first day
    for (let i = 0; i < startOffset; i++) {
      const prevDate = new Date(year, month, -(startOffset - i - 1));
      html += `<div class="planner-mini-day other-month" data-date="${getDateKey(prevDate)}">${prevDate.getDate()}</div>`;
    }

    // Days of month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      const hasEvents = getBlocksForDate(date).length > 0;
      const isCurrentDay = isToday(date);
      const isSelected = isSameDay(date, currentDate);

      html += `<div class="planner-mini-day ${isCurrentDay ? 'today' : ''} ${isSelected ? 'selected' : ''} ${hasEvents ? 'has-events' : ''}" data-date="${getDateKey(date)}">${d}</div>`;
    }

    // Empty cells after last day
    const endOffset = 6 - lastDay.getDay();
    for (let i = 1; i <= endOffset; i++) {
      const nextDate = new Date(year, month + 1, i);
      html += `<div class="planner-mini-day other-month" data-date="${getDateKey(nextDate)}">${i}</div>`;
    }

    refs.miniGrid.innerHTML = html;

    // Add click handlers
    refs.miniGrid.querySelectorAll('.planner-mini-day').forEach(el => {
      el.addEventListener('click', () => {
        const parts = el.dataset.date.split('-');
        currentDate = new Date(parts[0], parts[1] - 1, parts[2]);
        miniCalendarDate = new Date(currentDate);
        render();
      });
    });
  };

  // Render unscheduled tasks from the task manager
  const renderQuickTasks = () => {
    if (!refs.quickTasks) return;

    // Get tasks without due date or without time
    const unscheduledTasks = getTasks()
      .filter(t => !t.completed && (!t.dueDate || !t.dueDate.includes('T')))
      .slice(0, 10);

    if (unscheduledTasks.length === 0) {
      refs.quickTasks.innerHTML = '<div class="no-events-msg" id="plannerNoTasks">אין משימות ללא תזמון</div>';
      return;
    }

    refs.quickTasks.innerHTML = unscheduledTasks.map(task => {
      const subject = getSubjects().find(s => s.id === task.subject);
      const color = subject ? subject.color : '#667eea';
      const priorityLabel = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢', none: '⚪' };
      const taskDuration = task.duration || 30; // Default to 30 minutes if not set
      const durationText = taskDuration >= 60
        ? (taskDuration % 60 === 0 ? `${taskDuration / 60} שעות` : `${Math.floor(taskDuration / 60)}:${String(taskDuration % 60).padStart(2, '0')}`)
        : `${taskDuration} דק׳`;

      return `
      <div class="planner-task-item" draggable="true" data-task-id="${task.id}" data-duration="${taskDuration}">
        <div class="task-color-dot" style="background: ${color};"></div>
        <div class="task-info">
          <div class="task-title">${priorityLabel[task.priority || 'none']} ${escapeHtml(task.title)}</div>
          ${subject ? `<div class="task-subject">${subject.name}</div>` : ''}
        </div>
        <div class="task-duration">${durationText}</div>
      </div>
    `;
    }).join('');

    // Add drag handlers
    refs.quickTasks.querySelectorAll('.planner-task-item').forEach(el => {
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', el.dataset.taskId);
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
      });
    });
  };

  // Render countdowns for the current date
  const renderCountdowns = () => {
    if (!refs.countdownsList) return;

    const currentDateKey = getDateKey(currentDate);
    const currentBlocks = getBlocksForDate(currentDate);

    // Get countdowns (events) for the current date
    const countdownsForDate = getEvents()
      .filter(evt => {
        if (!evt.date) return false;
        const evtDate = new Date(evt.date);
        return getDateKey(evtDate) === currentDateKey;
      })
      .slice(0, 10);

    if (countdownsForDate.length === 0) {
      refs.countdownsList.innerHTML = '<div class="no-events-msg">אין ספירות לאחור להיום</div>';
      return;
    }

    refs.countdownsList.innerHTML = countdownsForDate.map(evt => {
      const evtDate = new Date(evt.date);
      const timeStr = evtDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
      const color = evt.color || '#667eea';

      // Check if already synced to planner
      const isSynced = currentBlocks.some(b => b.linkedEventId === evt.id);

      // Calculate time left
      const now = new Date();
      const diff = evtDate - now;
      let timeLeft = '';
      if (diff > 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        if (hours > 0) {
          timeLeft = `${hours} שעות`;
        } else {
          timeLeft = `${mins} דקות`;
        }
      } else {
        timeLeft = 'עבר';
      }

      return `
      <div class="planner-countdown-item" data-event-id="${evt.id}">
        <div class="countdown-color-dot" style="background: ${color};"></div>
        <div class="countdown-info">
          <div class="countdown-title">${escapeHtml(evt.name || 'אירוע')}</div>
          <div class="countdown-date">${timeStr}</div>
        </div>
        <div class="countdown-time-left">${timeLeft}</div>
        ${isSynced
          ? '<span class="planner-synced-indicator">✓ סונכרן</span>'
          : `<button class="add-to-planner-btn" data-event-id="${evt.id}" title="הוסף ליומן">+</button>`
        }
      </div>
    `;
    }).join('');

    // Add click handlers for adding to planner
    refs.countdownsList.querySelectorAll('.add-to-planner-btn').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const eventId = el.dataset.eventId;
        addCountdownToPlanner(eventId);
      });
    });
  };

  // Render scheduled tasks (tasks with due date/time) for the current date
  const renderScheduledTasks = () => {
    if (!refs.scheduledTasksList) return;

    const currentDateKey = getDateKey(currentDate);
    const currentBlocks = getBlocksForDate(currentDate);

    // Get tasks with due date matching current date
    const scheduledTasks = getTasks()
      .filter(t => {
        if (t.completed || !t.dueDate) return false;
        const dueDate = new Date(t.dueDate);
        return getDateKey(dueDate) === currentDateKey;
      })
      .slice(0, 10);

    if (scheduledTasks.length === 0) {
      refs.scheduledTasksList.innerHTML = '<div class="no-events-msg">אין משימות מתוזמנות להיום</div>';
      return;
    }

    const priorityLabel = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢', none: '⚪' };

    refs.scheduledTasksList.innerHTML = scheduledTasks.map(task => {
      const subject = getSubjects().find(s => s.id === task.subject);
      const color = subject ? subject.color : '#10b981';
      const dueDate = new Date(task.dueDate);
      const hasTime = task.dueDate.includes('T');
      const timeStr = hasTime ? dueDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : 'כל היום';


      // Check if already synced to planner
      const isSynced = currentBlocks.some(b => b.linkedTaskId === task.id);

      return `
      <div class="planner-scheduled-task-item" data-task-id="${task.id}">
        <div class="task-color-dot" style="background: ${color};"></div>
        <div class="task-info">
          <div class="task-title">${priorityLabel[task.priority || 'none']} ${escapeHtml(task.title)}</div>
          <div class="task-due">${timeStr}</div>
        </div>
        ${isSynced
          ? '<span class="planner-synced-indicator">✓ סונכרן</span>'
          : `<button class="add-to-planner-btn" data-task-id="${task.id}" title="הוסף ליומן">+</button>`
        }
      </div>
    `;
    }).join('');

    // Add click handlers for adding to planner
    refs.scheduledTasksList.querySelectorAll('.add-to-planner-btn').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskId = el.dataset.taskId;
        addScheduledTaskToPlanner(taskId);
      });
    });
  };

  // Add a countdown event to the planner (standalone copy)
  const addCountdownToPlanner = (eventId) => {
    const evt = getEvents().find(e => e.id === eventId);
    if (!evt) return;

    const evtDate = new Date(evt.date);
    const startMinutes = evtDate.getHours() * 60 + evtDate.getMinutes();

    // Create a standalone block (copy, not linked for editing)
    const newBlock = {
      id: generateId(),
      title: evt.name || 'אירוע',
      start: formatTime(startMinutes),
      duration: evt.duration || 60, // Use imported duration or default to 1 hour
      category: '',
      notes: evt.notes || '',
      repeat: false,
      priority: 'medium',
      color: evt.color || '',
      reminder: 0,
      completed: false,
      date: getDateKey(currentDate),
      createdAt: new Date().toISOString(),
      linkedEventId: eventId, // Track source for sync indicator only
      sourceType: 'countdown'
    };

    plannerBlocks.push(newBlock);
    saveBlocks();
    render();
  };

  // Add a scheduled task to the planner (standalone copy)
  const addScheduledTaskToPlanner = (taskId) => {
    const task = getTasks().find(t => t.id === taskId);
    if (!task) return;

    let startMinutes = 9 * 60; // Default to 9 AM
    if (task.dueDate && task.dueDate.includes('T')) {
      const dueDate = new Date(task.dueDate);
      startMinutes = dueDate.getHours() * 60 + dueDate.getMinutes();
    }

    const subject = getSubjects().find(s => s.id === task.subject);

    // Create a standalone block (copy, not linked for editing)
    const newBlock = {
      id: generateId(),
      title: task.title,
      start: formatTime(startMinutes),
      duration: task.duration || 30,
      category: '',
      notes: task.notes || '',
      repeat: false,
      priority: task.priority || 'medium',
      color: subject ? subject.color : (task.color || ''),
      reminder: 0,
      completed: false,
      date: getDateKey(currentDate),
      createdAt: new Date().toISOString(),
      linkedTaskId: taskId, // Track source for sync indicator only
      sourceType: 'task'
    };

    plannerBlocks.push(newBlock);
    saveBlocks();
    render();
  };

  // Sync all countdowns for current date to planner
  const syncAllCountdowns = () => {
    pruneDeletedEventBlocks();
    const currentDateKey = getDateKey(currentDate);
    const currentBlocks = getBlocksForDate(currentDate);

    const countdownsForDate = getEvents()
      .filter(evt => {
        if (!evt.date) return false;
        const evtDate = new Date(evt.date);
        return getDateKey(evtDate) === currentDateKey;
      });

    let added = 0;
    countdownsForDate.forEach(evt => {
      // Skip if already synced
      if (currentBlocks.some(b => b.linkedEventId === evt.id)) return;
      addCountdownToPlanner(evt.id);
      added++;
    });

    if (added > 0) {
      render();
    }
    return added;
  };

  ctx.syncAllCountdowns = syncAllCountdowns; // Expose for calendar import

  // Bulk sync specifically for imported events (across ALL dates)
  ctx.bulkSyncImportedEvents = (externalIds) => {
    if (!externalIds || !externalIds.length) return 0;

    const allEvents = getEvents();
    // Find events that match the imported externalIds
    const importedEvents = allEvents.filter(e => e.externalId && externalIds.includes(e.externalId));

    if (importedEvents.length === 0) return 0;

    let syncedCount = 0;

    importedEvents.forEach(evt => {
      if (!evt.date) return;
      const evtDate = new Date(evt.date);
      const dateKey = getDateKey(evtDate);
      const startMinutes = evtDate.getHours() * 60 + evtDate.getMinutes();

      // Check if a block already exists for this event
      const existingBlock = plannerBlocks.find(b => b.linkedEventId === evt.id);

      if (existingBlock) {
        // Update existing block
        existingBlock.date = dateKey;
        existingBlock.start = formatTime(startMinutes);
        existingBlock.duration = evt.duration || 60;
        existingBlock.title = evt.name;
        existingBlock.notes = evt.notes || '';
        syncedCount++;
      } else {
        // Create new block
        const newBlock = {
          id: generateId(),
          title: evt.name || 'Imported Event',
          start: formatTime(startMinutes),
          duration: evt.duration || 60,
          category: '',
          notes: evt.notes || '',
          repeat: false,
          priority: 'medium',
          color: evt.color || '',
          reminder: 0,
          completed: false,
          date: dateKey,
          createdAt: new Date().toISOString(),
          linkedEventId: evt.id,
          sourceType: 'countdown'
        };
        plannerBlocks.push(newBlock);
        syncedCount++;
      }
    });

    if (syncedCount > 0) {
      saveBlocks();
      render(); // Re-render current view
    }
    console.log(`[Planner] Auto-synced ${syncedCount} imported events.`);
    return syncedCount;
  };

  ctx.bulkDeleteImportedBlocks = (eventIds) => {
    if (!eventIds || !eventIds.length) return 0;
    const initialLen = plannerBlocks.length;
    // Filter out blocks that are linked to the deleted events
    plannerBlocks = plannerBlocks.filter(b => !b.linkedEventId || !eventIds.includes(b.linkedEventId));

    if (plannerBlocks.length !== initialLen) {
      saveBlocks();
      render();
      return initialLen - plannerBlocks.length;
    }
    return 0;
  };

  const pruneDeletedTaskBlocks = () => {
    if (typeof ctx.tasksLoaded !== 'undefined' && typeof ctx.hasTasksCache !== 'undefined') {
      if (!ctx.tasksLoaded && !ctx.hasTasksCache) return 0;
    }
    const taskIds = new Set(getTasks().map(t => t.id));
    const initialLen = plannerBlocks.length;
    plannerBlocks = plannerBlocks.filter(b => !b.linkedTaskId || taskIds.has(b.linkedTaskId));
    const removed = initialLen - plannerBlocks.length;
    if (removed > 0) {
      saveBlocks();
    }
    return removed;
  };

  const pruneDeletedEventBlocks = () => {
    if (typeof ctx.eventsLoaded !== 'undefined' && typeof ctx.hasEventsCache !== 'undefined') {
      if (!ctx.eventsLoaded && !ctx.hasEventsCache) return 0;
    }
    const eventIds = new Set(getEvents().map(evt => evt.id));
    const initialLen = plannerBlocks.length;
    plannerBlocks = plannerBlocks.filter(b => !b.linkedEventId || eventIds.has(b.linkedEventId));
    const removed = initialLen - plannerBlocks.length;
    if (removed > 0) {
      saveBlocks();
    }
    return removed;
  };

  // Sync all scheduled tasks for current date to planner
  const syncAllScheduledTasks = () => {
    pruneDeletedTaskBlocks();
    const currentDateKey = getDateKey(currentDate);
    const currentBlocks = getBlocksForDate(currentDate);

    const scheduledTasks = getTasks()
      .filter(t => {
        if (t.completed || !t.dueDate) return false;
        const dueDate = new Date(t.dueDate);
        return getDateKey(dueDate) === currentDateKey;
      });

    let added = 0;
    scheduledTasks.forEach(task => {
      // Skip if already synced
      if (currentBlocks.some(b => b.linkedTaskId === task.id)) return;
      addScheduledTaskToPlanner(task.id);
      added++;
    });

    if (added > 0) {
      render();
    }
    return added;
  };

  // Sync everything for current date
  const syncAll = () => {
    const countdownsAdded = syncAllCountdowns();
    const tasksAdded = syncAllScheduledTasks();
    return countdownsAdded + tasksAdded;
  };

  // Open add modal
  const openAddModal = (hour = 9) => {
    editingBlockId = null;

    const modal = refs.addModal;
    if (!modal) return;

    const titleEl = modal.querySelector('#plannerModalTitle');
    const blockTitle = modal.querySelector('#plannerBlockTitle');
    const blockStart = modal.querySelector('#plannerBlockStart');
    const blockEnd = modal.querySelector('#plannerBlockEnd');
    const blockCategory = modal.querySelector('#plannerBlockCategory');
    const blockNotes = modal.querySelector('#plannerBlockNotes');
    const blockRepeat = modal.querySelector('#plannerBlockRepeat');
    const deleteBtn = modal.querySelector('#plannerDeleteBtn');
    const priorityPicker = modal.querySelector('#plannerPriorityPicker');

    if (titleEl) titleEl.innerHTML = '<span class="icon" style="font-size:16px;vertical-align:middle">add_circle</span> הוסף פעילות';
    if (blockTitle) blockTitle.value = '';
    if (blockStart) blockStart.value = formatTime(hour * 60);
    if (blockEnd) blockEnd.value = formatTime((hour + 1) * 60);
    if (blockCategory) blockCategory.value = '';
    if (blockNotes) blockNotes.value = '';
    if (blockRepeat) blockRepeat.checked = false;
    if (deleteBtn) deleteBtn.style.display = 'none';

    // Reset reminder
    const blockReminder = modal.querySelector('#plannerBlockReminder');
    if (blockReminder) blockReminder.value = '0';

    // Reset priority
    if (priorityPicker) {
      priorityPicker.querySelectorAll('.planner-priority-option').forEach(el => el.classList.remove('selected'));
      const mediumBtn = priorityPicker.querySelector('[data-priority="medium"]');
      if (mediumBtn) mediumBtn.classList.add('selected');
    }

    // Reset color picker
    const colorPicker = modal.querySelector('#plannerColorPicker');
    if (colorPicker) {
      colorPicker.querySelectorAll('.planner-color-option').forEach(el => el.classList.remove('selected'));
      const defaultColor = colorPicker.querySelector('[data-color=""]');
      if (defaultColor) defaultColor.classList.add('selected');
    }

    // Reset duration buttons
    modal.querySelectorAll('.planner-duration-btn').forEach(el => el.classList.remove('active'));
    const defaultDuration = modal.querySelector('[data-duration="60"]');
    if (defaultDuration) defaultDuration.classList.add('active');

    modal.classList.add('open');
    if (blockTitle) blockTitle.focus();
  };

  // Open edit modal
  const openEditModal = (blockId) => {
    const block = plannerBlocks.find(b => b.id === blockId);
    if (!block) return;

    editingBlockId = blockId;

    const modal = refs.addModal;
    if (!modal) return;

    const titleEl = modal.querySelector('#plannerModalTitle');
    const blockTitle = modal.querySelector('#plannerBlockTitle');
    const blockStart = modal.querySelector('#plannerBlockStart');
    const blockEnd = modal.querySelector('#plannerBlockEnd');
    const blockCategory = modal.querySelector('#plannerBlockCategory');
    const blockNotes = modal.querySelector('#plannerBlockNotes');
    const blockRepeat = modal.querySelector('#plannerBlockRepeat');
    const deleteBtn = modal.querySelector('#plannerDeleteBtn');
    const priorityPicker = modal.querySelector('#plannerPriorityPicker');

    if (titleEl) titleEl.innerHTML = '<span class="icon" style="font-size:16px;vertical-align:middle">edit</span> ערוך פעילות';
    if (blockTitle) blockTitle.value = block.title || '';
    if (blockStart) blockStart.value = block.start || '09:00';
    if (blockEnd) blockEnd.value = formatTime(parseTime(block.start) + (block.duration || 60));
    if (blockCategory) blockCategory.value = block.category || '';
    if (blockNotes) blockNotes.value = block.notes || '';
    if (blockRepeat) blockRepeat.checked = block.repeat || false;

    // Set reminder
    const blockReminder = modal.querySelector('#plannerBlockReminder');
    if (blockReminder) blockReminder.value = block.reminder || '0';
    if (deleteBtn) deleteBtn.style.display = '';

    // Set priority
    if (priorityPicker) {
      priorityPicker.querySelectorAll('.planner-priority-option').forEach(el => el.classList.remove('selected'));
      const priorityBtn = priorityPicker.querySelector(`[data-priority="${block.priority || 'medium'}"]`);
      if (priorityBtn) priorityBtn.classList.add('selected');
    }

    // Set color
    const colorPicker = modal.querySelector('#plannerColorPicker');
    if (colorPicker) {
      colorPicker.querySelectorAll('.planner-color-option').forEach(el => el.classList.remove('selected'));
      const colorBtn = colorPicker.querySelector(`[data-color="${block.color || ''}"]`);
      if (colorBtn) colorBtn.classList.add('selected');
    }

    modal.classList.add('open');
  };

  // Close modal
  const closeModal = () => {
    if (refs.addModal) refs.addModal.classList.remove('open');
    editingBlockId = null;
  };

  // Save block
  const saveBlock = () => {
    const modal = refs.addModal;
    if (!modal) return;

    const blockTitle = modal.querySelector('#plannerBlockTitle');
    const blockStart = modal.querySelector('#plannerBlockStart');
    const blockEnd = modal.querySelector('#plannerBlockEnd');
    const blockCategory = modal.querySelector('#plannerBlockCategory');
    const blockNotes = modal.querySelector('#plannerBlockNotes');
    const blockRepeat = modal.querySelector('#plannerBlockRepeat');
    const priorityPicker = modal.querySelector('#plannerPriorityPicker');

    const title = blockTitle ? blockTitle.value.trim() : '';
    if (!title) {
      if (blockTitle) blockTitle.focus();
      return;
    }

    const start = blockStart ? blockStart.value : '09:00';
    const end = blockEnd ? blockEnd.value : '10:00';
    const duration = parseTime(end) - parseTime(start);
    const category = blockCategory ? blockCategory.value : '';
    const notes = blockNotes ? blockNotes.value.trim() : '';
    const repeat = blockRepeat ? blockRepeat.checked : false;
    const blockReminder = modal.querySelector('#plannerBlockReminder');
    const reminder = blockReminder ? Number.parseInt(blockReminder.value) || 0 : 0;
    const selectedPriority = priorityPicker ? priorityPicker.querySelector('.selected') : null;
    const priority = selectedPriority ? selectedPriority.dataset.priority : 'medium';
    const colorPicker = modal.querySelector('#plannerColorPicker');
    const selectedColor = colorPicker ? colorPicker.querySelector('.selected') : null;
    const color = selectedColor ? selectedColor.dataset.color : '';

    if (editingBlockId) {
      // Update existing block
      const index = plannerBlocks.findIndex(b => b.id === editingBlockId);
      if (index !== -1) {
        plannerBlocks[index] = {
          ...plannerBlocks[index],
          title,
          start,
          duration: Math.max(15, duration),
          category,
          notes,
          repeat,
          reminder,
          priority,
          color
        };
      }
    } else {
      // Create new block
      const newBlock = {
        id: generateId(),
        title,
        start,
        duration: Math.max(15, duration),
        category,
        notes,
        repeat,
        reminder,
        priority,
        color,
        completed: false,
        date: getDateKey(currentDate),
        createdAt: new Date().toISOString(),
        originId: null
      };
      plannerBlocks.push(newBlock);
    }

    saveBlocks();
    closeModal();
    render();
  };

  // Delete block (removes only the planner block, NOT the linked task)
  const deleteBlock = () => {
    if (!editingBlockId) return;

    // Only remove the planner block - tasks remain intact
    plannerBlocks = plannerBlocks.filter(b => b.id !== editingBlockId);
    saveBlocks();
    closeModal();
    render();
  };

  // Toggle block completion
  const toggleBlockComplete = (blockId) => {
    const block = plannerBlocks.find(b => b.id === blockId);
    if (block) {
      block.completed = !block.completed;
      saveBlocks();
      render();
    }
  };

  // Apply template
  const applyTemplate = (templateKey) => {
    const template = templates[templateKey];
    if (!template) return;

    const dateKey = getDateKey(currentDate);

    template.forEach(item => {
      const newBlock = {
        id: generateId(),
        title: item.title,
        start: item.start,
        duration: item.duration,
        category: item.category,
        priority: item.priority,
        completed: false,
        date: dateKey,
        createdAt: new Date().toISOString()
      };
      plannerBlocks.push(newBlock);
    });

    saveBlocks();
    render();
  };

  // Update view toggle buttons
  const updateViewToggle = () => {
    if (!refs.viewToggle) return;
    refs.viewToggle.querySelectorAll('button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === plannerView);
    });
  };

  // Main render function
  const render = () => {
    if (typeof ctx.eventsLoaded !== 'undefined' && typeof ctx.hasEventsCache !== 'undefined') {
      if (ctx.eventsLoaded || ctx.hasEventsCache) {
        pruneDeletedEventBlocks();
      }
    }
    // Update date display
    if (refs.currentDate) {
      refs.currentDate.textContent = formatDate(currentDate);
    }

    // Show/hide views
    if (refs.dayView) refs.dayView.style.display = plannerView === 'day' ? '' : 'none';
    if (refs.weekView) refs.weekView.style.display = plannerView === 'week' ? '' : 'none';

    // Render appropriate view
    if (plannerView === 'day') {
      renderTimeline();
    } else {
      renderWeekView();
    }

    renderMiniCalendar();
    renderQuickTasks();
    renderCountdowns();
    renderScheduledTasks();

    // Initialize drag/resize handlers after render
    if (refs.timeline && !refs.timeline.dataset.dragResizeInit) {
      refs.timeline.dataset.dragResizeInit = '1';
      refs.timeline.addEventListener('pointerdown', onTimelinePointerDown, { passive: false });
    }
  };

  // Navigate date
  const navigateDate = (delta) => {
    if (plannerView === 'week') {
      currentDate.setDate(currentDate.getDate() + (delta * 7));
    } else {
      currentDate.setDate(currentDate.getDate() + delta);
    }
    miniCalendarDate = new Date(currentDate);
    render();
  };

  // Go to today
  const goToToday = () => {
    currentDate = new Date();
    miniCalendarDate = new Date();
    render();
  };

  // Initialize
  const init = () => {
    if (initialized) {
      render();
      return;
    }
    initialized = true;

    // Get DOM references
    refs.overlay = $('plannerOverlay');
    refs.currentDate = $('plannerCurrentDate');
    refs.prevDay = $('plannerPrevDay');
    refs.nextDay = $('plannerNextDay');
    refs.todayBtn = $('plannerTodayBtn');
    refs.timeline = $('plannerTimeline');
    refs.dayView = $('plannerDayView');
    refs.weekView = $('plannerWeekView');
    refs.miniGrid = $('plannerMiniGrid');
    refs.miniTitle = $('plannerMiniTitle');
    refs.quickTasks = $('plannerQuickTasks');
    refs.addModal = $('plannerAddModal');
    refs.totalBlocks = $('plannerTotalBlocks');
    refs.totalHours = $('plannerTotalHours');
    refs.completedBlocks = $('plannerCompletedBlocks');
    refs.progress = $('plannerProgress');
    refs.dayTitle = $('plannerDayTitle');
    refs.daySummary = $('plannerDaySummary');
    refs.countdownsList = $('plannerCountdownsList');
    refs.scheduledTasksList = $('plannerScheduledTasksList');
    refs.syncAllBtn = $('plannerSyncAllBtn');
    refs.syncCountdownsBtn = $('plannerSyncCountdownsBtn');
    refs.syncTasksBtn = $('plannerSyncTasksBtn');

    // View toggle
    refs.viewToggle = refs.overlay ? refs.overlay.querySelector('.planner-view-toggle') : null;

    // Load saved blocks
    loadBlocks();
    startPlannerCloudSync();
    pruneDeletedEventBlocks();
    startPlannerReminderTicker();

    // Set up event listeners
    if (refs.prevDay) refs.prevDay.onclick = () => navigateDate(-1);
    if (refs.nextDay) refs.nextDay.onclick = () => navigateDate(1);
    if (refs.todayBtn) refs.todayBtn.onclick = goToToday;

    // View toggle
    if (refs.viewToggle) {
      refs.viewToggle.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => {
          plannerView = btn.dataset.view;
          updateViewToggle();
          render();
        };
      });
    }

    // Mini calendar navigation
    const miniPrev = $('plannerMiniPrev');
    const miniNext = $('plannerMiniNext');
    if (miniPrev) miniPrev.onclick = () => {
      miniCalendarDate.setMonth(miniCalendarDate.getMonth() - 1);
      renderMiniCalendar();
    };
    if (miniNext) miniNext.onclick = () => {
      miniCalendarDate.setMonth(miniCalendarDate.getMonth() + 1);
      renderMiniCalendar();
    };

    // Template buttons
    const templateBtns = refs.overlay ? refs.overlay.querySelectorAll('.planner-template-btn') : [];
    templateBtns.forEach(btn => {
      btn.onclick = () => applyTemplate(btn.dataset.template);
    });

    // Sync buttons
    if (refs.syncAllBtn) {
      refs.syncAllBtn.onclick = () => {
        refs.syncAllBtn.classList.add('syncing');
        const count = syncAll();
        setTimeout(() => {
          refs.syncAllBtn.classList.remove('syncing');
        }, 500);
      };
    }

    if (refs.syncCountdownsBtn) {
      refs.syncCountdownsBtn.onclick = () => {
        refs.syncCountdownsBtn.classList.add('syncing');
        syncAllCountdowns();
        setTimeout(() => {
          refs.syncCountdownsBtn.classList.remove('syncing');
        }, 500);
      };
    }

    if (refs.syncTasksBtn) {
      refs.syncTasksBtn.onclick = () => {
        refs.syncTasksBtn.classList.add('syncing');
        syncAllScheduledTasks();
        setTimeout(() => {
          refs.syncTasksBtn.classList.remove('syncing');
        }, 500);
      };
    }

    // Section collapse toggles
    const countdownsToggle = $('plannerCountdownsToggle');
    const scheduledTasksToggle = $('plannerScheduledTasksToggle');

    if (countdownsToggle && refs.countdownsList) {
      countdownsToggle.onclick = () => {
        countdownsToggle.classList.toggle('collapsed');
        refs.countdownsList.classList.toggle('collapsed');
      };
    }

    if (scheduledTasksToggle && refs.scheduledTasksList) {
      scheduledTasksToggle.onclick = () => {
        scheduledTasksToggle.classList.toggle('collapsed');
        refs.scheduledTasksList.classList.toggle('collapsed');
      };
    }

    // Modal events
    if (refs.addModal) {
      const cancelBtn = refs.addModal.querySelector('#plannerCancelBtn');
      const saveBtn = refs.addModal.querySelector('#plannerSaveBtn');
      const deleteBtn = refs.addModal.querySelector('#plannerDeleteBtn');
      const priorityPicker = refs.addModal.querySelector('#plannerPriorityPicker');
      const durationBtns = refs.addModal.querySelectorAll('.planner-duration-btn');

      if (cancelBtn) cancelBtn.onclick = closeModal;
      if (saveBtn) saveBtn.onclick = saveBlock;
      if (deleteBtn) deleteBtn.onclick = deleteBlock;

      // Enter key to save
      refs.addModal.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          const activeEl = document.activeElement;
          // Don't trigger if in textarea
          if (activeEl && activeEl.tagName === 'TEXTAREA') return;
          e.preventDefault();
          saveBlock();
        }
        if (e.key === 'Escape') {
          closeModal();
        }
      });

      // Color picker
      const colorPicker = refs.addModal.querySelector('#plannerColorPicker');
      if (colorPicker) {
        colorPicker.addEventListener('click', (e) => {
          const option = e.target.closest('.planner-color-option');
          if (!option) return;
          colorPicker.querySelectorAll('.planner-color-option').forEach(el => el.classList.remove('selected'));
          option.classList.add('selected');
        });
      }

      // Priority picker
      if (priorityPicker) {
        priorityPicker.addEventListener('click', (e) => {
          const option = e.target.closest('.planner-priority-option');
          if (!option) return;
          priorityPicker.querySelectorAll('.planner-priority-option').forEach(el => el.classList.remove('selected'));
          option.classList.add('selected');
        });
      }

      // Duration presets
      durationBtns.forEach(btn => {
        btn.onclick = () => {
          durationBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');

          const duration = Number.parseInt(btn.dataset.duration);
          const startInput = refs.addModal.querySelector('#plannerBlockStart');
          const endInput = refs.addModal.querySelector('#plannerBlockEnd');

          if (startInput && endInput) {
            const startMins = parseTime(startInput.value);
            endInput.value = formatTime(startMins + duration);
          }
        };
      });

      // Close on backdrop click
      refs.addModal.addEventListener('click', (e) => {
        if (e.target === refs.addModal) closeModal();
      });
    }

    // Initial render
    render();

    // Update now line every minute
    setInterval(() => {
      if (plannerView === 'day' && isToday(currentDate)) {
        renderTimeline();
      }
    }, 60000);
  };

  // Refresh scheduled tasks (called when tasks change)
  const refreshTasks = () => {
    pruneDeletedTaskBlocks();
    if (refs.overlay && refs.overlay.classList.contains('open')) {
      // Full render to update timeline, scheduled tasks, and quick tasks
      render();
    } else if (refs.scheduledTasksList) {
      // At minimum, update the cached lists for when planner is opened
      renderScheduledTasks();
      renderQuickTasks();
    }
  };

  const refreshEvents = () => {
    pruneDeletedEventBlocks();
    if (refs.overlay && refs.overlay.classList.contains('open')) {
      render();
    } else if (refs.countdownsList) {
      renderCountdowns();
      renderMiniCalendar();
    }
  };

  const addPlannerBlock = async ({ date, title, start, durationMinutes = 60, notes = '', category = '' }) => {
    if (typeof window.showView === 'function') window.showView('planner');
    if (!initialized) init();

    const dateObj = new Date(date);
    if (Number.isNaN(dateObj.getTime())) throw new Error('Invalid date');
    const dateKey = getDateKey(dateObj);

    const startMinutes = parseTime(start);
    if (!Number.isFinite(startMinutes)) throw new Error('Invalid start time');

    const duration = Math.min(240, Math.max(15, Number.parseInt(durationMinutes || 60, 10) || 60));

    const newBlock = {
      id: generateId(),
      title: String(title || '').trim() || 'בלוק חדש',
      start: formatTime(startMinutes),
      duration,
      category: String(category || '').trim(),
      notes: String(notes || '').trim(),
      repeat: false,
      priority: 'medium',
      color: '',
      reminder: 0,
      completed: false,
      date: dateKey,
      createdAt: new Date().toISOString()
    };

    plannerBlocks.push(newBlock);
    saveBlocks();
    currentDate = new Date(dateObj);
    render();
  };

  return {
    init,
    render,
    refreshTasks,
    refreshEvents,
    addPlannerBlock,
    checkReminders: checkPlannerReminders,
    startReminderTicker: startPlannerReminderTicker
  };
}
