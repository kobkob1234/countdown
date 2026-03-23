
import { AppState } from '../state.js';
import { isEditableTarget } from '../utils.js';
import { forceAllSyncReady } from '../sync.js';

export function initMobileController() {
    // ===== Mobile Detection =====
    const isMobile = () => window.innerWidth <= 768 ||
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches && window.innerWidth <= 1024);

    // Don't initialize on desktop
    if (!isMobile()) {
        // Re-check on resize
        window.addEventListener('resize', () => {
            if (isMobile()) initMobileEnhancements();
        }, { once: true });
        return;
    }

    initMobileEnhancements();

    function initMobileEnhancements() {
        // Add mobile class
        document.body.classList.add('is-mobile');

        // 1. Enhanced Haptics
        window.haptic = {
            light: () => {
                if (navigator.vibrate) navigator.vibrate(10);
            },
            medium: () => {
                if (navigator.vibrate) navigator.vibrate(20);
            },
            heavy: () => {
                if (navigator.vibrate) navigator.vibrate([30, 10, 30]); // Double bump
            },
            success: () => {
                if (navigator.vibrate) navigator.vibrate([10, 30, 10, 30]);
            },
            error: () => {
                if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
            }
        };

        // 2. Touch Ripple Effect
        document.addEventListener('click', (e) => {
            const target = e.target.closest('button, .clickable, .nav-item, .task-item, .event-card');
            if (!target) return;

            const rect = target.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const circle = document.createElement('span');
            circle.classList.add('touch-ripple');
            circle.style.left = `${x}px`;
            circle.style.top = `${y}px`;
            target.appendChild(circle);

            setTimeout(() => circle.remove(), 600);
        });

        // 3. Mobile Toasts
        const toastContainer = document.createElement('div');
        toastContainer.className = 'mobile-toast-container';
        document.body.appendChild(toastContainer);

        window.mobileToast = (msg, options = {}) => {
            const { icon = '<span class="icon" style="font-size:16px;vertical-align:middle">info</span>', duration = 3000 } = options;
            const toast = document.createElement('div');
            toast.className = 'mobile-toast';
            toast.innerHTML = `
        <span class="mobile-toast-icon">${icon}</span>
        <span class="mobile-toast-text">${msg}</span>
      `;

            toastContainer.appendChild(toast);
            window.haptic.light();

            // Animate in
            requestAnimationFrame(() => toast.classList.add('visible'));

            // Remove
            setTimeout(() => {
                toast.classList.remove('visible');
                toast.addEventListener('transitionend', () => toast.remove());
            }, duration);
        };

        // 4. Swipe Gestures (Optimized)
        let touchStartX = 0;
        let touchStartY = 0;
        let activeItem = null;
        let initialTransform = 0;
        const SWIPE_THRESHOLD = 60; // Reduced from 80
        const VELOCITY_THRESHOLD = 0.3; // px/ms

        document.addEventListener('touchstart', (e) => {
            const item = e.target.closest('.task-item');
            if (!item) return;
            if (isEditableTarget(e.target)) return;

            activeItem = item;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            initialTransform = 0;
            activeItem.classList.add('swiping');
            activeItem.style.transition = 'none'; // Instant follow
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (!activeItem) return;

            const diffX = e.touches[0].clientX - touchStartX;
            const diffY = e.touches[0].clientY - touchStartY;

            // Lock scroll if swiping horizontally
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
                if (e.cancelable) e.preventDefault();
            } else {
                return; // Vertical scroll, ignore
            }

            // Limit range
            const cappedDiff = Math.max(-100, Math.min(100, diffX));

            // Apply transform directly to task item
            activeItem.style.transform = `translateX(${cappedDiff}px)`;

            // Visual feedback for activation threshold
            if (Math.abs(cappedDiff) > SWIPE_THRESHOLD) {
                if (navigator.vibrate && !activeItem.hasVibrated) {
                    window.haptic.light();
                    activeItem.hasVibrated = true;
                }
                // Add visual indicator
                activeItem.classList.add('swipe-threshold-reached');
            } else {
                activeItem.hasVibrated = false;
                activeItem.classList.remove('swipe-threshold-reached');
            }
        }, { passive: false });

        document.addEventListener('touchend', (e) => {
            if (!activeItem) return;

            const touchEndX = e.changedTouches[0].clientX;
            const diffX = touchEndX - touchStartX;

            activeItem.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
            activeItem.classList.remove('swiping', 'swipe-threshold-reached');

            // Trigger if crossed threshold
            if (Math.abs(diffX) > SWIPE_THRESHOLD) {
                if (diffX > 0) {
                    // Right Swipe (Complete)
                    const id = activeItem.dataset.id;
                    if (id && typeof window.handleCompleteTask === 'function') {
                        window.mobileToast('הושלם!', { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">check_circle</span>' });
                        window.handleCompleteTask(id);
                    }
                } else {
                    // Left Swipe (Delete)
                    if (confirm('למחוק את המשימה?')) {
                        const id = activeItem.dataset.id;
                        if (id && typeof window.deleteTask === 'function') {
                            window.mobileToast('נמחק', { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">delete</span>' });
                            window.deleteTask(id);
                        }
                    }
                }
            }

            // Reset position
            activeItem.style.transform = '';
            activeItem = null;
        });

        // 5. Pull to Refresh
        let pullStartY = 0;
        let isPulling = false;
        const body = document.body;
        const pullIcon = document.querySelector('.pull-to-refresh');

        window.addEventListener('touchstart', (e) => {
            if (window.scrollY === 0 && e.touches[0].clientY < 200) {
                pullStartY = e.touches[0].clientY;
                isPulling = true;
            }
        }, { passive: true });

        window.addEventListener('touchmove', (e) => {
            if (!isPulling) return;
            const y = e.touches[0].clientY;
            const diff = y - pullStartY;

            if (diff > 0 && window.scrollY === 0) {
                // Prevent default pull-to-refresh behavior of the browser if possible?
                // Probably can't with passive: true, but let's see logic.

                if (diff > 50) { // Activation threshold (lowered for responsiveness)
                    body.classList.add('pull-active');
                    if (pullIcon) {
                        pullIcon.classList.add('pulling');
                        pullIcon.style.transform = ''; // Allow CSS class to take over
                    }
                } else {
                    if (pullIcon) {
                        pullIcon.classList.remove('pulling');
                        pullIcon.style.transform = `translateX(-50%) translateY(${diff - 100}px)`;
                    }
                }
            }
        }, { passive: true });

        window.addEventListener('touchend', async () => {
            if (!isPulling) return;
            isPulling = false;

            if (pullIcon) pullIcon.style.transform = ''; // Clear inline styles on release

            if (body.classList.contains('pull-active')) {
                body.classList.remove('pull-active');
                if (pullIcon) {
                    pullIcon.classList.remove('pulling');
                    pullIcon.classList.add('refreshing');
                }

                // Trigger Sync
                window.haptic.medium();
                if (forceAllSyncReady) {
                    await forceAllSyncReady('manual-pull');
                }

                // Simulate delay
                setTimeout(() => {
                    if (pullIcon) pullIcon.classList.remove('refreshing');
                    window.mobileToast('סונכרן בהצלחה', { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">sync</span>' });
                }, 1500);
            }
        });

        // 6. Edge Swipe for Navigation
        document.addEventListener('touchstart', (e) => {
            if (e.touches[0].clientX < 20) {
                // Left edge
            }
        });

        // 7. Context Menu Long Press → MD3 Action Sheet
        let pressTimer;
        let pressStartX = 0;
        let pressStartY = 0;

        document.addEventListener('touchstart', (e) => {
            const target = e.target.closest('.task-item, .event-card');
            if (!target) return;

            pressStartX = e.touches[0].clientX;
            pressStartY = e.touches[0].clientY;

            pressTimer = setTimeout(() => {
                window.haptic.medium();
                e.preventDefault();

                if (target.classList.contains('task-item')) {
                    const taskId = target.dataset.id;
                    if (taskId) showMobileTaskActionSheet(taskId);
                } else if (target.classList.contains('event-card')) {
                    const eventId = target.dataset.id;
                    if (eventId) showMobileEventActionSheet(eventId);
                }
            }, 500);
        }, { passive: false });

        document.addEventListener('touchend', () => clearTimeout(pressTimer));
        document.addEventListener('touchmove', (e) => {
            // Cancel if finger moved more than 10px (user is scrolling)
            if (e.touches.length && (
                Math.abs(e.touches[0].clientX - pressStartX) > 10 ||
                Math.abs(e.touches[0].clientY - pressStartY) > 10
            )) {
                clearTimeout(pressTimer);
            }
        });

        // --- Generic Action Sheet open/close ---
        const actionSheet = document.getElementById('mobileActionSheet');
        const actionSheetBackdrop = document.getElementById('mobileActionSheetBackdrop');
        const actionSheetTitle = document.getElementById('mobileActionSheetTitle');
        const actionSheetList = document.getElementById('mobileActionSheetList');

        function openActionSheet(title, items) {
            if (!actionSheet || !actionSheetBackdrop) return;
            actionSheetTitle.textContent = title;
            actionSheetList.innerHTML = '';

            items.forEach(item => {
                if (item.divider) {
                    const div = document.createElement('li');
                    div.className = 'mobile-action-sheet-divider';
                    div.setAttribute('role', 'separator');
                    actionSheetList.appendChild(div);
                    return;
                }
                const li = document.createElement('li');
                const btn = document.createElement('button');
                btn.className = 'mobile-action-sheet-item' + (item.destructive ? ' destructive' : '');
                btn.innerHTML = `<span class="icon">${item.icon}</span><span>${item.label}</span>`;
                btn.addEventListener('click', () => {
                    closeActionSheet();
                    // Small delay so the sheet animates out before the action runs
                    setTimeout(() => item.action(), 200);
                });
                li.appendChild(btn);
                actionSheetList.appendChild(li);
            });

            actionSheetBackdrop.classList.add('open');
            actionSheet.classList.add('open');
            document.body.style.overflow = 'hidden';
        }

        function closeActionSheet() {
            if (!actionSheet || !actionSheetBackdrop) return;
            actionSheetBackdrop.classList.remove('open');
            actionSheet.classList.remove('open');
            document.body.style.overflow = '';
        }

        actionSheetBackdrop?.addEventListener('click', closeActionSheet);

        // Drag-to-dismiss on action sheet handle
        let sheetDragStartY = 0;
        let sheetDragging = false;
        actionSheet?.querySelector('.mobile-sheet-handle')?.addEventListener('touchstart', (e) => {
            sheetDragStartY = e.touches[0].clientY;
            sheetDragging = true;
            actionSheet.style.transition = 'none';
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (!sheetDragging || !actionSheet) return;
            const dy = e.touches[0].clientY - sheetDragStartY;
            if (dy > 0) {
                actionSheet.style.transform = `translateY(${dy}px)`;
            }
        }, { passive: true });

        document.addEventListener('touchend', () => {
            if (!sheetDragging || !actionSheet) return;
            sheetDragging = false;
            actionSheet.style.transition = '';
            const currentY = parseFloat(actionSheet.style.transform.replace(/[^0-9.-]/g, '')) || 0;
            if (currentY > 100) {
                closeActionSheet();
            } else {
                actionSheet.style.transform = '';
            }
        });

        // Expose for other modules
        window.openMobileActionSheet = openActionSheet;
        window.closeMobileActionSheet = closeActionSheet;

        // --- Task Action Sheet ---
        function showMobileTaskActionSheet(taskId) {
            const ctx = window.ctx;
            if (!ctx) return;
            const task = ctx.tasks?.find(t => t.id === taskId);
            if (!task) return;

            const items = [
                {
                    icon: task.completed ? 'check_box_outline_blank' : 'check_circle',
                    label: task.completed ? 'סמן כלא הושלם' : 'סמן כהושלם',
                    action: () => {
                        const t = ctx.tasks.find(t => t.id === taskId);
                        if (!t) return;
                        const next = !t.completed;
                        if (next && ctx.maybeCreateRecurringTask) ctx.maybeCreateRecurringTask(t);
                        const { id, isOwn, isShared, ...clean } = t;
                        ctx.saveTask(taskId, { ...clean, completed: next }, t.subject);
                        if (next) window.haptic?.success();
                    }
                },
                {
                    icon: 'edit',
                    label: 'עריכה',
                    action: () => { if (ctx.openTaskEditModal) ctx.openTaskEditModal(taskId); }
                },
                {
                    icon: 'content_copy',
                    label: 'שכפול',
                    action: () => {
                        const t = ctx.tasks.find(t => t.id === taskId);
                        if (t && ctx.pushTaskClone) ctx.pushTaskClone(t);
                    }
                },
                { divider: true },
                {
                    icon: 'event',
                    label: 'היום',
                    action: () => setMobileTaskDueDate(taskId, 0)
                },
                {
                    icon: 'date_range',
                    label: 'מחר',
                    action: () => setMobileTaskDueDate(taskId, 1)
                },
                {
                    icon: 'date_range',
                    label: 'בעוד שבוע',
                    action: () => setMobileTaskDueDate(taskId, 7)
                },
                { divider: true },
                {
                    icon: 'delete',
                    label: 'מחיקה',
                    destructive: true,
                    action: () => {
                        const t = ctx.tasks.find(t => t.id === taskId);
                        if (t && ctx.removeTask) ctx.removeTask(t);
                    }
                }
            ];

            openActionSheet(task.title || 'משימה', items);
        }

        function setMobileTaskDueDate(taskId, daysFromNow) {
            const ctx = window.ctx;
            const task = ctx?.tasks?.find(t => t.id === taskId);
            if (!task) return;
            const { id, isOwn, isShared, ...clean } = task;
            const date = new Date();
            date.setDate(date.getDate() + daysFromNow);
            date.setHours(23, 59, 59, 0);
            ctx.saveTask(taskId, { ...clean, dueDate: date.toISOString() }, task.subject);
        }

        // --- Event Action Sheet ---
        function showMobileEventActionSheet(eventId) {
            const ctx = window.ctx;
            if (!ctx) return;
            const events = ctx.events || [];
            const ev = events.find(e => e.id === eventId);
            if (!ev) return;

            const items = [
                {
                    icon: 'edit',
                    label: 'עריכה',
                    action: () => {
                        if (ctx.openMobileEventSheet) ctx.openMobileEventSheet(ev);
                        else if (ctx.startEdit) ctx.startEdit(eventId);
                    }
                },
                {
                    icon: 'share',
                    label: 'שיתוף',
                    action: () => {
                        if (navigator.share) {
                            navigator.share({ title: ev.name, text: `${ev.name} — ${new Date(ev.date).toLocaleDateString('he-IL')}` }).catch(() => {});
                        } else {
                            const text = `${ev.name} — ${new Date(ev.date).toLocaleDateString('he-IL')}`;
                            navigator.clipboard?.writeText(text);
                            window.mobileToast?.('הועתק ללוח', { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">content_copy</span>' });
                        }
                    }
                },
                { divider: true },
                {
                    icon: 'delete',
                    label: 'מחיקה',
                    destructive: true,
                    action: () => {
                        if (ctx.removeEvent) ctx.removeEvent(ev);
                        else if (ctx.deleteEvent) ctx.deleteEvent(eventId);
                    }
                }
            ];

            openActionSheet(ev.name || 'אירוע', items);
        }

        // --- Quick-Add Task Sheet ---
        const quickAddSheet = document.getElementById('mobileQuickAddSheet');
        const quickAddBackdrop = document.getElementById('mobileQuickAddBackdrop');
        const quickAddClose = document.getElementById('mobileQuickAddClose');
        const quickAddCancel = document.getElementById('mobileQuickAddCancel');
        const quickAddSubmit = document.getElementById('mobileQuickAddSubmit');
        const quickAddTitle = document.getElementById('mobileQuickTaskTitle');
        const quickAddDue = document.getElementById('mobileQuickTaskDue');

        function openQuickAddSheet() {
            if (!quickAddSheet || !quickAddBackdrop) return;
            if (quickAddTitle) quickAddTitle.value = '';
            if (quickAddDue) quickAddDue.value = '';
            quickAddBackdrop.classList.add('open');
            quickAddSheet.classList.add('open');
            document.body.style.overflow = 'hidden';
            setTimeout(() => quickAddTitle?.focus(), 350);
        }

        function closeQuickAddSheet() {
            if (!quickAddSheet || !quickAddBackdrop) return;
            quickAddBackdrop.classList.remove('open');
            quickAddSheet.classList.remove('open');
            document.body.style.overflow = '';
        }

        quickAddClose?.addEventListener('click', closeQuickAddSheet);
        quickAddCancel?.addEventListener('click', closeQuickAddSheet);
        quickAddBackdrop?.addEventListener('click', closeQuickAddSheet);

        quickAddSubmit?.addEventListener('click', () => {
            const title = quickAddTitle?.value?.trim();
            if (!title) {
                window.haptic?.error();
                quickAddTitle?.focus();
                return;
            }
            const ctx = window.ctx;
            if (!ctx) return;

            const taskData = { title, completed: false };
            if (quickAddDue?.value) {
                const d = new Date(quickAddDue.value);
                d.setHours(23, 59, 59, 0);
                taskData.dueDate = d.toISOString();
            }

            // Use existing task creation — mirror the desktop addTask flow
            if (ctx.addTask) {
                ctx.addTask(taskData);
            } else if (ctx.saveTask) {
                const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
                ctx.saveTask(id, { ...taskData, createdAt: new Date().toISOString() }, '');
            }

            window.haptic?.success();
            closeQuickAddSheet();
            window.mobileToast?.('משימה נוספה', { icon: '<span class="icon" style="font-size:16px;vertical-align:middle">check_circle</span>' });
        });

        // Submit on Enter key
        quickAddTitle?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                quickAddSubmit?.click();
            }
        });

        window.openMobileQuickAddSheet = openQuickAddSheet;
        window.closeMobileQuickAddSheet = closeQuickAddSheet;
    }
}

// Make it globally available for the legacy bridge
window.initMobileController = initMobileController;
