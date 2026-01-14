export function createPomodoro() {
  const Pomodoro = (() => {
    const refs = {
      card: document.getElementById('pomodoroCard'),
      taskSelect: document.getElementById('pomodoroTaskSelect'),
      presets: Array.from(document.querySelectorAll('.pomodoro-preset')),
      focusInput: document.getElementById('pomodoroFocus'),
      breakInput: document.getElementById('pomodoroBreak'),
      longInput: document.getElementById('pomodoroLong'),
      longEveryInput: document.getElementById('pomodoroLongEvery'),
      autoContinue: document.getElementById('pomodoroAutoContinue'),
      soundEnabled: document.getElementById('pomodoroSoundEnabled'),
      soundSelect: document.getElementById('pomodoroSound'),
      soundLengthSelect: document.getElementById('pomodoroSoundLength'),
      previewBtn: document.getElementById('pomodoroPreviewSound'),
      display: document.getElementById('pomodoroDisplay'),
      mode: document.getElementById('pomodoroMode'),
      next: document.getElementById('pomodoroNext'),
      phaseLabel: document.getElementById('pomodoroPhaseLabel'),
      longCountdown: document.getElementById('pomodoroLongCountdown'),
      progress: document.getElementById('pomodoroRing'),
      startBtn: document.getElementById('pomodoroStart'),
      skipBtn: document.getElementById('pomodoroSkip'),
      resetBtn: document.getElementById('pomodoroReset'),
      sessionCount: document.getElementById('pomodoroSessionCount'),
      focusMinutes: document.getElementById('pomodoroFocusMinutes'),
      streak: document.getElementById('pomodoroStreak'),
      dayProgress: document.getElementById('pomodoroDayProgress'),
      dayLabel: document.getElementById('pomodoroDayLabel'),
      badDayTip: document.getElementById('pomodoroBadDayTip'),
      // Mini player refs
      mini: document.getElementById('pomodoroMini'),
      miniTime: document.getElementById('pomodoroMiniTime'),
      miniMode: document.getElementById('pomodoroMiniMode'),
      miniToggle: document.getElementById('pomodoroMiniToggle'),
      miniClose: document.getElementById('pomodoroMiniClose'),
      // Picture-in-Picture refs
      pipBtn: document.getElementById('pomodoroPiP'),
      pipCanvas: document.getElementById('pomodoroPipCanvas')
    };

    const KEYS = {
      STATS: 'pomodoro-stats-v1',
      PRESET: 'pomodoro-preset-v1',
      CUSTOM: 'pomodoro-custom-v1',
      SETTINGS: 'pomodoro-settings-v1'
    };
    const MINI_KEY = 'pomodoro-mini-enabled-v2';
    const MINI_POS_KEY = 'pomodoro-mini-pos-v1';
    const LEGACY_MINI_KEY = 'pomodoro-mini-enabled';

    const presets = {
      classic: { focus: 25, shortBreak: 5, longBreak: 15, longEvery: 4, label: '25/5 קלאסי' },
      flow: { focus: 50, shortBreak: 10, longBreak: 20, longEvery: 3, label: '50/10 זרימה' },
      ultradian: { focus: 90, shortBreak: 20, longBreak: 25, longEvery: 1, label: '90/20 אולטרה' },
      perfect: { focus: 52, shortBreak: 17, longBreak: 20, longEvery: 3, label: '52/17 קצב יעיל' },
      // Bad day presets - based on research showing even short focus sessions help
      badday10: { focus: 10, shortBreak: 3, longBreak: 5, longEvery: 4, label: '😔 10 דק׳', isBadDay: true },
      badday5: { focus: 5, shortBreak: 2, longBreak: 5, longEvery: 6, label: '💫 5 דק׳', isBadDay: true }
    };

    const clampNum = (val, min, max, fallback) => {
      const n = Number(val);
      if (Number.isFinite(n)) return Math.min(max, Math.max(min, n));
      return fallback;
    };

    const normalizeSoundRepeat = (value, fallback = 3) => {
      const n = Number(value);
      if (Number.isFinite(n)) return Math.min(3, Math.max(1, Math.round(n)));
      return fallback;
    };

    const getTodayKey = () => new Date().toISOString().slice(0, 10);
    const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

    const loadCustom = () => {
      try {
        const raw = localStorage.getItem(KEYS.CUSTOM);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return {
          focus: clampNum(parsed.focus, 5, 240, 25),
          shortBreak: clampNum(parsed.shortBreak, 3, 60, 5),
          longBreak: clampNum(parsed.longBreak, 5, 90, 15),
          longEvery: clampNum(parsed.longEvery, 1, 8, 4)
        };
      } catch (e) { return null; }
    };

    const saveCustom = (config) => {
      try { localStorage.setItem(KEYS.CUSTOM, JSON.stringify(config)); } catch (e) { }
    };

    const loadStats = () => {
      const today = getTodayKey();
      try {
        const raw = localStorage.getItem(KEYS.STATS);
        if (!raw) return { date: today, sessions: 0, focusMinutes: 0, streak: 0, lastActiveDate: null };
        const parsed = JSON.parse(raw);
        if (!parsed) return { date: today, sessions: 0, focusMinutes: 0, streak: 0, lastActiveDate: null };
        if (parsed.date !== today) {
          const carry = parsed.focusMinutes > 0 && daysBetween(parsed.date, today) === 1;
          const streak = carry ? (parsed.streak || 0) + 1 : (parsed.focusMinutes > 0 ? 1 : 0);
          return { date: today, sessions: 0, focusMinutes: 0, streak, lastActiveDate: parsed.lastActiveDate };
        }
        return parsed;
      } catch (e) {
        return { date: today, sessions: 0, focusMinutes: 0, streak: 0, lastActiveDate: null };
      }
    };

    const loadSettings = () => {
      try {
        const raw = localStorage.getItem(KEYS.SETTINGS);
        if (!raw) return { autoContinue: false, sound: 'chime', soundEnabled: true, soundRepeat: 3 };
        const parsed = JSON.parse(raw);
        return {
          autoContinue: !!parsed.autoContinue,
          sound: parsed.sound || 'chime',
          soundEnabled: parsed.soundEnabled !== false, // default true
          soundRepeat: normalizeSoundRepeat(parsed.soundRepeat, 3)
        };
      } catch (e) {
        return { autoContinue: false, sound: 'chime', soundEnabled: true, soundRepeat: 3 };
      }
    };

    const saveSettings = () => {
      try { localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings)); } catch (e) { }
    };
    const saveStats = () => {
      try { localStorage.setItem(KEYS.STATS, JSON.stringify(stats)); } catch (e) { }
    };

    let config = loadCustom() || { ...presets.classic };
    let state = {
      mode: 'focus',
      remainingMs: (config.focus || 25) * 60000,
      running: false,
      cycle: 0,
      preset: localStorage.getItem(KEYS.PRESET) || 'classic',
      timerId: null,
      startTimestamp: null, // Track when timer actually started
      pausedMs: 0 // Track how much time was on timer when paused
    };
    let stats = loadStats();
    let settings = loadSettings();
    let tasksCache = [];

    const getDuration = (mode) => {
      if (mode === 'focus') return config.focus;
      if (mode === 'long') return config.longBreak;
      return config.shortBreak;
    };

    const formatTime = (ms) => {
      const total = Math.max(0, Math.round(ms / 1000));
      const m = Math.floor(total / 60);
      const s = total % 60;
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const updatePresetButtons = () => {
      refs.presets.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.preset === state.preset);
      });

      // Show/hide bad day tip based on selected preset
      const currentPreset = presets[state.preset];
      const isBadDay = currentPreset?.isBadDay || false;
      if (refs.badDayTip) {
        refs.badDayTip.style.display = isBadDay ? 'flex' : 'none';
      }
    };

    const renderStats = () => {
      if (!refs.sessionCount || !refs.focusMinutes || !refs.streak) return;
      refs.sessionCount.textContent = stats.sessions;
      refs.focusMinutes.textContent = stats.focusMinutes;
      refs.streak.textContent = stats.streak;
      const goal = 8;
      if (refs.dayProgress) {
        const pct = Math.min(100, Math.round((stats.sessions / goal) * 100));
        refs.dayProgress.style.width = pct + '%';
      }
      if (refs.dayLabel) {
        refs.dayLabel.textContent = `${Math.min(stats.sessions, goal)}/${goal} מחזורי מיקוד היום`;
      }
    };

    const render = () => {
      if (!refs.display) return;
      refs.display.textContent = formatTime(state.remainingMs);
      const modeLabel = state.mode === 'focus' ? 'מיקוד' : (state.mode === 'long' ? 'הפסקה ארוכה' : 'הפסקה קצרה');
      refs.mode.textContent = modeLabel;
      if (refs.phaseLabel) refs.phaseLabel.textContent = `שלב: ${modeLabel}`;
      if (refs.longCountdown) refs.longCountdown.textContent = formatLongBreakCountdown();
      refs.next.textContent = `הבא: ${getNextLabel()}`;
      const totalMs = getDuration(state.mode) * 60000;
      const pct = Math.max(0, Math.min(100, 100 - (state.remainingMs / totalMs) * 100));
      if (refs.progress) refs.progress.style.setProperty('--progress', pct + '%');
      if (refs.startBtn) refs.startBtn.textContent = state.running ? '⏸️' : '▶️';
      // Update mini player
      if (refs.miniTime) refs.miniTime.textContent = formatTime(state.remainingMs);
      if (refs.miniMode) refs.miniMode.textContent = state.mode === 'focus' ? 'מיקוד' : (state.mode === 'long' ? 'הפסקה ארוכה' : 'הפסקה קצרה');
    };

    const setMode = (mode) => {
      state.mode = mode;
      state.remainingMs = getDuration(mode) * 60000;
      render();
    };

    const getNextLabel = () => {
      if (state.mode === 'focus') {
        const nextIsLong = ((state.cycle + 1) % config.longEvery === 0);
        return nextIsLong ? 'הפסקה ארוכה' : 'הפסקה קצרה';
      }
      return 'מיקוד';
    };

    const formatLongBreakCountdown = () => {
      const every = Math.max(1, Number(config.longEvery) || 1);
      if (state.mode === 'long') return 'הפסקה ארוכה עכשיו';
      const remaining = every - (state.cycle % every);
      if (remaining <= 1) return 'הפסקה ארוכה בעוד מחזור אחד';
      return `הפסקה ארוכה בעוד ${remaining} מחזורים`;
    };

    const clearTimer = () => {
      if (state.timerId) {
        clearInterval(state.timerId);
        state.timerId = null;
      }
    };

    const tick = () => {
      if (!state.running || !state.startTimestamp) return;

      // Calculate actual elapsed time based on timestamp (immune to tab throttling)
      const now = Date.now();
      const elapsed = now - state.startTimestamp;
      state.remainingMs = Math.max(0, state.pausedMs - elapsed);

      if (state.remainingMs <= 0) {
        advance(true);
      } else {
        render();
      }
    };

    const start = () => {
      if (state.running) return;
      state.running = true;
      state.startTimestamp = Date.now();
      state.pausedMs = state.remainingMs;
      clearTimer();
      state.timerId = setInterval(tick, 100); // Check more frequently for accuracy
      render();
    };

    const pause = () => {
      state.running = false;
      state.startTimestamp = null;
      clearTimer();
      render();
    };

    const reset = () => {
      state.running = false;
      state.startTimestamp = null;
      state.pausedMs = 0;
      clearTimer();
      state.mode = 'focus';
      state.remainingMs = config.focus * 60000;
      state.cycle = 0;
      render();
    };

    const recordFocus = () => {
      const today = getTodayKey();
      if (stats.date !== today) {
        const carry = stats.focusMinutes > 0 && daysBetween(stats.date, today) === 1;
        stats.streak = carry ? stats.streak + 1 : (stats.focusMinutes > 0 ? 1 : stats.streak || 0);
        stats.date = today;
        stats.sessions = 0;
        stats.focusMinutes = 0;
      }
      stats.sessions += 1;
      stats.focusMinutes += config.focus;
      stats.lastActiveDate = today;
      saveStats();
      renderStats();
    };

    // Enhanced sound patterns with distinct tones
    const tonePatterns = {
      // Gentle ascending chime - pleasant completion sound
      chime: [
        { f: 523, d: 0.15, type: 'sine', vol: 0.12 },
        { f: 659, d: 0.15, type: 'sine', vol: 0.14 },
        { f: 784, d: 0.25, type: 'sine', vol: 0.16 }
      ],
      // Soft meditation bowl - calming
      soft: [
        { f: 396, d: 0.4, type: 'sine', vol: 0.1 },
        { f: 528, d: 0.5, type: 'sine', vol: 0.08 }
      ],
      // Classic bell - clear and bright
      bell: [
        { f: 1047, d: 0.08, type: 'sine', vol: 0.18 },
        { f: 1319, d: 0.12, type: 'sine', vol: 0.14 },
        { f: 1568, d: 0.3, type: 'triangle', vol: 0.1 }
      ],
      // Digital beep - modern alert
      digital: [
        { f: 880, d: 0.1, type: 'square', vol: 0.06 },
        { f: 0, d: 0.05, type: 'sine', vol: 0 },
        { f: 880, d: 0.1, type: 'square', vol: 0.06 },
        { f: 0, d: 0.05, type: 'sine', vol: 0 },
        { f: 1175, d: 0.2, type: 'square', vol: 0.08 }
      ],
      // Crystal glass - high clarity
      glass: [
        { f: 2093, d: 0.15, type: 'sine', vol: 0.08 },
        { f: 2637, d: 0.2, type: 'sine', vol: 0.06 },
        { f: 3136, d: 0.35, type: 'sine', vol: 0.04 }
      ],
      // Success fanfare - celebratory
      success: [
        { f: 523, d: 0.12, type: 'triangle', vol: 0.12 },
        { f: 659, d: 0.12, type: 'triangle', vol: 0.14 },
        { f: 784, d: 0.12, type: 'triangle', vol: 0.16 },
        { f: 1047, d: 0.3, type: 'triangle', vol: 0.18 }
      ]
    };

    let audioCtx = null;
    const playTonePattern = (pattern, startTime = null) => {
      if (!pattern) return 0;
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      let t = startTime !== null ? startTime : audioCtx.currentTime;
      pattern.forEach(step => {
        if (step.f === 0) { t += step.d; return; } // silence gap
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = step.type || 'sine';
        osc.frequency.value = step.f;
        const vol = step.vol || 0.15;
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(vol, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t + step.d);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + step.d + 0.02);
        t += step.d + 0.02;
      });
      return t; // return end time
    };

    const getSoundRepeatCount = () => normalizeSoundRepeat(settings.soundRepeat, 3);

    // Extended alarm - repeat count controls total length
    const playExtendedAlarm = (pattern, repeatCount = 3) => {
      if (!pattern) return;
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const gap = 0.4; // pause between repetitions
      let t = audioCtx.currentTime;

      for (let i = 0; i < repeatCount; i++) {
        t = playTonePattern(pattern, t);
        t += gap;
      }
    };

    const playAlarm = () => {
      if (!settings.soundEnabled) {
        // Still vibrate even if sound is off
        if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
        return;
      }
      const pattern = tonePatterns[settings.sound] || tonePatterns.chime;
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      playExtendedAlarm(pattern, getSoundRepeatCount());
      if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
    };

    const playStartClick = () => {
      if (!settings.soundEnabled) return;
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, t);
      osc.frequency.exponentialRampToValueAtTime(360, t + 0.08);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.16);
    };

    const advance = (countFocus = false) => {
      const wasRunning = state.running;
      clearTimer();
      state.running = false;
      state.startTimestamp = null;
      state.pausedMs = 0;
      if (state.mode === 'focus') {
        if (countFocus) recordFocus();
        state.cycle += 1;
        const useLong = config.longEvery > 0 && (state.cycle % config.longEvery === 0);
        setMode(useLong ? 'long' : 'short');
      } else {
        setMode('focus');
      }
      render();
      playAlarm();
      // Auto-continue: only start next phase if setting is enabled
      if (settings.autoContinue) {
        start();
      }
    };

    const applyConfig = (cfg, presetKey) => {
      config = { ...cfg };
      state.preset = presetKey;
      refs.focusInput.value = config.focus;
      refs.breakInput.value = config.shortBreak;
      refs.longInput.value = config.longBreak;
      refs.longEveryInput.value = config.longEvery;
      state.mode = 'focus';
      state.remainingMs = config.focus * 60000;
      state.cycle = 0;
      updatePresetButtons();
      render();
    };

    const selectPreset = (key) => {
      const base = key === 'custom' ? (loadCustom() || config) : presets[key];
      if (!base) return;
      localStorage.setItem(KEYS.PRESET, key);
      if (key === 'custom') saveCustom(base);
      applyConfig(base, key);
    };

    const handleCustomChange = () => {
      const cfg = {
        focus: clampNum(refs.focusInput.value, 5, 240, config.focus),
        shortBreak: clampNum(refs.breakInput.value, 3, 60, config.shortBreak),
        longBreak: clampNum(refs.longInput.value, 5, 90, config.longBreak),
        longEvery: clampNum(refs.longEveryInput.value, 1, 8, config.longEvery)
      };
      saveCustom(cfg);
      selectPreset('custom');
    };

    const updateTaskOptions = () => {
      if (!refs.taskSelect) return;
      const prev = refs.taskSelect.value;
      refs.taskSelect.innerHTML = '<option value="">בחר משימת מיקוד (לא חובה)</option>';
      const active = (tasksCache || []).filter(t => !t.completed).slice(0, 50);
      active.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.title || 'ללא שם';
        refs.taskSelect.appendChild(opt);
      });
      if (prev && active.some(t => t.id === prev)) refs.taskSelect.value = prev;
    };

    // ============ PICTURE-IN-PICTURE FUNCTIONALITY ============
    let pipWindow = null;
    let pipUpdateInterval = null;
    let isPiPActive = false;
    let pipStarting = false;

    // Check if Document PiP is supported (Chrome 116+)
    const isDocumentPiPSupported = () => {
      return 'documentPictureInPicture' in window;
    };

    // Legacy video-based PiP support check
    const isVideoPiPSupported = () => {
      return !!document.pictureInPictureEnabled
        && !!refs.pipCanvas
        && typeof refs.pipCanvas.captureStream === 'function'
        && typeof HTMLVideoElement.prototype.requestPictureInPicture === 'function';
    };

    const isPiPSupported = () => {
      return isDocumentPiPSupported() || isVideoPiPSupported();
    };

    const setMiniVisible = (visible, forceButton = false) => {
      const enabled = !!visible;
      if (refs.miniToggle) refs.miniToggle.checked = enabled;
      try {
        localStorage.setItem(MINI_KEY, enabled ? 'true' : 'false');
        localStorage.setItem(LEGACY_MINI_KEY, enabled ? 'true' : 'false');
      } catch (e) { }
      if (refs.mini) refs.mini.classList.toggle('visible', enabled);
      const pipSupported = isPiPSupported();
      if (refs.pipBtn) refs.pipBtn.classList.toggle('active', enabled && (forceButton || !pipSupported));
    };

    // Create the PiP content HTML
    const createPiPContent = (doc) => {
      // Add styles to the PiP document
      const style = doc.createElement('style');
      style.textContent = `
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          padding: 12px 16px;
          gap: 12px;
          direction: rtl;
          cursor: pointer;
          user-select: none;
        }
        .pip-content {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          flex: 1;
        }
        .pip-time {
          font-size: 28px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          background: linear-gradient(135deg, #667eea, #764ba2);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          line-height: 1.2;
        }
        .pip-mode {
          font-size: 12px;
          color: #9ca3af;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .pip-close {
          border: none;
          background: #f3f4f6;
          color: #9ca3af;
          font-size: 18px;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          flex-shrink: 0;
        }
        .pip-close:hover {
          background: #ef4444;
          color: white;
        }
      `;
      doc.head.appendChild(style);

      // Create content container
      const container = doc.createElement('div');
      container.style.cssText = 'display: flex; align-items: center; gap: 12px; width: 100%;';

      // Close button
      const closeBtn = doc.createElement('button');
      closeBtn.className = 'pip-close';
      closeBtn.textContent = '×';
      closeBtn.onclick = () => stopPiP();

      // Content div
      const content = doc.createElement('div');
      content.className = 'pip-content';

      // Time display
      const timeEl = doc.createElement('div');
      timeEl.className = 'pip-time';
      timeEl.id = 'pipTime';
      timeEl.textContent = formatTime(state.remainingMs);

      // Mode display
      const modeEl = doc.createElement('div');
      modeEl.className = 'pip-mode';
      modeEl.id = 'pipMode';
      modeEl.textContent = state.mode === 'focus' ? 'מיקוד' : (state.mode === 'long' ? 'הפסקה ארוכה' : 'הפסקה קצרה');

      content.appendChild(timeEl);
      content.appendChild(modeEl);
      container.appendChild(closeBtn);
      container.appendChild(content);
      doc.body.appendChild(container);

      // Click anywhere to open main overlay
      doc.body.onclick = (e) => {
        if (e.target !== closeBtn) {
          const overlay = document.getElementById('pomodoroOverlay');
          if (overlay) overlay.classList.add('open');
          window.focus();
        }
      };

      return { timeEl, modeEl };
    };

    // Update the PiP window content
    const updatePiPContent = () => {
      if (!pipWindow || pipWindow.closed) {
        stopPiP();
        return;
      }
      const timeEl = pipWindow.document.getElementById('pipTime');
      const modeEl = pipWindow.document.getElementById('pipMode');
      if (timeEl) timeEl.textContent = formatTime(state.remainingMs);
      if (modeEl) modeEl.textContent = state.mode === 'focus' ? 'מיקוד' : (state.mode === 'long' ? 'הפסקה ארוכה' : 'הפסקה קצרה');
    };

    // Start Document PiP (modern approach)
    const startDocumentPiP = async () => {
      try {
        pipStarting = true;

        // Request a PiP window with specific dimensions matching mini timer
        pipWindow = await documentPictureInPicture.requestWindow({
          width: 200,
          height: 70
        });

        // Create content in the PiP window
        createPiPContent(pipWindow.document);

        isPiPActive = true;
        if (refs.pipBtn) refs.pipBtn.classList.add('active');

        // Start update loop
        pipUpdateInterval = setInterval(updatePiPContent, 100);

        // Handle window close
        pipWindow.addEventListener('pagehide', () => {
          isPiPActive = false;
          if (refs.pipBtn) refs.pipBtn.classList.remove('active');
          if (pipUpdateInterval) {
            clearInterval(pipUpdateInterval);
            pipUpdateInterval = null;
          }
          pipWindow = null;
        });

        pipStarting = false;
        return true;
      } catch (error) {
        console.error('Document PiP error:', error);
        pipStarting = false;
        return false;
      }
    };

    // Legacy video-based PiP variables
    let pipVideo = null;
    let pipAnimationFrame = null;
    let pipStream = null;

    const drawPiPCanvas = () => {
      if (!refs.pipCanvas) return;
      const canvas = refs.pipCanvas;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, canvas.width, canvas.height);

      const closeBtnX = 24;
      const closeBtnY = canvas.height / 2;
      ctx.fillStyle = '#f3f4f6';
      ctx.beginPath();
      ctx.arc(closeBtnX, closeBtnY, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9ca3af';
      ctx.font = '18px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('×', closeBtnX, closeBtnY);

      const time = formatTime(state.remainingMs);
      ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#667eea';
      ctx.fillText(time, canvas.width / 2 + 10, canvas.height / 2 - 10);

      const modeLabel = state.mode === 'focus' ? 'מיקוד' : (state.mode === 'long' ? 'הפסקה ארוכה' : 'הפסקה קצרה');
      ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#9ca3af';
      ctx.fillText(modeLabel, canvas.width / 2 + 10, canvas.height / 2 + 12);
    };

    const updatePiPCanvas = () => {
      if (!isPiPActive) return;
      drawPiPCanvas();
      pipAnimationFrame = requestAnimationFrame(updatePiPCanvas);
    };

    // Legacy video-based PiP
    const startVideoPiP = async () => {
      if (!refs.pipCanvas || typeof refs.pipCanvas.captureStream !== 'function') return false;

      try {
        pipStarting = true;
        drawPiPCanvas();

        if (!pipVideo) {
          pipVideo = document.createElement('video');
          pipVideo.muted = true;
          pipVideo.autoplay = true;
          pipVideo.loop = true;
          pipVideo.playsInline = true;
          pipVideo.style.display = 'none';
          document.body.appendChild(pipVideo);
        }

        if (pipStream) {
          pipStream.getTracks().forEach(track => track.stop());
        }
        pipStream = refs.pipCanvas.captureStream(30);
        pipVideo.srcObject = pipStream;

        await pipVideo.play();
        await pipVideo.requestPictureInPicture();

        isPiPActive = true;
        if (refs.pipBtn) refs.pipBtn.classList.add('active');
        updatePiPCanvas();

        const handleLeavePiP = () => {
          isPiPActive = false;
          if (refs.pipBtn) refs.pipBtn.classList.remove('active');
          if (pipAnimationFrame) {
            cancelAnimationFrame(pipAnimationFrame);
            pipAnimationFrame = null;
          }
          pipVideo.removeEventListener('leavepictureinpicture', handleLeavePiP);
        };

        pipVideo.addEventListener('leavepictureinpicture', handleLeavePiP);
        pipStarting = false;
        return true;
      } catch (error) {
        console.error('Video PiP error:', error);
        pipStarting = false;
        return false;
      }
    };

    const startPiP = async () => {
      if (pipStarting || isPiPActive) return false;

      // Try Document PiP first (better quality)
      if (isDocumentPiPSupported()) {
        return await startDocumentPiP();
      }

      // Fall back to video-based PiP
      if (isVideoPiPSupported()) {
        return await startVideoPiP();
      }

      window.alert('Picture-in-Picture אינו נתמך בדפדפן זה.\nנסה Chrome, Edge, או Safari.');
      return false;
    };

    const stopPiP = async () => {
      // Stop Document PiP
      if (pipWindow && !pipWindow.closed) {
        pipWindow.close();
        pipWindow = null;
      }
      if (pipUpdateInterval) {
        clearInterval(pipUpdateInterval);
        pipUpdateInterval = null;
      }

      // Stop video-based PiP
      if (document.pictureInPictureElement) {
        try {
          await document.exitPictureInPicture();
        } catch (e) {
          console.error('PiP exit error:', e);
        }
      }
      if (pipAnimationFrame) {
        cancelAnimationFrame(pipAnimationFrame);
        pipAnimationFrame = null;
      }

      isPiPActive = false;
      if (refs.pipBtn) refs.pipBtn.classList.remove('active');
    };

    const initPiP = () => {
      if (!refs.pipBtn) return;

      const pipSupported = isPiPSupported();

      refs.pipBtn.addEventListener('click', async () => {
        if (pipSupported) {
          if (isPiPActive) {
            await stopPiP();
          } else {
            const started = await startPiP();
            if (!started || !document.pictureInPictureElement) setMiniVisible(true, true);
          }
          return;
        }
        // Fallback: show a draggable mini timer (works even when PiP isn't supported).
        const currentlyVisible = !!refs.mini && refs.mini.classList.contains('visible');
        setMiniVisible(!currentlyVisible);
      });

      if (!pipSupported) {
        refs.pipBtn.title = 'הצג מיני-טיימר צף (גרירה להזזה)';
      } else {
        refs.pipBtn.title = 'הצג כחלון צף (Picture-in-Picture)';
      }
    };

    const init = () => {
      if (!refs.card) return;
      const savedPreset = localStorage.getItem(KEYS.PRESET) || 'classic';
      const baseConfig = savedPreset === 'custom' ? (loadCustom() || presets.classic) : (presets[savedPreset] || presets.classic);
      applyConfig(baseConfig, savedPreset);
      renderStats();

      if (refs.autoContinue) {
        refs.autoContinue.checked = settings.autoContinue;
        refs.autoContinue.addEventListener('change', () => {
          settings.autoContinue = refs.autoContinue.checked;
          saveSettings();
        });
      }

      if (refs.soundSelect) {
        refs.soundSelect.value = settings.sound;
        refs.soundSelect.addEventListener('change', () => {
          settings.sound = refs.soundSelect.value;
          saveSettings();
        });
      }

      if (refs.soundLengthSelect) {
        refs.soundLengthSelect.value = String(normalizeSoundRepeat(settings.soundRepeat, 3));
        refs.soundLengthSelect.addEventListener('change', () => {
          settings.soundRepeat = normalizeSoundRepeat(refs.soundLengthSelect.value, 3);
          saveSettings();
        });
      }

      // Sound enabled toggle
      if (refs.soundEnabled) {
        refs.soundEnabled.checked = settings.soundEnabled;
        refs.soundEnabled.addEventListener('change', () => {
          settings.soundEnabled = refs.soundEnabled.checked;
          saveSettings();
          // Update sound select visibility
          if (refs.soundSelect) {
            refs.soundSelect.style.opacity = settings.soundEnabled ? '1' : '0.5';
          }
          if (refs.soundLengthSelect) {
            refs.soundLengthSelect.style.opacity = settings.soundEnabled ? '1' : '0.5';
          }
          if (refs.previewBtn) {
            refs.previewBtn.style.opacity = settings.soundEnabled ? '1' : '0.5';
          }
        });
        // Initial state
        if (refs.soundSelect) refs.soundSelect.style.opacity = settings.soundEnabled ? '1' : '0.5';
        if (refs.soundLengthSelect) refs.soundLengthSelect.style.opacity = settings.soundEnabled ? '1' : '0.5';
        if (refs.previewBtn) refs.previewBtn.style.opacity = settings.soundEnabled ? '1' : '0.5';
      }

      if (refs.previewBtn) {
        refs.previewBtn.addEventListener('click', () => {
          const key = (refs.soundSelect && refs.soundSelect.value) || settings.sound || 'chime';
          const pattern = tonePatterns[key] || tonePatterns.chime;
          playExtendedAlarm(pattern, getSoundRepeatCount());
        });
      }

      refs.presets.forEach(btn => btn.addEventListener('click', () => selectPreset(btn.dataset.preset)));

      [refs.focusInput, refs.breakInput, refs.longInput, refs.longEveryInput].forEach(input => {
        if (!input) return;
        input.addEventListener('change', handleCustomChange);
        input.addEventListener('input', () => state.preset = 'custom');
      });

      if (refs.startBtn) {
        refs.startBtn.onclick = () => {
          if (state.running) {
            pause();
            return;
          }
          playStartClick();
          start();
        };
      }
      if (refs.skipBtn) refs.skipBtn.onclick = () => advance(false);
      if (refs.resetBtn) refs.resetBtn.onclick = reset;

      // Mini player setup
      let miniDragging = false;
      let miniDragged = false;
      try {
        const legacy = localStorage.getItem(LEGACY_MINI_KEY);
        if (legacy !== null && localStorage.getItem(MINI_KEY) === null) {
          localStorage.setItem(MINI_KEY, legacy);
        }
      } catch (e) { }
      const miniEnabled = localStorage.getItem(MINI_KEY) === 'true';
      setMiniVisible(miniEnabled);
      if (refs.miniToggle) {
        refs.miniToggle.addEventListener('change', () => {
          setMiniVisible(refs.miniToggle.checked);
        });
      }
      if (refs.miniClose) {
        refs.miniClose.addEventListener('click', () => {
          setMiniVisible(false, true);
        });
      }
      // Restore mini player position (if dragged previously)
      if (refs.mini) {
        try {
          const raw = localStorage.getItem(MINI_POS_KEY);
          const parsed = raw ? JSON.parse(raw) : null;
          if (parsed && Number.isFinite(parsed.left) && Number.isFinite(parsed.top)) {
            refs.mini.style.left = `${parsed.left}px`;
            refs.mini.style.top = `${parsed.top}px`;
            refs.mini.style.right = 'auto';
            refs.mini.style.bottom = 'auto';
          }
        } catch (e) { }
      }
      // Draggable mini player
      if (refs.mini) {
        const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
        refs.mini.addEventListener('pointerdown', (e) => {
          if (e.button !== undefined && e.button !== 0) return;
          if (e.target === refs.miniClose) return;
          e.preventDefault();
          miniDragged = false;
          miniDragging = true;
          refs.mini.classList.add('dragging');
          try { refs.mini.setPointerCapture(e.pointerId); } catch (err) { }

          const startX = e.clientX;
          const startY = e.clientY;
          const rect = refs.mini.getBoundingClientRect();
          const offsetX = startX - rect.left;
          const offsetY = startY - rect.top;

          const move = (ev) => {
            if (!miniDragging) return;
            const dx = Math.abs(ev.clientX - startX);
            const dy = Math.abs(ev.clientY - startY);
            if (dx + dy > 4) miniDragged = true;

            const maxLeft = window.innerWidth - rect.width - 8;
            const maxTop = window.innerHeight - rect.height - 8;
            const left = clamp(ev.clientX - offsetX, 8, Math.max(8, maxLeft));
            const top = clamp(ev.clientY - offsetY, 8, Math.max(8, maxTop));
            refs.mini.style.left = `${left}px`;
            refs.mini.style.top = `${top}px`;
            refs.mini.style.right = 'auto';
            refs.mini.style.bottom = 'auto';
          };

          const up = () => {
            if (!miniDragging) return;
            miniDragging = false;
            refs.mini.classList.remove('dragging');
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            try {
              const r = refs.mini.getBoundingClientRect();
              localStorage.setItem(MINI_POS_KEY, JSON.stringify({ left: Math.round(r.left), top: Math.round(r.top) }));
            } catch (err) { }
          };

          window.addEventListener('pointermove', move, { passive: true });
          window.addEventListener('pointerup', up, { passive: true });
          window.addEventListener('pointercancel', up, { passive: true });
        });
      }
      // Click on mini player opens Pomodoro overlay
      if (refs.mini) {
        refs.mini.addEventListener('click', (e) => {
          if (e.target === refs.miniClose) return;
          if (miniDragged) return;
          const overlay = document.getElementById('pomodoroOverlay');
          if (overlay) overlay.classList.add('open');
        });
      }

      // Picture-in-Picture setup
      initPiP();

      // Handle visibility change - force tick when tab becomes visible
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && state.running) {
          tick(); // Update immediately when returning to tab
        }
      });

      updatePresetButtons();
      render();
      updateTaskOptions();
    };

    const updateTasks = (tasks = []) => {
      tasksCache = tasks;
      updateTaskOptions();
    };

    return { init, updateTasks };
  })();

  return Pomodoro;
}
