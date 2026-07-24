// A tiny self-contained confetti burst on a full-screen canvas. No libraries.
// Particles fall with gravity and fade; the canvas removes itself when done.

import { prefersReducedMotion } from './motion';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vrot: number;
  color: string;
  life: number;
}

const COLORS = [
  '#38bdf8', // accent sky
  '#f472b6', // pink
  '#fbbf24', // amber
  '#34d399', // emerald
  '#a78bfa', // violet
  '#fb7185', // rose
];

/**
 * Fire a confetti burst. Returns a cleanup function that stops and removes the
 * canvas early (e.g. if the overlay is dismissed). No-op under reduced motion.
 */
export function burstConfetti(): () => void {
  if (prefersReducedMotion()) return () => {};

  const canvas = document.createElement('canvas');
  canvas.className = 'fixed inset-0 pointer-events-none z-[90]';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  };
  resize();
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return () => {};
  }
  ctx.scale(dpr, dpr);

  const W = window.innerWidth;
  const H = window.innerHeight;

  // Two bursts from the lower-left and lower-right corners, plus a top shower.
  const particles: Particle[] = [];
  const spawn = (originX: number, originY: number, angle: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 1.1;
      const speed = 8 + Math.random() * 9;
      particles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle + spread) * speed,
        vy: Math.sin(angle + spread) * speed,
        size: 5 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.3,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        life: 1,
      });
    }
  };
  spawn(0, H, -Math.PI / 3, 90);
  spawn(W, H, -Math.PI + Math.PI / 3, 90);
  for (let i = 0; i < 60; i++) {
    particles.push({
      x: Math.random() * W,
      y: -20,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 3,
      size: 5 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.3,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      life: 1,
    });
  }

  const gravity = 0.28;
  const drag = 0.99;
  let raf = 0;
  let stopped = false;

  const cleanup = () => {
    stopped = true;
    cancelAnimationFrame(raf);
    canvas.remove();
  };

  const frame = () => {
    if (stopped) return;
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of particles) {
      p.vx *= drag;
      p.vy = p.vy * drag + gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      if (p.y > H + 40) p.life = 0;
      else if (p.y > H * 0.6) p.life -= 0.012;
      if (p.life <= 0) continue;
      alive++;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    if (alive === 0) {
      cleanup();
      return;
    }
    raf = requestAnimationFrame(frame);
  };

  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(frame);

  return () => {
    window.removeEventListener('resize', resize);
    cleanup();
  };
}
