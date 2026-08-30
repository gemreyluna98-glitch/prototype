// =============================================================================
// Cohin Inventory System — Lightweight Canvas Particles
// Replaces Three.js (~600KB) with a pure Canvas implementation (~5KB).
// =============================================================================

(function () {
  const canvas = document.getElementById('bg-particles');
  if (!canvas) return;
  if (window.innerWidth < 480) {
    canvas.style.display = 'none';
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = window.innerWidth;
  let height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;

  const PARTICLE_COUNT = 80;
  const particles = [];

  function getAmberColor(isDark) {
    return isDark ? 'rgba(232, 160, 76,' : 'rgba(184, 121, 30,';
  }

  function isDarkMode() {
    return document.body.classList.contains('dark-mode');
  }

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 2.5 + 0.5,
      speedX: (Math.random() - 0.5) * 0.3,
      speedY: (Math.random() - 0.5) * 0.3 - 0.15,
      opacity: Math.random() * 0.5 + 0.1,
      twinkleSpeed: Math.random() * 0.02 + 0.005,
      twinklePhase: Math.random() * Math.PI * 2,
    });
  }

  let animFrameId = null;
  let time = 0;

  function animate() {
    animFrameId = requestAnimationFrame(animate);
    ctx.clearRect(0, 0, width, height);

    const colorBase = getAmberColor(isDarkMode());
    time += 0.016;

    for (const p of particles) {
      p.x += p.speedX;
      p.y += p.speedY;

      if (p.y < -10) {
        p.y = height + 10;
        p.x = Math.random() * width;
      }
      if (p.x < -10) p.x = width + 10;
      if (p.x > width + 10) p.x = -10;

      const twinkle = Math.sin(time * p.twinkleSpeed * 60 + p.twinklePhase) * 0.2 + 0.8;
      const alpha = p.opacity * twinkle;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = colorBase + alpha + ')';
      ctx.fill();

      // Soft glow
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
      ctx.fillStyle = colorBase + alpha * 0.1 + ')';
      ctx.fill();
    }
  }

  animate();

  // Pause when tab is hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
    } else if (animFrameId === null) {
      animate();
    }
  });

  window.addEventListener('resize', () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
  });
})();
