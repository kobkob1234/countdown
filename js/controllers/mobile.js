
import { ctx } from '../state.js';

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
            const { icon = 'ℹ️', duration = 3000 } = options;
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

            // Update visual state (actions revealed)
            const container = activeItem.querySelector('.task-item-swipe-container');
            if (container) {
                container.style.transform = `translateX(${cappedDiff}px)`;

                // Visual feedback for activation
                if (Math.abs(cappedDiff) > SWIPE_THRESHOLD) {
                    if (navigator.vibrate && !activeItem.hasVibrated) {
                        window.haptic.light();
                        activeItem.hasVibrated = true;
                    }
                } else {
                    activeItem.hasVibrated = false;
                }
            }
        }, { passive: false });

        document.addEventListener('touchend', (e) => {
            if (!activeItem) return;

            const touchEndX = e.changedTouches[0].clientX;
            const diffX = touchEndX - touchStartX;
            const container = activeItem.querySelector('.task-item-swipe-container');
            const timeElapsed = Date.now() - (activeItem.touchStartTime || Date.now()); // Simplify
            const velocity = Math.abs(diffX) / timeElapsed;

            activeItem.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
            activeItem.classList.remove('swiping');

            // Trigger if crossed threshold OR fast swipe
            if ((Math.abs(diffX) > SWIPE_THRESHOLD) && container) {
                if (diffX > 0) {
                    // Right Swipe (Complete)
                    if (typeof handleCompleteTask === 'function') { // Check if legacy function exists
                        const id = activeItem.dataset.id;
                        if (id) {
                            window.mobileToast('הושלם!', { icon: '✅' });
                            handleCompleteTask(id);
                        }
                    }
                } else {
                    // Left Swipe (Delete)
                    if (confirm('למחוק את המשימה?')) {
                        const id = activeItem.dataset.id;
                        if (id && typeof removeTask === 'function') {
                            // Legacy global or module? We might need to inject removeTask/handleCompleteTask
                            // ensuring backward compatibility
                            // For now, assume legacy globals are available on window
                            // But since this is a module, window.removeTask needs to bridge
                            const task = AppState.tasks.find(t => t.id === id) || { id };
                            if (window.removeTask) window.removeTask(task);
                        }
                    }
                }
            }

            // Reset position
            if (container) container.style.transform = '';
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
                if (diff > 80) { // Activation threshold
                    body.classList.add('pull-active');
                    if (pullIcon) pullIcon.classList.add('pulling');
                } else {
                    if (pullIcon) pullIcon.style.transform = `translateX(-50%) translateY(${diff - 100}px)`;
                }
            }
        }, { passive: true });

        window.addEventListener('touchend', async () => {
            if (!isPulling) return;
            isPulling = false;

            if (body.classList.contains('pull-active')) {
                body.classList.remove('pull-active');
                if (pullIcon) {
                    pullIcon.classList.remove('pulling');
                    pullIcon.classList.add('refreshing');
                }

                // Trigger Sync
                window.haptic.medium();
                if (window.AppModules && window.AppModules.forceAllSyncReady) {
                    await window.AppModules.forceAllSyncReady('manual-pull');
                }

                // Simulate delay
                setTimeout(() => {
                    if (pullIcon) pullIcon.classList.remove('refreshing');
                    window.mobileToast('סונכרן בהצלחה', { icon: '🔄' });
                }, 1500);
            }
        });

        // 6. Edge Swipe for Navigation
        document.addEventListener('touchstart', (e) => {
            if (e.touches[0].clientX < 20) {
                // Left edge
            }
        });

        // 7. Context Menu Long Press
        let pressTimer;
        document.addEventListener('touchstart', (e) => {
            const target = e.target.closest('.task-item, .event-card');
            if (!target) return;

            pressTimer = setTimeout(() => {
                window.haptic.medium();
                // Open Context Menu logic here...
            }, 500);
        }, { passive: true });

        document.addEventListener('touchend', () => clearTimeout(pressTimer));
        document.addEventListener('touchmove', () => clearTimeout(pressTimer));
    }
}

// Make it globally available for the legacy bridge
window.initMobileController = initMobileController;
