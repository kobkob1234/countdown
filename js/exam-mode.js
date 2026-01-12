/**
 * Exam Mode Logic
 * Handles the "Sayeret" Exam Period Calendar functionality
 */

(function () {
    let examModeInitialized = false;
    let overlay = null;

    // Initialize the Exam Mode
    window.initExamMode = () => {
        overlay = document.getElementById('examModeOverlay');
        if (!overlay) return;

        if (!examModeInitialized) {
            examModeInitialized = true;

            let container = overlay.querySelector('.container');

            // Inject Controls if not present
            if (!overlay.querySelector('.exam-controls')) {
                const controls = document.createElement('div');
                controls.className = 'exam-controls';
                controls.innerHTML = `
                    <button class="exam-btn active" onclick="setExamView(3)">3 חודשים</button>
                    <button class="exam-btn" onclick="setExamView(2)">חודשיים</button>
                    <button class="exam-btn" onclick="setExamView(1)">חודש הנוכחי</button>
                    <div style="width: 1px; background: #e2e8f0; margin: 0 10px;"></div>
                    <div class="color-picker-btn" style="background: #0ea5e9;" onclick="setActiveColor('stat-new', this)" title="חומר חדש"></div>
                    <div class="color-picker-btn" style="background: #f97316;" onclick="setActiveColor('stat-review', this)" title="חזרה"></div>
                    <div class="color-picker-btn" style="background: #0284c7;" onclick="setActiveColor('stat-test', this)" title="מבחן"></div>
                    <div class="color-picker-btn" style="background: #eab308;" onclick="setActiveColor('econ', this)" title="כלכלה"></div>
                    <div class="color-picker-btn" style="background: #a855f7;" onclick="setActiveColor('game', this)" title="משחקים"></div>
                    <div class="color-picker-btn" style="background: #22c55e;" onclick="setActiveColor('vacation', this)" title="חופש"></div>
                `;
                // Insert before container
                if (container) {
                    overlay.insertBefore(controls, container);
                }
            }

            if (container) {
                const saved = localStorage.getItem('examModeContent');
                if (saved) container.innerHTML = saved;

                // Container should NOT be editable, only chips
                // container.setAttribute('contenteditable', 'true'); 
                container.setAttribute('spellcheck', 'false');

                // Enhance cells with functionality
                setupExamInteractions(container);

                overlay.addEventListener('input', () => {
                    saveExamState(container);
                });
            }
        }
    };

    // Global Interaction Helper
    window.activeExamColor = 'stat-new';

    window.setActiveColor = (colorClass, btn) => {
        window.activeExamColor = colorClass;
        document.querySelectorAll('.color-picker-btn').forEach(b => b.style.boxShadow = '0 0 0 1px #cbd5e1');
        btn.style.boxShadow = '0 0 0 3px #94a3b8';
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
        // Add "+" buttons and Checkmarks
        const enhanceElements = () => {
            // 1. Add "+" buttons to cells
            container.querySelectorAll('td').forEach(td => {
                // Remove dead buttons (lost listeners)
                const existingBtn = td.querySelector('.add-tile-btn');
                if (existingBtn) existingBtn.remove();

                // Create fresh button
                const btn = document.createElement('div');
                btn.className = 'add-tile-btn';
                btn.innerHTML = '+';
                btn.contentEditable = false;
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const chip = document.createElement('div');
                    chip.className = `chip ${window.activeExamColor}`;
                    chip.textContent = ''; // Start empty

                    // Add UI buttons to new chip
                    addChipControls(chip);

                    // Insert before the + button
                    td.insertBefore(chip, btn);

                    // Focus immediately
                    focusChip(chip);

                    saveExamState(container);
                };
                td.appendChild(btn);
            });

            // 2. Add/Refresh validation/delete buttons to existing chips
            container.querySelectorAll('.chip').forEach(chip => {
                chip.contentEditable = false; // Default to View mode
                chip.draggable = true; // Default to Draggable
                chip.spellcheck = false;

                // Remove dead controls include handle
                chip.querySelectorAll('.chip-check, .chip-delete, .chip-drag-handle').forEach(el => el.remove());

                // Add fresh controls
                addChipControls(chip);
            });

            // 3. Add Drag and Drop Handlers
            setupDragAndDrop(container);
        };

        const makeChipEditable = (chip) => {
            chip.contentEditable = true;
            chip.draggable = false; // Disable dragging while editing
            chip.spellcheck = false;
            chip.classList.add('editing');
            chip.focus();

            // Add blur listener to save and exit edit mode
            const onBlur = () => {
                chip.contentEditable = false;
                chip.draggable = true;
                chip.classList.remove('editing');
                chip.removeEventListener('blur', onBlur);
                saveExamState(chip.closest('.container'));
            };
            chip.addEventListener('blur', onBlur);
        };

        const focusChip = (chip) => {
            makeChipEditable(chip);
        };

        // Delete
        const del = document.createElement('div');
        del.className = 'chip-delete';
        del.textContent = '×';
        del.contentEditable = false;
        del.onclick = (ev) => deleteTask(ev, chip);
        chip.appendChild(del);

        // Make chip draggable by default
        chip.setAttribute('draggable', 'true');
    };

    const setupDragAndDrop = (container) => {
        let draggedItem = null;

        // Delegated listeners
        container.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('chip')) {
                // If editing, don't drag
                if (e.target.isContentEditable) {
                    e.preventDefault();
                    return;
                }
                draggedItem = e.target;
                e.target.style.opacity = '0.5';
                e.dataTransfer.effectAllowed = 'move';
            }
        });

        container.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('chip')) {
                e.target.style.opacity = '1';
                draggedItem = null;

                // Cleanup any drop indicators
                container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            }
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault(); // allow drop
            const targetTd = e.target.closest('td');

            // Clear previous drag-overs
            container.querySelectorAll('.drag-over').forEach(el => {
                if (el !== targetTd) el.classList.remove('drag-over');
            });

            if (targetTd) {
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
            if (targetTd) {
                // Remove dragged item from old place
                // Actually, appendChild/insertBefore moves it, so we don't need explicit remove.

                const targetChip = e.target.closest('.chip');

                if (targetChip && targetChip !== draggedItem) {
                    // Drop onto another chip
                    const bounding = targetChip.getBoundingClientRect();
                    const offset = bounding.y + (bounding.height / 2);
                    if (e.clientY - offset > 0) {
                        targetChip.after(draggedItem);
                    } else {
                        targetChip.before(draggedItem);
                    }
                } else {
                    // Dropped on the cell background or + button
                    const btn = targetTd.querySelector('.add-tile-btn');
                    if (btn) {
                        targetTd.insertBefore(draggedItem, btn);
                    } else {
                        targetTd.appendChild(draggedItem);
                    }
                }

                // Reset opacity
                draggedItem.style.opacity = '1';
                draggedItem = null;
                container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));

                saveExamState(container);
            }
        });
    };

    // Initial run
    enhanceElements();

    // Re-run on hover to heal any persistence issues or structural changes
    // Use a flag or debounce if this is too aggressive, but for now it's fine.
    container.addEventListener('mouseenter', enhanceElements);

    // Also re-run on 'mousemove' over the container to catch moments where DOM might have been wiped
    // But `mouseenter` on container is usually enough unless innerHTML was fully reset.

    // Ensure we don't start editing when clicking controls
    container.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('chip-delete') ||
            e.target.classList.contains('chip-check') ||
            e.target.classList.contains('chip-drag-handle')) {
            e.preventDefault(); // Prevent focus stealing/contenteditable activation
        }
    });

    // Chip Click to Cycle Colors (only if not clicking controls)
    container.addEventListener('click', (e) => {
        if (e.target.classList.contains('chip')) {
            const currentClasses = e.target.className.split(' ');
            const baseClass = currentClasses[0]; // 'chip'
            // Preserve completed state if exists
            const isCompleted = e.target.classList.contains('completed') ? ' completed' : '';

            e.target.className = `${baseClass} ${window.activeExamColor}${isCompleted}`;

            // We need to re-add controls because className change might wipe them if innerHTML was touched? 
            // No, className change is safe. But let's be safe.

            saveExamState(container);
        }
    });
};

function toggleTaskCompletion(e, chip) {
    e.stopPropagation(); // prevent color change
    chip.classList.toggle('completed');
    saveExamState(chip.closest('.container'));
}

function deleteTask(e, chip) {
    e.stopPropagation();
    if (confirm('מחק משימה זו?')) {
        const container = chip.closest('.container');
        chip.remove();
        saveExamState(container);
    }
}

function saveExamState(container) {
    // Clone to strip UI elements before saving to keep storage clean
    const clone = container.cloneNode(true);
    // Clean attributes
    clone.removeAttribute('contenteditable');

    clone.querySelectorAll('.chip').forEach(c => {
        c.removeAttribute('contenteditable');
        c.removeAttribute('spellcheck');
    });

    clone.querySelectorAll('.add-tile-btn, .chip-check, .chip-delete, .chip-drag-handle').forEach(el => el.remove());
    localStorage.setItem('examModeContent', clone.innerHTML);
}

}) ();
