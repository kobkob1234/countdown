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
                const controls = document.createElement('div');
                controls.className = 'exam-controls';
                controls.innerHTML = `
                    <button class="exam-btn active" onclick="setExamView(3)">3 חודשים</button>
                    <button class="exam-btn" onclick="setExamView(2)">חודשיים</button>
                    <button class="exam-btn" onclick="setExamView(1)">חודש הנוכחי</button>
                    <div class="exam-divider" aria-hidden="true"></div>
                    <div class="color-picker-btn" style="background: #0ea5e9;" onclick="setActiveColor('stat-new', this)" title="חומר חדש"></div>
                    <div class="color-picker-btn" style="background: #f97316;" onclick="setActiveColor('stat-review', this)" title="חזרה"></div>
                    <div class="color-picker-btn" style="background: #0284c7;" onclick="setActiveColor('stat-test', this)" title="מבחן"></div>
                    <div class="color-picker-btn" style="background: #eab308;" onclick="setActiveColor('econ', this)" title="כלכלה"></div>
                    <div class="color-picker-btn" style="background: #a855f7;" onclick="setActiveColor('game', this)" title="משחקים"></div>
                    <div class="color-picker-btn" style="background: #22c55e;" onclick="setActiveColor('vacation', this)" title="חופש"></div>
                    <div class="color-picker-btn" style="background: #64748b;" onclick="setActiveColor('rest', this)" title="מנוחה"></div>
                    <div class="color-picker-btn" style="background: #0f766e;" onclick="setActiveColor('focus', this)" title="פוקוס"></div>
                    <div class="color-picker-btn" style="background: #ef4444;" onclick="setActiveColor('deadline', this)" title="דדליין"></div>
                    <div class="color-picker-btn" style="background: #f472b6;" onclick="setActiveColor('project', this)" title="פרויקט"></div>
                    <div class="color-picker-btn" style="background: #6366f1;" onclick="setActiveColor('admin', this)" title="סידורים"></div>
                    <div class="exam-hint">לחיצה כפולה לעריכה • לחיצה לצביעה • גרירה לסידור מחדש</div>
                `;
                // Insert before container
                if (container) {
                    overlay.insertBefore(controls, container);
                }
                const firstColorBtn = controls.querySelector('.color-picker-btn');
                if (firstColorBtn) setActiveColor(window.activeExamColor, firstColorBtn);
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

    window.setActiveColor = (colorClass, btn) => {
        window.activeExamColor = colorClass;
        document.querySelectorAll('.color-picker-btn').forEach(b => b.style.boxShadow = '0 0 0 1px #cbd5e1');
        if (btn) btn.style.boxShadow = '0 0 0 3px #94a3b8';
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

        clone.querySelectorAll('.add-tile-btn, .chip-check, .chip-delete, .chip-drag-handle').forEach(el => el.remove());
        localStorage.setItem('examModeContent', clone.innerHTML);
    }

})();
