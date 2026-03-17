// ============ 5. CONFETTI ANIMATION ============
const CONFETTI_COLORS = ['#667eea', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];

export function createConfetti(x, y) {
  const container = document.createElement('div');
  container.className = 'confetti-container';
  container.style.left = x + 'px';
  container.style.top = y + 'px';

  for (let i = 0; i < 20; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    piece.style.left = (Math.random() * 60 - 30) + 'px';
    piece.style.animationDelay = (Math.random() * 0.3) + 's';
    piece.style.animationDuration = (0.8 + Math.random() * 0.6) + 's';
    container.appendChild(piece);
  }

  document.body.appendChild(container);
  setTimeout(() => container.remove(), 1500);
}
