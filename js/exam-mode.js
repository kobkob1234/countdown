/**
 * Exam Mode Logic
 * Dynamic 3-month calendar with editable topics, colors, and month navigation.
 */

(function () {
    // Legacy class names for migration
    const LEGACY_COLOR_CLASSES = [
        'stat-new', 'stat-review', 'stat-test', 'econ', 'game',
        'vacation', 'rest', 'focus', 'deadline', 'project', 'admin'
    ];

    // Generic topic class names
    const MAX_TOPICS = 10;
    const getTopicClasses = () => {
        const classes = [];
        for (let i = 1; i <= MAX_TOPICS; i++) classes.push(`topic-${i}`);
        return classes;
    };

    const ALL_COLOR_CLASSES = [...getTopicClasses(), ...LEGACY_COLOR_CLASSES];

    let examModeInitialized = false;
    let overlay = null;
    let colorClickTimer = null;
    let currentMonthOffset = 0; // 0 = starting from current month
    let visibleMonthCount = 3;

    const clearColorClickTimer = () => {
        if (colorClickTimer) {
            clearTimeout(colorClickTimer);
            colorClickTimer = null;
        }
    };

    const setChipColor = (chip, colorClass) => {
        if (!chip || !colorClass) return;
        ALL_COLOR_CLASSES.forEach(cls => chip.classList.remove(cls));
        chip.classList.add(colorClass);
    };

    const ensureChipLabel = (chip) => {
        let label = chip.querySelector('.chip-label');
        if (!label) {
            label = document.createElement('span');
            label.className = 'chip-label';
            label.dataset.placeholder = 'הוסף אירוע';
            const text = chip.textContent.trim();
            chip.textContent = '';
            label.textContent = text;
            chip.appendChild(label);
        } else if (!label.dataset.placeholder) {
            label.dataset.placeholder = 'הוסף אירוע';
        }
        return label;
    };

    const startChipEdit = (chip) => {
        if (!chip || chip.classList.contains('editing')) return;
        const label = ensureChipLabel(chip);
        const prevText = label.textContent;

        chip.classList.add('editing');
        label.contentEditable = 'true';
        label.spellcheck = false;
        label.focus();

        const range = document.createRange();
        range.selectNodeContents(label);
        if (prevText && prevText.trim() !== '') range.collapse(false);
        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
        }

        const finishEdit = (shouldSave) => {
            label.contentEditable = 'false';
            chip.classList.remove('editing');
            label.removeEventListener('blur', onBlur);
            label.removeEventListener('keydown', onKeyDown);
            if (!shouldSave) label.textContent = prevText;
            const container = chip.closest('.container');
            if (container) saveExamState(container);
        };

        const onBlur = () => finishEdit(true);
        const onKeyDown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finishEdit(true);
                const currentText = label.textContent.trim();
                const container = chip.closest('.container');
                if (currentText && container) {
                    const parentTd = chip.parentElement;
                    const addBtn = parentTd.querySelector('.add-tile-btn');
                    const color = chip.style.background;
                    createChipWithColor(parentTd, container, addBtn, color);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                finishEdit(false);
            }
        };

        label.addEventListener('blur', onBlur);
        label.addEventListener('keydown', onKeyDown);
    };

    const addChipControls = (chip) => {
        const check = document.createElement('span');
        check.className = 'chip-check';
        check.textContent = '';
        check.contentEditable = false;
        check.addEventListener('click', (e) => toggleTaskCompletion(e, chip));

        const del = document.createElement('span');
        del.className = 'chip-delete';
        del.textContent = '×';
        del.contentEditable = false;
        del.addEventListener('click', (e) => deleteTask(e, chip));

        const drag = document.createElement('span');
        drag.className = 'chip-drag-handle';
        drag.textContent = '⋮⋮';
        drag.contentEditable = false;

        const colorSwatch = document.createElement('span');
        colorSwatch.className = 'chip-color-swatch';
        colorSwatch.textContent = '🎨';
        colorSwatch.contentEditable = false;
        colorSwatch.title = 'שנה צבע';
        colorSwatch.addEventListener('click', (e) => {
            e.stopPropagation();
            showChipColorChange(e, chip);
        });

        chip.appendChild(check);
        chip.appendChild(del);
        chip.appendChild(colorSwatch);
        chip.appendChild(drag);
    };

    const ensureWeeklyGoals = (container) => {
        if (!container) return;
        const tables = container.querySelectorAll('table');
        tables.forEach(table => {
            const tbody = table.querySelector('tbody');
            if (!tbody) return;
            const rows = Array.from(tbody.querySelectorAll('tr')).filter(row => !row.classList.contains('week-goal-row'));
            rows.forEach(row => {
                const nextRow = row.nextElementSibling;
                if (nextRow && nextRow.classList.contains('week-goal-row')) return;
                const goalRow = document.createElement('tr');
                goalRow.className = 'week-goal-row';
                const cell = document.createElement('td');
                cell.colSpan = 7;
                cell.innerHTML = `
                    <div class="week-goal">
                        <span class="week-goal-label">יעד שבועי:</span>
                        <span class="week-goal-text" contenteditable="true" data-placeholder="לדוגמה: לסגור נושא 8 + 2 מבחנים"></span>
                        <div class="week-goal-progress">
                            <div class="week-goal-bar"><div class="week-goal-fill" style="width:0%"></div></div>
                            <span class="week-goal-count">0/0</span>
                            <span class="week-goal-percent">0%</span>
                        </div>
                    </div>
                `;
                goalRow.appendChild(cell);
                row.after(goalRow);
            });
        });
    };

    const updateWeekProgress = (container) => {
        if (!container) return;
        container.querySelectorAll('.week-goal-row').forEach(goalRow => {
            const weekRow = goalRow.previousElementSibling;
            if (!weekRow) return;
            const chips = weekRow.querySelectorAll('.chip');
            const completed = weekRow.querySelectorAll('.chip.completed').length;
            const total = chips.length;
            const percent = total ? Math.round((completed / total) * 100) : 0;
            const fill = goalRow.querySelector('.week-goal-fill');
            const count = goalRow.querySelector('.week-goal-count');
            const percentEl = goalRow.querySelector('.week-goal-percent');
            if (fill) fill.style.width = `${percent}%`;
            if (count) count.textContent = `${completed}/${total}`;
            if (percentEl) percentEl.textContent = `${percent}%`;
        });
    };

    const enableExamTextEditing = (container) => {
        if (!container) return;
        const editableNodes = container.querySelectorAll('h1, h2');
        editableNodes.forEach(node => {
            node.classList.add('exam-editable');
            node.setAttribute('contenteditable', 'true');
            node.setAttribute('spellcheck', 'false');
        });
    };

    const refreshExamCells = (container) => {
        if (!container) return;

        container.querySelectorAll('td').forEach(td => {
            if (td.closest('.week-goal-row')) return;
            const existingBtn = td.querySelector('.add-tile-btn');
            if (existingBtn) existingBtn.remove();

            const btn = document.createElement('div');
            btn.className = 'add-tile-btn';
            btn.innerHTML = '+';
            btn.contentEditable = false;
            btn.onclick = (e) => {
                e.stopPropagation();
                showChipColorPicker(btn, td, container);
            };
            td.appendChild(btn);

            if (!td.querySelector('.day-passed-toggle')) {
                const passedToggle = document.createElement('div');
                passedToggle.className = 'day-passed-toggle';
                passedToggle.title = 'סמן יום שעבר';
                passedToggle.onclick = (e) => {
                    e.stopPropagation();
                    toggleDayPassed(td, container);
                };
                td.appendChild(passedToggle);
            }

            if (!td.querySelector('.day-passed-x')) {
                const xOverlay = document.createElement('div');
                xOverlay.className = 'day-passed-x';
                td.appendChild(xOverlay);
            }

            if (!td.querySelector('.exam-day-toggle')) {
                const examToggle = document.createElement('div');
                examToggle.className = 'exam-day-toggle';
                examToggle.title = 'סמן כיום מבחן';
                examToggle.innerHTML = '🎨';
                examToggle.onclick = (e) => {
                    e.stopPropagation();
                    toggleExamDay(td, container);
                };
                td.appendChild(examToggle);
            }

            if (td.classList.contains('exam-day') && !td.querySelector('.exam-banner')) {
                const banner = document.createElement('div');
                banner.className = 'exam-banner';
                banner.contentEditable = 'true';
                banner.spellcheck = false;
                banner.dataset.placeholder = 'שם מבחן...';
                banner.addEventListener('blur', () => saveExamState(container));
                td.appendChild(banner);
            }

            const existingBanner = td.querySelector('.exam-banner');
            if (existingBanner) {
                existingBanner.contentEditable = 'true';
                existingBanner.spellcheck = false;
                if (!existingBanner.dataset.placeholder) {
                    existingBanner.dataset.placeholder = 'שם מבחן...';
                }

                let bannerWrapper = existingBanner.closest('.exam-banner-wrapper');
                if (!bannerWrapper) {
                    bannerWrapper = document.createElement('div');
                    bannerWrapper.className = 'exam-banner-wrapper';
                    existingBanner.before(bannerWrapper);
                    bannerWrapper.appendChild(existingBanner);
                }

                if (!bannerWrapper.querySelector('.exam-countdown-toggle')) {
                    const countdownBtn = document.createElement('span');
                    countdownBtn.className = 'exam-countdown-toggle';
                    if (td.classList.contains('countdown-enabled')) {
                        countdownBtn.classList.add('active');
                    }
                    countdownBtn.innerHTML = '<span class="icon" style="font-size:14px">timer</span>';
                    countdownBtn.title = 'הפעל ספירה לאחור';
                    countdownBtn.onclick = (e) => {
                        e.stopPropagation();
                        td.classList.toggle('countdown-enabled');
                        countdownBtn.classList.toggle('active');
                        saveExamState(container);
                        updateExamCountdowns(container);
                    };
                    bannerWrapper.appendChild(countdownBtn);
                }

                if (!bannerWrapper.querySelector('.exam-banner-color-btn')) {
                    const colorBtn = document.createElement('span');
                    colorBtn.className = 'exam-banner-color-btn';
                    colorBtn.innerHTML = '<span class="icon" style="font-size:14px">palette</span>';
                    colorBtn.title = 'שנה צבע';
                    colorBtn.onclick = (e) => {
                        e.stopPropagation();
                        showExamBannerColorPicker(colorBtn, existingBanner, container);
                    };
                    bannerWrapper.appendChild(colorBtn);
                }

                if (!bannerWrapper.querySelector('.exam-tile-color-btn')) {
                    const tileColorBtn = document.createElement('span');
                    tileColorBtn.className = 'exam-tile-color-btn';
                    tileColorBtn.innerHTML = '<span class="icon" style="font-size:14px">palette</span>';
                    tileColorBtn.title = 'שנה צבע תא';
                    tileColorBtn.onclick = (e) => {
                        e.stopPropagation();
                        showExamTileColorPicker(tileColorBtn, td, container);
                    };
                    bannerWrapper.appendChild(tileColorBtn);
                }
            }
        });

        container.querySelectorAll('.chip').forEach(chip => {
            if (chip.closest('.week-goal-row')) return;
            chip.contentEditable = false;
            chip.draggable = true;
            chip.spellcheck = false;
            chip.querySelectorAll('.chip-check, .chip-delete, .chip-drag-handle, .chip-color-swatch').forEach(el => el.remove());
            ensureChipLabel(chip);
            addChipControls(chip);
        });
    };

    const setupDragAndDrop = (container) => {
        if (!container || container.dataset.dragSetup === 'true') return;
        container.dataset.dragSetup = 'true';

        let draggedItem = null;

        container.addEventListener('dragstart', (e) => {
            const chip = e.target.closest('.chip');
            if (!chip || chip.closest('.week-goal-row')) return;
            if (e.target.closest('.chip-check, .chip-delete')) { e.preventDefault(); return; }
            if (chip.classList.contains('editing')) { e.preventDefault(); return; }
            draggedItem = chip;
            chip.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', '');
        });

        container.addEventListener('dragend', () => {
            if (draggedItem) { draggedItem.classList.remove('dragging'); draggedItem = null; }
            container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        });

        container.addEventListener('dragover', (e) => {
            if (!draggedItem) return;
            e.preventDefault();
            const targetTd = e.target.closest('td');
            container.querySelectorAll('.drag-over').forEach(el => { if (el !== targetTd) el.classList.remove('drag-over'); });
            if (targetTd && !targetTd.closest('.week-goal-row')) {
                targetTd.classList.add('drag-over');
                e.dataTransfer.dropEffect = 'move';
            }
        });

        container.addEventListener('dragleave', (e) => {
            const targetTd = e.target.closest('td');
            if (targetTd && !targetTd.contains(e.relatedTarget)) targetTd.classList.remove('drag-over');
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!draggedItem) return;
            const targetTd = e.target.closest('td');
            if (!targetTd || targetTd.closest('.week-goal-row')) return;
            const targetChip = e.target.closest('.chip');
            if (targetChip && targetChip !== draggedItem) {
                const bounding = targetChip.getBoundingClientRect();
                const offset = bounding.y + (bounding.height / 2);
                if (e.clientY - offset > 0) targetChip.after(draggedItem);
                else targetChip.before(draggedItem);
            } else {
                const btn = targetTd.querySelector('.add-tile-btn');
                if (btn) btn.before(draggedItem);
                else targetTd.appendChild(draggedItem);
            }
            draggedItem.classList.remove('dragging');
            draggedItem = null;
            container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            saveExamState(container);
        });
    };

    const handleChipClick = (container, e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        if (e.target.closest('.chip-check, .chip-delete, .chip-drag-handle')) return;
        if (chip.classList.contains('editing')) return;
        clearColorClickTimer();
        colorClickTimer = setTimeout(() => {
            setChipColor(chip, window.activeExamColor);
            // Also apply custom color if set
            if (window.activeExamCustomColor) {
                chip.style.background = window.activeExamCustomColor;
            }
            saveExamState(container);
            colorClickTimer = null;
        }, 200);
    };

    const handleChipDoubleClick = (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        if (e.target.closest('.chip-check, .chip-delete, .chip-drag-handle')) return;
        clearColorClickTimer();
        startChipEdit(chip);
    };

    // ===========================
    // MONTH GENERATION
    // ===========================

    const HEBREW_MONTHS = [
        'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
        'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
    ];

    const DAY_HEADERS = ['א\'', 'ב\'', 'ג\'', 'ד\'', 'ה\'', 'ו\'', 'ש\''];

    function getMonthKey(year, month) {
        return `${year}-${String(month + 1).padStart(2, '0')}`;
    }

    function generateMonthTable(year, month) {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        // JS: 0=Sun. Hebrew calendar: 0=Sun=א
        const firstDay = new Date(year, month, 1).getDay();

        const table = document.createElement('table');
        table.dataset.month = getMonthKey(year, month);

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        DAY_HEADERS.forEach(d => {
            const th = document.createElement('th');
            th.textContent = d;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        let currentDay = 1;
        let rowCount = 0;
        const now = new Date();

        while (currentDay <= daysInMonth) {
            const tr = document.createElement('tr');
            for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
                const td = document.createElement('td');
                if ((rowCount === 0 && dayOfWeek < firstDay) || currentDay > daysInMonth) {
                    td.innerHTML = '&nbsp;';
                    td.classList.add('empty-cell');
                } else {
                    const dateSpan = document.createElement('span');
                    dateSpan.className = 'date';
                    dateSpan.textContent = `${currentDay}/${month + 1}`;
                    td.appendChild(dateSpan);
                    if (year === now.getFullYear() && month === now.getMonth() && currentDay === now.getDate()) {
                        td.classList.add('exam-today');
                    }
                    currentDay++;
                }
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
            rowCount++;
        }

        table.appendChild(tbody);
        return table;
    }

    function generateMonthHeader(year, month) {
        const h2 = document.createElement('h2');
        h2.textContent = `${HEBREW_MONTHS[month]} ${year}`;
        h2.dataset.month = getMonthKey(year, month);
        return h2;
    }

    // ===========================
    // PER-MONTH DATA STORAGE
    // ===========================

    function getMonthDataKey(monthKey) {
        return `examMonth_${monthKey}`;
    }

    function saveMonthData(container, monthKey, tableEl) {
        const clone = tableEl.cloneNode(true);
        // Clean interactive elements
        clone.querySelectorAll('.add-tile-btn, .chip-check, .chip-delete, .chip-drag-handle, .chip-color-swatch, .day-passed-toggle, .day-passed-x, .exam-day-toggle, .exam-banner-color-btn, .exam-tile-color-btn, .exam-countdown-toggle, .countdown-badge').forEach(el => el.remove());
        clone.querySelectorAll('.chip').forEach(c => {
            c.removeAttribute('contenteditable');
            c.removeAttribute('spellcheck');
            c.removeAttribute('draggable');
            c.classList.remove('editing');
        });
        clone.querySelectorAll('.chip-label').forEach(l => {
            l.removeAttribute('contenteditable');
            l.removeAttribute('spellcheck');
        });
        clone.querySelectorAll('.exam-banner').forEach(b => {
            b.removeAttribute('contenteditable');
            b.removeAttribute('spellcheck');
        });
        localStorage.setItem(getMonthDataKey(monthKey), clone.innerHTML);
    }

    function loadMonthData(monthKey) {
        return localStorage.getItem(getMonthDataKey(monthKey));
    }

    // ===========================
    // MIGRATION: old format -> per-month
    // ===========================

    const LEGACY_TO_GENERIC = {
        'stat-new': 'topic-1',
        'stat-review': 'topic-2',
        'stat-test': 'topic-3',
        'econ': 'topic-4',
        'game': 'topic-5',
        'vacation': 'topic-6',
        'rest': 'topic-7',
        'focus': 'topic-8'
    };

    function migrateOldData() {
        const oldContent = localStorage.getItem('examModeContent');
        if (!oldContent || localStorage.getItem('examMigrated') === 'true') return false;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = oldContent;

        // The old format had 3 tables for Jan(1), Feb(2), Mar(3) of 2025/2026
        const tables = tempDiv.querySelectorAll('table');
        const h2s = tempDiv.querySelectorAll('h2');

        // Try to detect year from dates or use current year
        const now = new Date();
        let year = now.getFullYear();
        // Old data was for Jan-Mar exam period
        const monthMap = [0, 1, 2]; // Jan, Feb, Mar

        tables.forEach((table, i) => {
            if (i >= 3) return;
            const month = monthMap[i];
            const monthKey = getMonthKey(year, month);

            // Migrate chip classes
            table.querySelectorAll('.chip').forEach(chip => {
                for (const [legacy, generic] of Object.entries(LEGACY_TO_GENERIC)) {
                    if (chip.classList.contains(legacy)) {
                        chip.classList.remove(legacy);
                        chip.classList.add(generic);
                    }
                }
            });

            localStorage.setItem(getMonthDataKey(monthKey), table.innerHTML);

            // Save h2 title if exists
            if (h2s[i]) {
                localStorage.setItem(`examMonthTitle_${monthKey}`, h2s[i].textContent);
            }
        });

        // Migrate title
        const h1 = tempDiv.querySelector('h1');
        if (h1) {
            localStorage.setItem('examTitle', h1.textContent);
        }

        // Migrate legend config to generic IDs
        const savedLegend = JSON.parse(localStorage.getItem('examLegendConfig') || 'null');
        if (savedLegend) {
            const newLegend = savedLegend.map(item => {
                const newId = LEGACY_TO_GENERIC[item.id] || item.id;
                return { ...item, id: newId };
            });
            localStorage.setItem('examLegendConfig', JSON.stringify(newLegend));
        }

        localStorage.setItem('examMigrated', 'true');
        return true;
    }

    // ===========================
    // RENDER MONTHS
    // ===========================

    function renderMonths(container) {
        // Remove existing tables and h2s (but not h1 or controls)
        container.querySelectorAll('table, h2, .exam-month-nav').forEach(el => el.remove());

        const now = new Date();
        const baseMonth = now.getMonth() + currentMonthOffset;
        const baseYear = now.getFullYear();

        // Add navigation
        const nav = document.createElement('div');
        nav.className = 'exam-month-nav';

        const prevBtn = document.createElement('button');
        prevBtn.className = 'nav-btn';
        prevBtn.textContent = '→';
        prevBtn.title = 'חודשים קודמים';
        prevBtn.onclick = () => { currentMonthOffset -= 1; renderMonths(container); };

        const nextBtn = document.createElement('button');
        nextBtn.className = 'nav-btn';
        nextBtn.textContent = '←';
        nextBtn.title = 'חודשים הבאים';
        nextBtn.onclick = () => { currentMonthOffset += 1; renderMonths(container); };

        const todayBtn = document.createElement('button');
        todayBtn.className = 'nav-btn';
        todayBtn.textContent = 'היום';
        todayBtn.style.fontSize = '0.85em';
        todayBtn.onclick = () => { currentMonthOffset = 0; renderMonths(container); };

        const label = document.createElement('span');
        label.className = 'nav-label';

        const startDate = new Date(baseYear, baseMonth, 1);
        const endDate = new Date(baseYear, baseMonth + visibleMonthCount - 1, 1);
        label.textContent = `${HEBREW_MONTHS[startDate.getMonth()]} ${startDate.getFullYear()} - ${HEBREW_MONTHS[endDate.getMonth()]} ${endDate.getFullYear()}`;

        nav.appendChild(prevBtn);
        nav.appendChild(todayBtn);
        nav.appendChild(label);
        nav.appendChild(nextBtn);

        // Insert nav after h1
        const h1 = container.querySelector('h1');
        if (h1) h1.after(nav);
        else container.prepend(nav);

        // Generate month tables
        for (let i = 0; i < visibleMonthCount; i++) {
            const d = new Date(baseYear, baseMonth + i, 1);
            const year = d.getFullYear();
            const month = d.getMonth();
            const monthKey = getMonthKey(year, month);

            const header = generateMonthHeader(year, month);
            // Load saved title override
            const savedTitle = localStorage.getItem(`examMonthTitle_${monthKey}`);
            if (savedTitle) header.textContent = savedTitle;

            const table = generateMonthTable(year, month);

            // Load saved content for this month
            const savedData = loadMonthData(monthKey);
            if (savedData) {
                const tbody = table.querySelector('tbody');
                if (tbody) {
                    // Replace tbody content with saved data (which includes thead+tbody)
                    const tempTable = document.createElement('table');
                    tempTable.innerHTML = savedData;
                    const savedTbody = tempTable.querySelector('tbody');
                    if (savedTbody) {
                        tbody.innerHTML = savedTbody.innerHTML;
                    }
                }
            }

            // Re-apply today highlighting (saved data doesn't preserve it)
            const now = new Date();
            if (year === now.getFullYear() && month === now.getMonth()) {
                const cells = table.querySelectorAll('td:not(.empty-cell)');
                cells.forEach(cell => {
                    const dateSpan = cell.querySelector('.date');
                    if (dateSpan) {
                        const dayNum = parseInt(dateSpan.textContent);
                        if (dayNum === now.getDate()) cell.classList.add('exam-today');
                    }
                });
            }

            container.appendChild(header);
            container.appendChild(table);
        }

        // Re-apply interactions
        container.removeAttribute('data-drag-setup');
        container.dataset.dragSetup = '';
        setupExamInteractionsInternal(container);
    }

    // ===========================
    // LEGEND / TOPICS
    // ===========================

    const PRESET_COLORS = [
        '#0ea5e9', '#f97316', '#22c55e', '#ef4444',
        '#a855f7', '#eab308', '#64748b', '#f472b6'
    ];

    const DEFAULT_LEGEND = [
        { id: 'topic-1', color: '#0ea5e9', name: 'נושא 1' },
        { id: 'topic-2', color: '#f97316', name: 'נושא 2' },
        { id: 'topic-3', color: '#22c55e', name: 'נושא 3' },
        { id: 'topic-4', color: '#eab308', name: 'נושא 4' },
        { id: 'topic-5', color: '#a855f7', name: 'נושא 5' },
        { id: 'topic-6', color: '#64748b', name: 'מנוחה' }
    ];

    function getLegendConfig() {
        const saved = JSON.parse(localStorage.getItem('examLegendConfig') || 'null');
        return saved || DEFAULT_LEGEND;
    }

    function buildLegendHTML(legendConfig) {
        let html = '';
        legendConfig.forEach(item => {
            html += `
                <div class="legend-tag" data-color-id="${item.id}" data-color="${item.color}">
                    <div class="legend-color-swatch" style="background:${item.color};" title="שנה צבע"></div>
                    <span class="legend-tag-text" style="background:${item.color};" contenteditable="true" spellcheck="false">${item.name}</span>
                    <span class="legend-remove-btn" title="הסר נושא">×</span>
                </div>
            `;
        });
        return html;
    }

    function buildControls(legendConfig) {
        const controls = document.createElement('div');
        controls.className = 'exam-controls';

        let html = `
            <button class="exam-btn active" onclick="setExamView(3)">3 חודשים</button>
            <button class="exam-btn" onclick="setExamView(2)">חודשיים</button>
            <button class="exam-btn" onclick="setExamView(1)">חודש הנוכחי</button>
            <div class="exam-divider" aria-hidden="true"></div>
            <div class="exam-legend-bar">
                ${buildLegendHTML(legendConfig)}
                <div class="legend-add-topic" title="הוסף נושא">+</div>
            </div>
            <div class="exam-hint">לחיצה על תג לבחירה • לחיצה כפולה לעריכה • ניתן לשנות צבע וטקסט</div>
        `;

        controls.innerHTML = html;
        return controls;
    }

    function setupLegendInteractions(controls) {
        const legendBar = controls.querySelector('.exam-legend-bar');
        if (!legendBar) return;

        // Select first tag
        const firstTag = legendBar.querySelector('.legend-tag');
        if (firstTag) {
            firstTag.classList.add('selected');
            window.activeExamColor = firstTag.dataset.colorId;
            const tagText = firstTag.querySelector('.legend-tag-text');
            if (tagText) window.activeExamCustomColor = tagText.style.background;
        }

        legendBar.addEventListener('click', (e) => {
            // Add topic button
            if (e.target.classList.contains('legend-add-topic')) {
                addNewTopic(legendBar);
                return;
            }

            // Remove topic button
            if (e.target.classList.contains('legend-remove-btn')) {
                e.stopPropagation();
                const tag = e.target.closest('.legend-tag');
                if (tag) {
                    removeTopic(tag, legendBar);
                }
                return;
            }

            const tag = e.target.closest('.legend-tag');
            if (!tag) return;

            if (e.target.classList.contains('legend-color-swatch')) {
                e.stopPropagation();
                showColorPalette(e.target, tag, legendBar);
                return;
            }

            // Select this tag
            legendBar.querySelectorAll('.legend-tag').forEach(t => t.classList.remove('selected'));
            tag.classList.add('selected');
            window.activeExamColor = tag.dataset.colorId;
            const tagText = tag.querySelector('.legend-tag-text');
            if (tagText) window.activeExamCustomColor = tagText.style.background;
        });

        legendBar.addEventListener('blur', (e) => {
            if (e.target.classList.contains('legend-tag-text')) {
                saveLegendConfig(legendBar);
            }
        }, true);
    }

    function addNewTopic(legendBar) {
        const existingTags = legendBar.querySelectorAll('.legend-tag');
        if (existingTags.length >= MAX_TOPICS) return;

        const nextNum = existingTags.length + 1;
        // Find unused topic ID
        const usedIds = new Set(Array.from(existingTags).map(t => t.dataset.colorId));
        let topicId = `topic-${nextNum}`;
        for (let i = 1; i <= MAX_TOPICS; i++) {
            if (!usedIds.has(`topic-${i}`)) { topicId = `topic-${i}`; break; }
        }

        // Pick unused color
        const usedColors = new Set(Array.from(existingTags).map(t => t.dataset.color));
        let color = PRESET_COLORS.find(c => !usedColors.has(c)) || PRESET_COLORS[0];

        const tagDiv = document.createElement('div');
        tagDiv.className = 'legend-tag';
        tagDiv.dataset.colorId = topicId;
        tagDiv.dataset.color = color;
        tagDiv.innerHTML = `
            <div class="legend-color-swatch" style="background:${color};" title="שנה צבע"></div>
            <span class="legend-tag-text" style="background:${color};" contenteditable="true" spellcheck="false">נושא חדש</span>
            <span class="legend-remove-btn" title="הסר נושא">×</span>
        `;

        const addBtn = legendBar.querySelector('.legend-add-topic');
        legendBar.insertBefore(tagDiv, addBtn);

        saveLegendConfig(legendBar);

        // Start editing the name
        const textEl = tagDiv.querySelector('.legend-tag-text');
        if (textEl) {
            textEl.focus();
            const range = document.createRange();
            range.selectNodeContents(textEl);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }

    function removeTopic(tag, legendBar) {
        const tags = legendBar.querySelectorAll('.legend-tag');
        if (tags.length <= 1) return; // Keep at least 1

        const wasSelected = tag.classList.contains('selected');
        tag.remove();

        if (wasSelected) {
            const first = legendBar.querySelector('.legend-tag');
            if (first) {
                first.classList.add('selected');
                window.activeExamColor = first.dataset.colorId;
                const tagText = first.querySelector('.legend-tag-text');
                if (tagText) window.activeExamCustomColor = tagText.style.background;
            }
        }

        saveLegendConfig(legendBar);
    }

    // ===========================
    // COLOR PALETTES
    // ===========================

    const hexToRgba = (hex, alpha) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    function showPopup(popup, targetEl, onRemove) {
        popup.style.position = 'absolute';
        popup.style.zIndex = '10001';
        popup.style.margin = '0';
        popup.style.transform = 'none';
        document.body.appendChild(popup);

        const rect = targetEl.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        const width = popup.offsetWidth;

        let top = rect.bottom + scrollTop + 6;
        let left = rect.left + scrollLeft + (rect.width / 2) - (width / 2);

        const viewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;
        if (left + width > viewportWidth - 10) left = viewportWidth - width - 10;
        if (left < 10) left = 10;

        popup.style.top = `${top}px`;
        popup.style.left = `${left}px`;

        const closeHandler = (e) => {
            if (!popup.contains(e.target) && e.target !== targetEl && !targetEl.contains(e.target)) {
                popup.remove();
                document.removeEventListener('mousedown', closeHandler);
                if (onRemove) onRemove();
            }
        };
        setTimeout(() => document.addEventListener('mousedown', closeHandler), 10);
    }

    function showColorPalette(swatch, tag, legendBar) {
        document.querySelectorAll('.color-palette-popup').forEach(p => p.remove());
        const palette = document.createElement('div');
        palette.className = 'color-palette-popup';
        PRESET_COLORS.forEach(color => {
            const colorBtn = document.createElement('div');
            colorBtn.className = 'palette-color';
            colorBtn.style.background = color;
            colorBtn.onclick = (e) => {
                e.stopPropagation();
                applyColorToTag(tag, color, legendBar);
                palette.remove();
            };
            palette.appendChild(colorBtn);
        });
        showPopup(palette, swatch);
    }

    function applyColorToTag(tag, color, legendBar) {
        const swatch = tag.querySelector('.legend-color-swatch');
        const tagText = tag.querySelector('.legend-tag-text');
        if (swatch) swatch.style.background = color;
        if (tagText) tagText.style.background = color;
        tag.dataset.color = color;
        if (tag.classList.contains('selected')) window.activeExamCustomColor = color;
        saveLegendConfig(legendBar);
        updateChipColorsFromLegend(tag.dataset.colorId, color);
    }

    function showChipColorPicker(btn, td, container) {
        document.querySelectorAll('.chip-color-palette').forEach(p => p.remove());
        const palette = document.createElement('div');
        palette.className = 'chip-color-palette';
        PRESET_COLORS.forEach(color => {
            const colorBtn = document.createElement('div');
            colorBtn.className = 'palette-color';
            colorBtn.style.background = color;
            colorBtn.onclick = (e) => {
                e.stopPropagation();
                createChipWithColor(td, container, btn, color);
                palette.remove();
            };
            palette.appendChild(colorBtn);
        });
        showPopup(palette, btn);
    }

    function createChipWithColor(td, container, btn, color) {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.style.background = color;
        const label = document.createElement('span');
        label.className = 'chip-label';
        label.dataset.placeholder = 'הוסף אירוע';
        chip.appendChild(label);
        addChipControls(chip);
        td.insertBefore(chip, btn);
        startChipEdit(chip);
        saveExamState(container);
    }

    function showChipColorChange(e, chip) {
        document.querySelectorAll('.chip-color-palette').forEach(p => p.remove());
        const palette = document.createElement('div');
        palette.className = 'chip-color-palette chip-inline-palette';

        const removeBtn = document.createElement('div');
        removeBtn.className = 'palette-color palette-remove';
        removeBtn.innerHTML = '×';
        removeBtn.title = 'מחק אירוע';
        removeBtn.onclick = (ev) => {
            ev.stopPropagation();
            const container = chip.closest('.container');
            chip.remove();
            if (container) saveExamState(container);
            palette.remove();
        };
        palette.appendChild(removeBtn);

        PRESET_COLORS.forEach(color => {
            const colorBtn = document.createElement('div');
            colorBtn.className = 'palette-color';
            colorBtn.style.background = color;
            colorBtn.onclick = (ev) => {
                ev.stopPropagation();
                chip.style.background = color;
                ALL_COLOR_CLASSES.forEach(cls => chip.classList.remove(cls));
                const container = chip.closest('.container');
                if (container) saveExamState(container);
                palette.remove();
            };
            palette.appendChild(colorBtn);
        });

        const swatch = chip.querySelector('.chip-color-swatch');
        showPopup(palette, swatch || chip);
    }

    function saveLegendConfig(legendBar) {
        const config = [];
        legendBar.querySelectorAll('.legend-tag').forEach(tag => {
            const textEl = tag.querySelector('.legend-tag-text');
            config.push({
                id: tag.dataset.colorId,
                color: tag.dataset.color || '#888888',
                name: textEl?.textContent || ''
            });
        });
        localStorage.setItem('examLegendConfig', JSON.stringify(config));
    }

    function updateChipColorsFromLegend(colorId, newColor) {
        const container = document.querySelector('#examModeOverlay .container');
        if (!container) return;
        container.querySelectorAll(`.chip.${colorId}`).forEach(chip => {
            chip.style.background = newColor;
        });
        saveExamState(container);
    }

    window.setActiveColor = (colorClass) => {
        window.activeExamColor = colorClass;
        window.activeExamCustomColor = null;
        document.querySelectorAll('.legend-tag').forEach(t => t.classList.remove('selected'));
        const tag = document.querySelector(`.legend-tag[data-color-id="${colorClass}"]`);
        if (tag) {
            tag.classList.add('selected');
            const tagText = tag.querySelector('.legend-tag-text');
            if (tagText) window.activeExamCustomColor = tagText.style.background;
        }
    };

    window.setExamView = (months) => {
        visibleMonthCount = months;
        const btns = document.querySelectorAll('.exam-btn');
        btns.forEach(b => b.classList.remove('active'));
        if (event && event.target) event.target.classList.add('active');
        const container = document.querySelector('#examModeOverlay .container');
        if (container) renderMonths(container);
    };

    // ===========================
    // EXAM DAY / BANNERS / COUNTDOWNS
    // ===========================

    function toggleTaskCompletion(e, chip) {
        e.stopPropagation();
        chip.classList.toggle('completed');
        saveExamState(chip.closest('.container'));
    }

    function deleteTask(e, chip) {
        e.stopPropagation();
        const container = chip.closest('.container');
        if (!e.shiftKey && !confirm('מחק משימה זו?')) return;
        chip.remove();
        saveExamState(container);
        if (window.showSubtleToast) window.showSubtleToast('הפריט הוסר מלוח הבחינות');
    }

    function toggleDayPassed(td, container) {
        td.classList.toggle('day-passed');
        saveExamState(container);
    }

    function toggleExamDay(td, container) {
        const isExamDay = td.classList.toggle('exam-day');
        if (isExamDay) {
            if (!td.querySelector('.exam-banner')) {
                const bannerWrapper = document.createElement('div');
                bannerWrapper.className = 'exam-banner-wrapper';
                const banner = document.createElement('div');
                banner.className = 'exam-banner';
                banner.contentEditable = 'true';
                banner.spellcheck = false;
                banner.dataset.placeholder = 'שם מבחן...';
                banner.addEventListener('blur', () => saveExamState(container));

                const colorBtn = document.createElement('span');
                colorBtn.className = 'exam-banner-color-btn';
                colorBtn.innerHTML = '<span class="icon" style="font-size:14px">palette</span>';
                colorBtn.title = 'שנה צבע';
                colorBtn.onclick = (e) => { e.stopPropagation(); showExamBannerColorPicker(colorBtn, banner, container); };

                const countdownBtn = document.createElement('span');
                countdownBtn.className = 'exam-countdown-toggle';
                countdownBtn.innerHTML = '<span class="icon" style="font-size:14px">timer</span>';
                countdownBtn.title = 'הפעל ספירה לאחור';
                countdownBtn.onclick = (e) => {
                    e.stopPropagation();
                    td.classList.toggle('countdown-enabled');
                    countdownBtn.classList.toggle('active');
                    saveExamState(container);
                    updateExamCountdowns(container);
                };

                const tileColorBtn = document.createElement('span');
                tileColorBtn.className = 'exam-tile-color-btn';
                tileColorBtn.innerHTML = '<span class="icon" style="font-size:14px">palette</span>';
                tileColorBtn.title = 'שנה צבע תא';
                tileColorBtn.onclick = (e) => { e.stopPropagation(); showExamTileColorPicker(tileColorBtn, td, container); };

                bannerWrapper.appendChild(banner);
                bannerWrapper.appendChild(colorBtn);
                bannerWrapper.appendChild(countdownBtn);
                bannerWrapper.appendChild(tileColorBtn);

                const dateSpan = td.querySelector('.date');
                if (dateSpan && dateSpan.nextSibling) td.insertBefore(bannerWrapper, dateSpan.nextSibling);
                else td.appendChild(bannerWrapper);
                banner.focus();
            }
        } else {
            const bannerWrapper = td.querySelector('.exam-banner-wrapper');
            if (bannerWrapper) bannerWrapper.remove();
            const banner = td.querySelector('.exam-banner');
            if (banner) banner.remove();
            td.classList.remove('countdown-enabled');
        }
        saveExamState(container);
        updateExamCountdowns(container);
    }

    function showExamBannerColorPicker(btn, banner, container) {
        document.querySelectorAll('.exam-color-palette').forEach(p => p.remove());
        const palette = document.createElement('div');
        palette.className = 'chip-color-palette exam-color-palette';
        PRESET_COLORS.forEach(color => {
            const colorBtn = document.createElement('div');
            colorBtn.className = 'palette-color';
            colorBtn.style.background = color;
            colorBtn.onclick = (e) => {
                e.stopPropagation();
                banner.style.setProperty('background', color, 'important');
                banner.style.removeProperty('border');
                banner.style.setProperty('color', 'white', 'important');
                saveExamState(container);
                palette.remove();
            };
            palette.appendChild(colorBtn);
        });
        showPopup(palette, btn);
    }

    function showExamTileColorPicker(btn, td, container) {
        document.querySelectorAll('.exam-tile-palette').forEach(p => p.remove());
        const palette = document.createElement('div');
        palette.className = 'chip-color-palette exam-tile-palette';
        PRESET_COLORS.forEach(color => {
            const colorBtn = document.createElement('div');
            colorBtn.className = 'palette-color';
            colorBtn.style.background = color;
            colorBtn.onclick = (e) => {
                e.stopPropagation();
                td.style.setProperty('background', hexToRgba(color, 0.1), 'important');
                td.style.setProperty('border', `1px solid ${color}`, 'important');
                saveExamState(container);
                palette.remove();
            };
            palette.appendChild(colorBtn);
        });
        showPopup(palette, btn);
    }

    function updateExamCountdowns(container) {
        if (!container) return;
        container.querySelectorAll('.countdown-badge').forEach(b => b.remove());

        const examsWithCountdown = [];
        container.querySelectorAll('td.exam-day.countdown-enabled').forEach(examTd => {
            const dateSpan = examTd.querySelector('.date');
            if (!dateSpan) return;
            const examDate = parseDateFromSpan(dateSpan);
            if (examDate) examsWithCountdown.push({ td: examTd, date: examDate });
        });

        if (examsWithCountdown.length === 0) return;
        examsWithCountdown.sort((a, b) => a.date - b.date);

        container.querySelectorAll('td').forEach(td => {
            if (td.closest('.week-goal-row')) return;
            const dateSpan = td.querySelector('.date');
            if (!dateSpan) return;
            const cellDate = parseDateFromSpan(dateSpan);
            if (!cellDate) return;

            let minDays = Infinity;
            for (const exam of examsWithCountdown) {
                if (exam.date > cellDate) {
                    const diffDays = Math.ceil((exam.date - cellDate) / (1000 * 60 * 60 * 24));
                    if (diffDays < minDays) minDays = diffDays;
                }
            }

            if (minDays > 0 && minDays < Infinity) {
                const badge = document.createElement('div');
                badge.className = 'countdown-badge';
                badge.textContent = minDays === 1 ? 'מחר יום' : `${minDays} ימים`;
                td.appendChild(badge);
            }
        });
    }

    function parseDateFromSpan(dateSpan) {
        const text = dateSpan.textContent.trim();
        // Format: "day/month" e.g. "15/3"
        const match = text.match(/^(\d+)\/(\d+)/);
        if (match) {
            const day = parseInt(match[1], 10);
            const month = parseInt(match[2], 10) - 1;
            // Determine year from table dataset
            const table = dateSpan.closest('table');
            if (table && table.dataset.month) {
                const [y] = table.dataset.month.split('-');
                return new Date(parseInt(y, 10), month, day);
            }
            return new Date(new Date().getFullYear(), month, day);
        }

        // Fallback: try parsing from h2 (for old format)
        const table = dateSpan.closest('table');
        if (!table) return null;
        const h2 = table.previousElementSibling;
        if (!h2 || h2.tagName !== 'H2') return null;
        return parseHebrewDate(h2.textContent.trim(), parseInt(text, 10));
    }

    function parseHebrewDate(monthYearText, day) {
        const hebrewMonths = {
            'ינואר': 0, 'פברואר': 1, 'מרץ': 2, 'אפריל': 3,
            'מאי': 4, 'יוני': 5, 'יולי': 6, 'אוגוסט': 7,
            'ספטמבר': 8, 'אוקטובר': 9, 'נובמבר': 10, 'דצמבר': 11
        };
        let month = -1;
        let year = new Date().getFullYear();
        for (const [name, idx] of Object.entries(hebrewMonths)) {
            if (monthYearText.includes(name)) { month = idx; break; }
        }
        const yearMatch = monthYearText.match(/\d{4}/);
        if (yearMatch) year = parseInt(yearMatch[0], 10);
        if (month === -1) return null;
        return new Date(year, month, day);
    }

    // ===========================
    // SAVE / SYNC
    // ===========================

    function saveExamState(container) {
        if (!container) return;
        updateWeekProgress(container);

        // Save title
        const h1 = container.querySelector('h1');
        if (h1) localStorage.setItem('examTitle', h1.textContent);

        // Save h2 titles
        container.querySelectorAll('h2').forEach(h2 => {
            if (h2.dataset.month) {
                localStorage.setItem(`examMonthTitle_${h2.dataset.month}`, h2.textContent);
            }
        });

        // Save each month table separately
        container.querySelectorAll('table').forEach(table => {
            const monthKey = table.dataset.month;
            if (monthKey) saveMonthData(container, monthKey, table);
        });

        // Also save combined HTML for Firebase sync (backwards compat)
        const clone = container.cloneNode(true);
        clone.removeAttribute('contenteditable');
        clone.querySelectorAll('.chip').forEach(c => {
            c.removeAttribute('contenteditable');
            c.removeAttribute('spellcheck');
            c.classList.remove('editing');
        });
        clone.querySelectorAll('.chip-label').forEach(l => {
            l.removeAttribute('contenteditable');
            l.removeAttribute('spellcheck');
        });
        clone.querySelectorAll('.exam-editable').forEach(node => {
            node.removeAttribute('contenteditable');
            node.removeAttribute('spellcheck');
        });
        clone.querySelectorAll('.exam-banner').forEach(b => {
            b.removeAttribute('contenteditable');
            b.removeAttribute('spellcheck');
        });
        clone.querySelectorAll('.add-tile-btn, .chip-check, .chip-delete, .chip-drag-handle, .chip-color-swatch, .day-passed-toggle, .day-passed-x, .exam-day-toggle, .exam-banner-color-btn, .exam-tile-color-btn, .exam-countdown-toggle, .countdown-badge, .exam-month-nav').forEach(el => el.remove());
        const htmlContent = clone.innerHTML;
        localStorage.setItem('examModeContent', htmlContent);

        if (container.dataset.firebaseSync === 'true' && container.currentExamRef && container.firebaseSet) {
            container.firebaseSet(container.currentExamRef, htmlContent).catch(err => {
                console.error('[ExamMode] Failed to sync to cloud:', err);
            });
        }
    }

    // ===========================
    // SETUP
    // ===========================

    function setupExamInteractionsInternal(container) {
        if (!container) return;
        enableExamTextEditing(container);
        ensureWeeklyGoals(container);
        refreshExamCells(container);
        updateWeekProgress(container);
        setupDragAndDrop(container);
        updateExamCountdowns(container);

        if (container.dataset.examHandlers !== 'true') {
            container.dataset.examHandlers = 'true';
            container.addEventListener('click', (e) => handleChipClick(container, e));
            container.addEventListener('dblclick', handleChipDoubleClick);
        }
    }

    window.setupExamInteractions = setupExamInteractionsInternal;

    window.activeExamColor = 'topic-1';
    window.activeExamCustomColor = null;

    // ===========================
    // INIT
    // ===========================

    window.initExamMode = async () => {
        overlay = document.getElementById('examModeOverlay');
        if (!overlay) return;

        if (!examModeInitialized) {
            examModeInitialized = true;

            const container = overlay.querySelector('.container');

            // Run migration if needed
            migrateOldData();

            // Inject Controls
            if (!overlay.querySelector('.exam-controls')) {
                const legendConfig = getLegendConfig();
                const controls = buildControls(legendConfig);
                if (container) overlay.insertBefore(controls, container);
                setupLegendInteractions(controls);
            }

            if (container) {
                // Load title
                const savedTitle = localStorage.getItem('examTitle');
                const h1 = container.querySelector('h1');
                if (h1 && savedTitle) h1.textContent = savedTitle;

                container.setAttribute('spellcheck', 'false');

                // Generate dynamic months
                renderMonths(container);

                overlay.addEventListener('input', () => saveExamState(container));

                container.addEventListener('mouseenter', () => {
                    enableExamTextEditing(container);
                    ensureWeeklyGoals(container);
                    refreshExamCells(container);
                    updateWeekProgress(container);
                });

                container.addEventListener('mousedown', (e) => {
                    if (e.target.classList.contains('chip-delete') ||
                        e.target.classList.contains('chip-check') ||
                        e.target.classList.contains('chip-drag-handle')) {
                        e.preventDefault();
                    }
                });

                // Track editing for sync conflict prevention
                let isUserEditing = false;
                container.addEventListener('focusin', (e) => {
                    if (e.target.isContentEditable || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                        isUserEditing = true;
                    }
                });
                container.addEventListener('focusout', () => { isUserEditing = false; });

                // Firebase Sync
                try {
                    const { db, ref, set, onValue } = await import('./firebase-config.js');
                    const { initAuth } = await import('./auth.js');
                    const currentUser = initAuth();

                    if (currentUser) {
                        const examRef = ref(db, `users/${currentUser}/examMode`);
                        let isInitialSync = true;

                        const header = overlay.querySelector('h1');
                        let syncBadge = header.querySelector('.sync-status');
                        if (!syncBadge) {
                            syncBadge = document.createElement('span');
                            syncBadge.className = 'sync-status';
                            syncBadge.style.fontSize = '0.5em';
                            syncBadge.style.verticalAlign = 'middle';
                            syncBadge.style.marginLeft = '10px';
                            header.appendChild(syncBadge);
                        }
                        syncBadge.textContent = '⏳';

                        const saved = localStorage.getItem('examModeContent');

                        onValue(examRef, (snapshot) => {
                            syncBadge.textContent = '🟢';
                            syncBadge.title = 'Sync Active';
                            const remoteContent = snapshot.val();

                            if (remoteContent === null && saved && isInitialSync) {
                                set(examRef, saved).then(() => console.log('[ExamMode] Migration complete.'));
                            } else if (remoteContent && remoteContent !== container.innerHTML && !isUserEditing) {
                                // For now, cloud sync re-renders the whole view
                                // In future could be per-month sync
                                console.log('[ExamMode] Syncing from cloud...');
                                // Don't replace dynamic content - just note the sync
                                // The per-month storage is authoritative locally
                            }
                            isInitialSync = false;
                        });

                        container.dataset.firebaseSync = 'true';
                        container.currentExamRef = examRef;
                        container.firebaseSet = set;
                    }
                } catch (err) {
                    console.error('[ExamMode] Failed to initialize Firebase sync:', err);
                    const header = overlay.querySelector('h1');
                    if (header) {
                        const syncBadge = document.createElement('span');
                        syncBadge.textContent = '🔴';
                        syncBadge.title = 'Sync Failed';
                        header.appendChild(syncBadge);
                    }
                }
            }
        }
    };

    // ===========================
    // CROSS-INTEGRATION: Add chip to exam cell by date
    // ===========================
    window.addChipToExamCell = (dateObj, title, color) => {
        const overlay = document.getElementById('examModeOverlay');
        if (!overlay) return false;
        const container = overlay.querySelector('.container');
        if (!container) return false;

        const targetDay = dateObj.getDate();
        const targetMonth = dateObj.getMonth();
        const targetYear = dateObj.getFullYear();
        const monthKey = `${targetYear}-${targetMonth}`;

        // Find the right table
        const tables = container.querySelectorAll('table');
        let targetCell = null;
        for (const table of tables) {
            if (table.dataset.month !== monthKey) continue;
            const cells = table.querySelectorAll('td:not(.empty-cell)');
            for (const cell of cells) {
                const dateSpan = cell.querySelector('.date');
                if (!dateSpan) continue;
                const dayNum = parseInt(dateSpan.textContent);
                if (dayNum === targetDay) {
                    targetCell = cell;
                    break;
                }
            }
            if (targetCell) break;
        }

        if (!targetCell) return false;

        // Create chip
        const chip = document.createElement('div');
        chip.className = 'chip';
        if (color) chip.style.background = color;
        const label = document.createElement('span');
        label.className = 'chip-label';
        label.textContent = title || '';
        chip.appendChild(label);
        addChipControls(chip);

        // Insert before add button or at end
        const addBtn = targetCell.querySelector('.add-tile-btn');
        if (addBtn) {
            targetCell.insertBefore(chip, addBtn);
        } else {
            targetCell.appendChild(chip);
        }

        saveExamState(container);
        return true;
    };

    // ===========================
    // CROSS-INTEGRATION: Chip context menu (right-click)
    // ===========================
    function getChipDateFromCell(chip) {
        const td = chip.closest('td');
        if (!td) return null;
        const dateSpan = td.querySelector('.date');
        if (!dateSpan) return null;
        return parseDateFromSpan(dateSpan);
    }

    function showExamChipContextMenu(e, chip) {
        e.preventDefault();
        e.stopPropagation();

        // Need createContextMenu from context-menus module (exposed on ctx or try window)
        const createMenu = (window.ctx && window.ctx.createContextMenu) || null;
        // Fallback: check if ctx is available via import (it won't be in IIFE, so use a simpler approach)
        if (!createMenu) {
            // Try to find it on the global scope
            const menuFn = document.querySelector('.dynamic-context-menu') ? null : null;
            // If no context menu system available, skip
            return;
        }

        const chipLabel = chip.querySelector('.chip-label');
        const title = chipLabel ? chipLabel.textContent.trim() : '';
        const chipDate = getChipDateFromCell(chip);
        const color = chip.style.background || '';

        const items = [];

        // Create task from chip
        if (window.ctx && window.ctx.createTask) {
            items.push({
                icon: '<span class="icon" style="font-size:16px;vertical-align:middle">check_circle</span>',
                label: 'צור משימה',
                action: () => {
                    const taskData = {
                        title: title || 'משימה מלוח בחינות',
                        priority: 'medium',
                        subject: '',
                        completed: false
                    };
                    if (chipDate) {
                        taskData.dueDate = chipDate.toISOString();
                    }
                    window.ctx.createTask(taskData);
                    if (window.showSubtleToast) window.showSubtleToast('משימה נוצרה ✓');
                }
            });
        }

        // Add to daily planner
        if (window.DailyPlanner && window.DailyPlanner.addPlannerBlock) {
            items.push({
                icon: '<span class="icon" style="font-size:16px;vertical-align:middle">event_note</span>',
                label: 'הוסף למתכנן היומי',
                action: () => {
                    const dateKey = chipDate ? `${chipDate.getFullYear()}-${String(chipDate.getMonth() + 1).padStart(2, '0')}-${String(chipDate.getDate()).padStart(2, '0')}` : null;
                    window.DailyPlanner.addPlannerBlock({
                        title: title || 'פעילות מלוח בחינות',
                        date: dateKey,
                        duration: 60,
                        color: color,
                        priority: 'medium'
                    });
                    if (window.showSubtleToast) window.showSubtleToast('נוסף למתכנן ✓');
                }
            });
        }

        if (items.length === 0) return;

        items.unshift({
            header: `<span style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block">${title || 'פריט'}</span>`
        });

        createMenu(e.clientX, e.clientY, items, 'exam-chip-context-menu');
    }

    // Attach context menu to chips — hook into setupExamInteractions
    const origSetup = setupExamInteractionsInternal;
    setupExamInteractionsInternal = function(container) {
        origSetup(container);
        // Add right-click handlers to all chips
        container.querySelectorAll('.chip').forEach(chip => {
            if (chip.dataset.contextMenuBound) return;
            chip.dataset.contextMenuBound = '1';
            chip.addEventListener('contextmenu', (e) => showExamChipContextMenu(e, chip));
        });
    };
    window.setupExamInteractions = setupExamInteractionsInternal;

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.initExamMode());
    } else {
        window.initExamMode();
    }

})();
