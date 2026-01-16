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

        const selectAll = () => {
            const range = document.createRange();
            range.selectNodeContents(label);
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
            }
        };
        selectAll();

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

        chip.appendChild(check);
        chip.appendChild(del);
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
                const chip = document.createElement('div');
                chip.className = `chip ${window.activeExamColor}`;
                // Apply custom color if set from legend
                if (window.activeExamCustomColor) {
                    chip.style.background = window.activeExamCustomColor;
                }
                const label = document.createElement('span');
                label.className = 'chip-label';
                label.dataset.placeholder = 'הוסף אירוע';
                chip.appendChild(label);

                addChipControls(chip);

                td.insertBefore(chip, btn);
                startChipEdit(chip);
                saveExamState(container);
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
            }
        });

        container.querySelectorAll('.chip').forEach(chip => {
            if (chip.closest('.week-goal-row')) return;
            chip.contentEditable = false;
            chip.draggable = true;
            chip.spellcheck = false;

            chip.querySelectorAll('.chip-check, .chip-delete, .chip-drag-handle').forEach(el => el.remove());
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
    window.initExamMode = () => {
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
                const saved = localStorage.getItem('examModeContent');
                if (saved) container.innerHTML = saved;

                container.setAttribute('spellcheck', 'false');

                // Enhance cells with functionality
                setupExamInteractions(container);

                overlay.addEventListener('input', () => {
                    saveExamState(container);
                });

                // Re-run on hover to heal any persistence issues or structural changes
                container.addEventListener('mouseenter', () => {
                    enableExamTextEditing(container);
                    ensureWeeklyGoals(container);
                    refreshExamCells(container);
                    updateWeekProgress(container);
                });

                // Ensure we don't start editing when clicking controls
                container.addEventListener('mousedown', (e) => {
                    if (e.target.classList.contains('chip-delete') ||
                        e.target.classList.contains('chip-check') ||
                        e.target.classList.contains('chip-drag-handle')) {
                        e.preventDefault();
                    }
                });
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

        // Position the palette
        swatch.style.position = 'relative';
        swatch.appendChild(palette);

        // Close palette on outside click
        const closeHandler = (e) => {
            if (!palette.contains(e.target) && e.target !== swatch) {
                palette.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 10);
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
                const banner = document.createElement('div');
                banner.className = 'exam-banner';
                banner.contentEditable = 'true';
                banner.spellcheck = false;
                banner.dataset.placeholder = 'שם מבחן...';
                banner.addEventListener('blur', () => saveExamState(container));
                // Insert after date span
                const dateSpan = td.querySelector('.date');
                if (dateSpan && dateSpan.nextSibling) {
                    td.insertBefore(banner, dateSpan.nextSibling);
                } else {
                    td.appendChild(banner);
                }
                banner.focus();
            }
        } else {
            // Remove exam banner when unchecking
            const banner = td.querySelector('.exam-banner');
            if (banner) banner.remove();
        }

        saveExamState(container);
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

        clone.querySelectorAll('.add-tile-btn, .chip-check, .chip-delete, .chip-drag-handle, .day-passed-toggle, .day-passed-x, .exam-day-toggle').forEach(el => el.remove());
        localStorage.setItem('examModeContent', clone.innerHTML);
    }

})();
