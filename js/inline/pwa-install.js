// PWA Install Prompt Handler
export function initPwaInstall() {
  let deferredPrompt = null;
  const banner = document.getElementById('pwaInstallBanner');
  const installBtn = document.getElementById('pwaInstallBtn');
  const closeBtn = document.getElementById('pwaInstallClose');

  const canShowInstallBanner = () => window.matchMedia(
    '(max-width: 768px), (display-mode: standalone) and (max-width: 1024px)'
  ).matches;

  // Check if already installed or dismissed
  const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  const wasDismissed = () => {
    const dismissed = localStorage.getItem('pwaInstallDismissed');
    if (!dismissed) return false;
    // Re-show after 7 days
    const dismissedDate = new Date(Number.parseInt(dismissed));
    const now = new Date();
    const daysDiff = (now - dismissedDate) / (1000 * 60 * 60 * 24);
    return daysDiff < 7;
  };

  const showBanner = () => {
    if (!canShowInstallBanner()) return;
    if (banner && deferredPrompt && !isInstalled() && !wasDismissed()) {
      banner.classList.add('visible');
      console.log('[PWA] Install banner shown');
    }
  };

  const hideBanner = () => {
    banner?.classList.remove('visible');
  };

  // Capture the install prompt event
  window.addEventListener('beforeinstallprompt', (e) => {
    if (!canShowInstallBanner()) {
      return;
    }
    e.preventDefault();
    deferredPrompt = e;
    console.log('[PWA] beforeinstallprompt captured');

    // Show banner after a short delay
    setTimeout(showBanner, 2000);
  });

  // Handle install button click
  installBtn?.addEventListener('click', async () => {
    if (!deferredPrompt) return;

    hideBanner();

    // Show the install prompt
    deferredPrompt.prompt();

    const { outcome } = await deferredPrompt.userChoice;
    console.log('[PWA] Install outcome:', outcome);

    if (outcome === 'accepted') {
      if (window.mobileToast) {
        window.mobileToast('האפליקציה הותקנה!', { icon: '✅' });
      }
    }

    deferredPrompt = null;
  });

  // Handle close button
  closeBtn?.addEventListener('click', () => {
    hideBanner();
    localStorage.setItem('pwaInstallDismissed', Date.now().toString());
    console.log('[PWA] Install banner dismissed');
  });

  // Listen for successful install
  window.addEventListener('appinstalled', () => {
    hideBanner();
    deferredPrompt = null;
    console.log('[PWA] App installed successfully');
    if (window.mobileToast) {
      window.mobileToast('האפליקציה הותקנה בהצלחה!', { icon: '🎉' });
    }
  });
}
