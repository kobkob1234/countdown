// Pull to Refresh Handler for PWA
export function initPullToRefresh() {
  // Only enable on mobile/PWA
  const isMobile = () => window.innerWidth <= 768 ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

  if (!isMobile()) return;

  const pullIndicator = document.getElementById('pullToRefresh');
  if (!pullIndicator) return;

  let startY = 0;
  let currentY = 0;
  let pulling = false;
  let refreshing = false;
  const THRESHOLD = 100; // px to pull before triggering refresh
  const MAX_PULL = 150; // max pull distance

  // Get the main scrollable container
  const getScrollContainer = () => {
    return document.querySelector('.main-content') || document.body;
  };

  const isAtTop = () => {
    const container = getScrollContainer();
    return container.scrollTop <= 0 || window.scrollY <= 0;
  };

  document.addEventListener('touchstart', (e) => {
    if (refreshing) return;
    if (!isAtTop()) return;
    if (!isMobile()) return;

    startY = e.touches[0].clientY;
    pulling = true;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!pulling || refreshing) return;
    if (!isAtTop()) {
      pulling = false;
      pullIndicator.style.transform = '';
      pullIndicator.classList.remove('visible');
      return;
    }

    currentY = e.touches[0].clientY;
    const diff = Math.min(currentY - startY, MAX_PULL);

    if (diff > 10) {
      // Show indicator
      pullIndicator.classList.add('visible');
      const progress = Math.min(diff / THRESHOLD, 1);
      pullIndicator.style.transform = `translateY(${diff - 60}px)`;
      pullIndicator.style.opacity = progress;

      // Rotate spinner based on progress
      const spinner = pullIndicator.querySelector('.pull-spinner');
      if (spinner) {
        spinner.style.transform = `rotate(${progress * 360}deg)`;
      }
    }
  }, { passive: true });

  document.addEventListener('touchend', async () => {
    if (!pulling) return;
    pulling = false;

    const diff = currentY - startY;

    if (diff >= THRESHOLD && !refreshing) {
      // Trigger refresh
      refreshing = true;
      pullIndicator.classList.add('refreshing');

      const spinner = pullIndicator.querySelector('.pull-spinner');
      if (spinner) {
        spinner.textContent = '⏳';
      }

      try {
        // Sync data - trigger Firebase listeners to refresh
        if (typeof window.ctx !== 'undefined') {
          // Render current data immediately
          if (window.ctx.renderTasks) window.ctx.renderTasks();
          if (window.ctx.updateEventList) window.ctx.updateEventList();
          if (window.ctx.renderPlannerBlocks) window.ctx.renderPlannerBlocks();
        }

        // Also check for service worker updates
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) await reg.update();
        }

        // Show success feedback
        if (spinner) spinner.textContent = '✅';
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.warn('[Pull-to-Refresh] Error:', err);
        if (spinner) spinner.textContent = '❌';
        await new Promise(r => setTimeout(r, 500));
      }

      // Reset
      if (spinner) spinner.textContent = '🔄';
      refreshing = false;
      pullIndicator.classList.remove('refreshing', 'visible');
      pullIndicator.style.transform = '';
      pullIndicator.style.opacity = '';
    } else {
      // Cancel - animate back
      pullIndicator.classList.remove('visible');
      pullIndicator.style.transform = '';
      pullIndicator.style.opacity = '';
    }

    startY = 0;
    currentY = 0;
  });

  console.log('[Pull-to-Refresh] Initialized');
}
