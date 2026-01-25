/**
 * Exam Mode Logic
 * Handles the "Sayeret" Exam Period Calendar functionality
 */

(function () {
    const EXAM_COLOR_CLASSES = [
        'stat-new',
        'stat-review',
        'stat-test',
        'econ',
        'game',
        'vacation',
        'rest',
        'focus',
        'deadline',
        'project',
        'admin'
    ];

    let examModeInitialized = false;
    let overlay = null;
    let colorClickTimer = null;

    const clearColorClickTimer = () => {
        if (colorClickTimer) {
            clearTimeout(colorClickTimer);
            colorClickTimer = null;
        }
    };

    const setChipColor = (chip, colorClass) => {
        if (!chip || !colorClass) return;
        EXAM_COLOR_CLASSES.forEach(cls => chip.classList.remove(cls));
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

        // For empty labels, select all. For existing text, put cursor at end
        if (!prevText || prevText.trim() === '') {
            const range = document.createRange();
            range.selectNodeContents(label);
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
            }
        } else {
            // Put cursor at end
            const range = document.createRange();
            range.selectNodeContents(label);
            range.collapse(false); // false = collapse to end
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
            }
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
        const editableNodes = container.querySelectorAll('h1, h2, .legend span');
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

            // Add day passed toggle checkbox if not present
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

            // Add red X overlay if not present
            if (!td.querySelector('.day-passed-x')) {
                const xOverlay = document.createElement('div');
                xOverlay.className = 'day-passed-x';
                td.appendChild(xOverlay);
            }

            // Add exam day toggle button if not present
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

            // Add exam banner if it has exam-day class but no banner
            if (td.classList.contains('exam-day') && !td.querySelector('.exam-banner')) {
                const banner = document.createElement('div');
                banner.className = 'exam-banner';
                banner.contentEditable = 'true';
                banner.spellcheck = false;
                banner.dataset.placeholder = 'שם מבחן...';
                banner.addEventListener('blur', () => saveExamState(container));
                td.appendChild(banner);
            }

            // Ensure exam banner is interactive
            const existingBanner = td.querySelector('.exam-banner');
            if (existingBanner) {
                existingBanner.contentEditable = 'true';
                existingBanner.spellcheck = false;
                if (!existingBanner.dataset.placeholder) {
                    existingBanner.dataset.placeholder = 'שם מבחן...';
                }

                // Ensure banner wrapper exists for controls
                let bannerWrapper = existingBanner.closest('.exam-banner-wrapper');
                if (!bannerWrapper) {
                    bannerWrapper = document.createElement('div');
                    bannerWrapper.className = 'exam-banner-wrapper';
                    existingBanner.parentNode.insertBefore(bannerWrapper, existingBanner);
                    bannerWrapper.appendChild(existingBanner);
                }

                // Add countdown toggle if not present
                if (!bannerWrapper.querySelector('.exam-countdown-toggle')) {
                    const countdownBtn = document.createElement('span');
                    countdownBtn.className = 'exam-countdown-toggle';
                    if (td.classList.contains('countdown-enabled')) {
                        countdownBtn.classList.add('active');
                    }
                    countdownBtn.textContent = '⏰';
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

                // Add color button if not present
                if (!bannerWrapper.querySelector('.exam-banner-color-btn')) {
                    const colorBtn = document.createElement('span');
                    colorBtn.className = 'exam-banner-color-btn';
                    colorBtn.textContent = '🎨';
                    colorBtn.title = 'שנה צבע';
                    colorBtn.onclick = (e) => {
                        e.stopPropagation();
                        showExamBannerColorPicker(colorBtn, existingBanner, container);
                    };
                    bannerWrapper.appendChild(colorBtn);
                }

                // Add tile color button if not present
                if (!bannerWrapper.querySelector('.exam-tile-color-btn')) {
                    const tileColorBtn = document.createElement('span');
                    tileColorBtn.className = 'exam-tile-color-btn';
                    tileColorBtn.textContent = '🖼️';
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
            if (e.target.closest('.chip-check, .chip-delete')) {
                e.preventDefault();
                return;
            }
            if (chip.classList.contains('editing')) {
                e.preventDefault();
                return;
            }
            draggedItem = chip;
            chip.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', '');
        });

        container.addEventListener('dragend', () => {
            if (draggedItem) {
                draggedItem.classList.remove('dragging');
                draggedItem = null;
            }
            container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        });

        container.addEventListener('dragover', (e) => {
            if (!draggedItem) return;
            e.preventDefault();
            const targetTd = e.target.closest('td');

            container.querySelectorAll('.drag-over').forEach(el => {
                if (el !== targetTd) el.classList.remove('drag-over');
            });

            if (targetTd && !targetTd.closest('.week-goal-row')) {
                targetTd.classList.add('drag-over');
                e.dataTransfer.dropEffect = 'move';
            }
        });

        container.addEventListener('dragleave', (e) => {
            const targetTd = e.target.closest('td');
            if (targetTd && !targetTd.contains(e.relatedTarget)) {
                targetTd.classList.remove('drag-over');
            }
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
                if (e.clientY - offset > 0) {
                    targetChip.after(draggedItem);
                } else {
                    targetChip.before(draggedItem);
                }
            } else {
                const btn = targetTd.querySelector('.add-tile-btn');
                if (btn) {
                    targetTd.insertBefore(draggedItem, btn);
                } else {
                    targetTd.appendChild(draggedItem);
                }
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

    // Initialize the Exam Mode
    function formatExamDates(container) {
        if (container.dataset.datesFormatted) return;

        const months = [1, 2, 3]; // Jan, Feb, Mar (approximate, based on table order)
        const tables = container.querySelectorAll('table');

        tables.forEach((table, index) => {
            if (index >= months.length) return;
            const monthNum = months[index];
            table.querySelectorAll('.date').forEach(dateSpan => {
                const dayText = dateSpan.textContent.trim();
                // Avoid double formatting
                if (!dayText.includes('/')) {
                    dateSpan.textContent = `${dayText}/${monthNum}`;
                }
            });
        });

        container.dataset.datesFormatted = 'true';
    }

    // Initialize the Exam Mode
    window.initExamMode = async () => {
        overlay = document.getElementById('examModeOverlay');
        if (!overlay) return;

        if (!examModeInitialized) {
            examModeInitialized = true;

            const container = overlay.querySelector('.container');

            // Inject Controls if not present
            if (!overlay.querySelector('.exam-controls')) {
                // Preset color palette (8 colors)
                const PRESET_COLORS = [
                    '#0ea5e9', // Sky blue
                    '#f97316', // Orange
                    '#22c55e', // Green
                    '#ef4444', // Red
                    '#a855f7', // Purple
                    '#eab308', // Yellow
                    '#64748b', // Slate
                    '#f472b6'  // Pink
                ];

                // Load saved legend colors and names
                const savedLegend = JSON.parse(localStorage.getItem('examLegendConfig') || 'null');
                const defaultLegend = [
                    { id: 'stat-new', color: '#0ea5e9', name: 'סטטיסטיקה חדש' },
                    { id: 'stat-review', color: '#f97316', name: 'חזרה' },
                    { id: 'stat-test', color: '#22c55e', name: 'מבחן' },
                    { id: 'econ', color: '#eab308', name: 'כלכלה' },
                    { id: 'game', color: '#a855f7', name: 'משחקים' },
                    { id: 'vacation', color: '#ef4444', name: 'דדליין' },
                    { id: 'rest', color: '#64748b', name: 'מנוחה' },
                    { id: 'focus', color: '#f472b6', name: 'פרויקט' }
                ];
                const legendConfig = savedLegend || defaultLegend;

                const controls = document.createElement('div');
                controls.className = 'exam-controls';

                // Build legend HTML
                let legendHTML = `
                    <button class="exam-btn active" onclick="setExamView(3)">3 חודשים</button>
                    <button class="exam-btn" onclick="setExamView(2)">חודשיים</button>
                    <button class="exam-btn" onclick="setExamView(1)">חודש הנוכחי</button>
                    <div class="exam-divider" aria-hidden="true"></div>
                    <div class="exam-legend-bar">
                `;

                legendConfig.forEach(item => {
                    legendHTML += `
                        <div class="legend-tag" data-color-id="${item.id}" data-color="${item.color}">
                            <div class="legend-color-swatch" style="background:${item.color};" title="שנה צבע"></div>
                            <span class="legend-tag-text" style="background:${item.color};" contenteditable="true" spellcheck="false">${item.name}</span>
                        </div>
                    `;
                });

                legendHTML += `
                    </div>
                    <div class="exam-hint">לחיצה על תג לבחירה • לחיצה כפולה לעריכה • ניתן לשנות צבע וטקסט</div>
                `;

                controls.innerHTML = legendHTML;

                // Insert before container
                if (container) {
                    overlay.insertBefore(controls, container);
                }

                // Setup legend interactions
                setupLegendInteractions(controls);
            }

            if (container) {
                // Initial Load from Local Storage (Instant UX)
                const saved = localStorage.getItem('examModeContent');
                if (saved) {
                    container.innerHTML = saved;
                    container.querySelectorAll('.exam').forEach(el => el.remove());
                }

                container.setAttribute('spellcheck', 'false');

                // Enhance cells with functionality
                setupExamInteractions(container);
                formatExamDates(container);

                overlay.addEventListener('input', () => {
                    saveExamState(container);
                });

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

                // ==========================================
                // FIREBASE SYNC INTEGRATION (Dynamic Import)
                // ==========================================
                try {
                    const { db, ref, set, onValue } = await import('./firebase-config.js');
                    const { initAuth } = await import('./auth.js');
                    // Initialize module-scope auth (reads from shared localStorage)
                    const currentUser = initAuth();

                    if (currentUser) {
                        const examRef = ref(db, `users/${currentUser}/examMode`);
                        let isInitialSync = true;

                        // Listen for Real-time Updates
                        onValue(examRef, (snapshot) => {
                            const remoteContent = snapshot.val();

                            // MIGRATION Logic: If Cloud is empty AND Local has data -> Upload Local
                            if (remoteContent === null && saved && isInitialSync) {
                                console.log('[ExamMode] Migrating local data to cloud...');
                                set(examRef, saved).then(() => {
                                    console.log('[ExamMode] Migration complete.');
                                });
                            }
                            // NORMAL SYNC: Cloud has data -> Update Local
                            else if (remoteContent && remoteContent !== container.innerHTML) {
                                console.log('[ExamMode] Syncing from cloud...');
                                container.innerHTML = remoteContent;
                                // Re-apply interactions after innerHTML replacement
                                setupExamInteractions(container);
                                formatExamDates(container);
                            }
                            isInitialSync = false;
                        });

                        // Hook saving to Firebase
                        // We wrap the original save function to also write to Firebase
                        container.dataset.firebaseSync = 'true';
                        container.currentExamRef = examRef;
                        container.firebaseSet = set;
                    }
                } catch (err) {
                    console.error('[ExamMode] Failed to initialize Firebase sync:', err);
                }
            }
        }
    };

    // Global Interaction Helper
    window.activeExamColor = 'stat-new';
    window.activeExamCustomColor = null; // For custom colors from legend

    function setupLegendInteractions(controls) {
        const legendBar = controls.querySelector('.exam-legend-bar');
        if (!legendBar) return;

        // Select first tag by default
        const firstTag = legendBar.querySelector('.legend-tag');
        if (firstTag) {
            firstTag.classList.add('selected');
            window.activeExamColor = firstTag.dataset.colorId;
            const tagText = firstTag.querySelector('.legend-tag-text');
            if (tagText) {
                window.activeExamCustomColor = tagText.style.background;
            }
        }

        legendBar.addEventListener('click', (e) => {
            const tag = e.target.closest('.legend-tag');
            if (!tag) return;

            // Handle color swatch click - show palette
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
            if (tagText) {
                window.activeExamCustomColor = tagText.style.background;
            }
        });

        // Text change
        legendBar.addEventListener('blur', (e) => {
            if (e.target.classList.contains('legend-tag-text')) {
                saveLegendConfig(legendBar);
            }
        }, true);
    }

    // Preset colors for the palette
    const PRESET_COLORS = [
        '#0ea5e9', // Sky blue
        '#f97316', // Orange
        '#22c55e', // Green
        '#ef4444', // Red
        '#a855f7', // Purple
        '#eab308', // Yellow
        '#64748b', // Slate
        '#f472b6'  // Pink
    ];

    const hexToRgba = (hex, alpha) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    function showPopup(popup, targetEl, onRemove) {
        // Append to body to ensure it's on top of everything
        document.body.appendChild(popup);

        const rect = targetEl.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

        const width = popup.offsetWidth;
        const height = popup.offsetHeight;

        let top = rect.bottom + scrollTop + 6;
        let left = rect.left + scrollLeft + (rect.width / 2) - (width / 2);

        // Screen edges
        const viewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;
        if (left < 10) left = 10;
        if (left + width > viewportWidth - 10) {
            left = viewportWidth - width - 10;
        }

        popup.style.position = 'absolute';
        popup.style.top = `${top}px`;
        popup.style.left = `${left}px`;
        popup.style.zIndex = '10001';
        popup.style.margin = '0';
        popup.style.transform = 'none';

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
        // Remove any existing palette
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

        if (tag.classList.contains('selected')) {
            window.activeExamCustomColor = color;
        }

        saveLegendConfig(legendBar);
        updateChipColorsFromLegend(tag.dataset.colorId, color);
    }

    function showChipColorPicker(btn, td, container) {
        // Remove any existing palette
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
        // Remove any existing palette
        document.querySelectorAll('.chip-color-palette').forEach(p => p.remove());

        const palette = document.createElement('div');
        palette.className = 'chip-color-palette chip-inline-palette';

        // Add remove button first
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
                // Remove any class-based colors
                PRESET_COLORS.forEach(() => {
                    chip.className = chip.className.split(' ').filter(c =>
                        !['stat-new', 'stat-review', 'stat-test', 'econ', 'game', 'vacation', 'rest', 'focus', 'deadline', 'project', 'admin'].includes(c)
                    ).join(' ');
                });
                const container = chip.closest('.container');
                if (container) saveExamState(container);
                palette.remove();
            };
            palette.appendChild(colorBtn);
        });

        const swatch = chip.querySelector('.chip-color-swatch');
        const target = swatch || chip;

        showPopup(palette, target);
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
        // Update existing chips with this color class to use the new custom color
        const container = document.querySelector('#examModeOverlay .container');
        if (!container) return;
        container.querySelectorAll(`.chip.${colorId}`).forEach(chip => {
            chip.style.background = newColor;
        });
        saveExamState(container);
    }

    window.setActiveColor = (colorClass, btn) => {
        window.activeExamColor = colorClass;
        window.activeExamCustomColor = null;
        document.querySelectorAll('.legend-tag').forEach(t => t.classList.remove('selected'));
        const tag = document.querySelector(`.legend-tag[data-color-id="${colorClass}"]`);
        if (tag) {
            tag.classList.add('selected');
            const tagText = tag.querySelector('.legend-tag-text');
            if (tagText) {
                window.activeExamCustomColor = tagText.style.background;
            }
        }
    };

    window.setExamView = (months) => {
        const tables = document.querySelectorAll('#examModeOverlay table');
        const titles = document.querySelectorAll('#examModeOverlay h2');
        const btns = document.querySelectorAll('.exam-btn');

        btns.forEach(b => b.classList.remove('active'));
        if (event && event.target) event.target.classList.add('active');

        // Reset display
        tables.forEach(t => t.style.display = 'none');
        titles.forEach(t => t.style.display = 'none');

        // Show based on selection
        for (let i = 0; i < months; i++) {
            if (tables[i]) tables[i].style.display = '';
            if (titles[i]) titles[i].style.display = '';
        }
    };

    window.setupExamInteractions = (container) => {
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
    };

    function toggleTaskCompletion(e, chip) {
        e.stopPropagation(); // prevent color change
        chip.classList.toggle('completed');
        saveExamState(chip.closest('.container'));
    }

    function deleteTask(e, chip) {
        e.stopPropagation();
        const container = chip.closest('.container');
        if (!e.shiftKey && !confirm('מחק משימה זו?')) return;
        chip.remove();
        saveExamState(container);
    }

    function toggleDayPassed(td, container) {
        td.classList.toggle('day-passed');
        saveExamState(container);
    }

    function toggleExamDay(td, container) {
        const isExamDay = td.classList.toggle('exam-day');

        if (isExamDay) {
            // Add exam banner if not exists
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
                colorBtn.textContent = '🎨';
                colorBtn.title = 'שנה צבע';
                colorBtn.onclick = (e) => {
                    e.stopPropagation();
                    showExamBannerColorPicker(colorBtn, banner, container);
                };

                const countdownBtn = document.createElement('span');
                countdownBtn.className = 'exam-countdown-toggle';
                countdownBtn.textContent = '⏰';
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
                tileColorBtn.textContent = '🖼️';
                tileColorBtn.title = 'שנה צבע תא';
                tileColorBtn.onclick = (e) => {
                    e.stopPropagation();
                    showExamTileColorPicker(tileColorBtn, td, container);
                };

                bannerWrapper.appendChild(banner);
                bannerWrapper.appendChild(colorBtn);
                bannerWrapper.appendChild(countdownBtn);
                bannerWrapper.appendChild(tileColorBtn);

                // Insert after date span
                const dateSpan = td.querySelector('.date');
                if (dateSpan && dateSpan.nextSibling) {
                    td.insertBefore(bannerWrapper, dateSpan.nextSibling);
                } else {
                    td.appendChild(bannerWrapper);
                }
                banner.focus();
            }
        } else {
            // Remove exam banner when unchecking
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
        // Remove any existing palette
        document.querySelectorAll('.exam-color-palette').forEach(p => p.remove());

        const palette = document.createElement('div');
        palette.className = 'chip-color-palette exam-color-palette';

        PRESET_COLORS.forEach(color => {
            const colorBtn = document.createElement('div');
            colorBtn.className = 'palette-color';
            colorBtn.style.background = color;
            colorBtn.onclick = (e) => {
                e.stopPropagation();
                // Apply solid background (like the image)
                banner.style.setProperty('background', color, 'important');
                // Remove specific border (let default shadow/border handle it)
                banner.style.removeProperty('border');
                // White text for contrast on dark/vibrant colors
                banner.style.setProperty('color', 'white', 'important');
                banner.style.removeProperty('font-weight'); // Default is fine, or keep bold if needed

                saveExamState(container);
                palette.remove();
            };
            palette.appendChild(colorBtn);
        });

        showPopup(palette, btn);
    }

    function showExamTileColorPicker(btn, td, container) {
        // Remove any existing palette
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

        // Remove all existing countdown badges
        container.querySelectorAll('.countdown-badge').forEach(b => b.remove());

        // Find all exams with countdown enabled and parse their dates
        const examsWithCountdown = [];
        container.querySelectorAll('td.exam-day.countdown-enabled').forEach(examTd => {
            const dateSpan = examTd.querySelector('.date');
            if (!dateSpan) return;

            const dayNum = parseInt(dateSpan.textContent.trim(), 10);
            if (isNaN(dayNum)) return;

            // Find month/year from table header
            const table = examTd.closest('table');
            if (!table) return;

            const h2 = table.previousElementSibling;
            if (!h2 || h2.tagName !== 'H2') return;

            const monthYearText = h2.textContent.trim();
            const examDate = parseHebrewDate(monthYearText, dayNum);
            if (examDate) {
                examsWithCountdown.push({ td: examTd, date: examDate });
            }
        });

        if (examsWithCountdown.length === 0) return;

        // Sort exams by date (closest first)
        examsWithCountdown.sort((a, b) => a.date - b.date);

        // For each day tile, find the closest upcoming exam and show countdown
        container.querySelectorAll('td').forEach(td => {
            if (td.closest('.week-goal-row')) return;

            const dateSpan = td.querySelector('.date');
            if (!dateSpan) return;

            const dayNum = parseInt(dateSpan.textContent.trim(), 10);
            if (isNaN(dayNum)) return;

            const table = td.closest('table');
            if (!table) return;

            const h2 = table.previousElementSibling;
            if (!h2 || h2.tagName !== 'H2') return;

            const monthYearText = h2.textContent.trim();
            const cellDate = parseHebrewDate(monthYearText, dayNum);
            if (!cellDate) return;

            // Find closest upcoming exam for this cell
            let closestExam = null;
            let minDays = Infinity;

            for (const exam of examsWithCountdown) {
                if (exam.date > cellDate) {
                    const diffDays = Math.ceil((exam.date - cellDate) / (1000 * 60 * 60 * 24));
                    if (diffDays < minDays) {
                        minDays = diffDays;
                        closestExam = exam;
                    }
                }
            }

            // Don't show badge on the exam day itself or days after
            if (closestExam && minDays > 0) {
                const badge = document.createElement('div');
                badge.className = 'countdown-badge';
                badge.textContent = minDays === 1 ? 'מחר יום' : `${minDays} ימים`;
                td.appendChild(badge);
            }
        });
    }

    function parseHebrewDate(monthYearText, day) {
        const hebrewMonths = {
            'ינואר': 0, 'פברואר': 1, 'מרץ': 2, 'אפריל': 3,
            'מאי': 4, 'יוני': 5, 'יולי': 6, 'אוגוסט': 7,
            'ספטמבר': 8, 'אוקטובר': 9, 'נובמבר': 10, 'דצמבר': 11
        };

        const englishMonths = {
            'january': 0, 'february': 1, 'march': 2, 'april': 3,
            'may': 4, 'june': 5, 'july': 6, 'august': 7,
            'september': 8, 'october': 9, 'november': 10, 'december': 11
        };

        const text = monthYearText.toLowerCase();
        let month = -1;
        let year = new Date().getFullYear();

        for (const [name, idx] of Object.entries(hebrewMonths)) {
            if (monthYearText.includes(name)) {
                month = idx;
                break;
            }
        }

        if (month === -1) {
            for (const [name, idx] of Object.entries(englishMonths)) {
                if (text.includes(name)) {
                    month = idx;
                    break;
                }
            }
        }

        const yearMatch = monthYearText.match(/\d{4}/);
        if (yearMatch) {
            year = parseInt(yearMatch[0], 10);
        }

        if (month === -1) return null;

        return new Date(year, month, day);
    }

    function saveExamState(container) {
        if (!container) return;
        updateWeekProgress(container);
        // Clone to strip UI elements before saving to keep storage clean
        const clone = container.cloneNode(true);
        // Clean attributes
        clone.removeAttribute('contenteditable');

        clone.querySelectorAll('.chip').forEach(c => {
            c.removeAttribute('contenteditable');
            c.removeAttribute('spellcheck');
            c.classList.remove('editing');
        });

        clone.querySelectorAll('.chip-label').forEach(label => {
            label.removeAttribute('contenteditable');
            label.removeAttribute('spellcheck');
        });

        clone.querySelectorAll('.exam-editable').forEach(node => {
            node.removeAttribute('contenteditable');
            node.removeAttribute('spellcheck');
        });

        clone.querySelectorAll('.exam-banner').forEach(banner => {
            banner.removeAttribute('contenteditable');
            banner.removeAttribute('spellcheck');
        });

        clone.querySelectorAll('.add-tile-btn, .chip-check, .chip-delete, .chip-drag-handle, .chip-color-swatch, .day-passed-toggle, .day-passed-x, .exam-day-toggle, .exam-banner-color-btn, .exam-tile-color-btn, .exam-countdown-toggle, .countdown-badge').forEach(el => el.remove());
        const htmlContent = clone.innerHTML;
        localStorage.setItem('examModeContent', htmlContent);

        // Sync to Firebase if initialized
        if (container.dataset.firebaseSync === 'true' && container.currentExamRef && container.firebaseSet) {
            container.firebaseSet(container.currentExamRef, htmlContent).catch(err => {
                console.error('[ExamMode] Failed to sync to cloud:', err);
            });
        }
    }

    // Auto-initialize on load to ensure sync runs immediately
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.initExamMode());
    } else {
        window.initExamMode();
    }

})();
