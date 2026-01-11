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

                container.setAttribute('contenteditable', 'true');
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
                    chip.textContent = 'משימה חדשה';

                    // Add UI buttons to new chip
                    addChipControls(chip);

                    td.insertBefore(chip, btn);
                    saveExamState(container);
                };
                td.appendChild(btn);
            });

            // 2. Add/Refresh validation/delete buttons to existing chips
            container.querySelectorAll('.chip').forEach(chip => {
                // Remove dead controls
                chip.querySelectorAll('.chip-check, .chip-delete').forEach(el => el.remove());

                // Add fresh controls
                addChipControls(chip);
            });
        };

        const addChipControls = (chip) => {
            // Checkmark
            const check = document.createElement('div');
            check.className = 'chip-check';
            check.contentEditable = false;
            check.onclick = (ev) => toggleTaskCompletion(ev, chip);
            chip.appendChild(check);

            // Delete
            const del = document.createElement('div');
            del.className = 'chip-delete';
            del.textContent = '×';
            del.contentEditable = false;
            del.onclick = (ev) => deleteTask(ev, chip);
            chip.appendChild(del);
        };

        // Initial run
        enhanceElements();

        // Re-run on hover to heal any persistence issues or structural changes
        container.addEventListener('mouseenter', enhanceElements);

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
        clone.querySelectorAll('.add-tile-btn, .chip-check, .chip-delete').forEach(el => el.remove());
        localStorage.setItem('examModeContent', clone.innerHTML);
    }

})();
