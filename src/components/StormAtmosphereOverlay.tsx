import React, { useEffect, useRef } from 'react';

interface RainStreak {
  x: number;
  y: number;
  len: number;
  speed: number;
  alpha: number;
  width: number;
  drift: number;
}

const LOGICAL_W = 2400;
const LOGICAL_H = 1080;

export const StormAtmosphereOverlay: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const streaks: RainStreak[] = Array.from({ length: 145 }, (_, idx) => {
      const depth = (idx % 6) / 5; // 0..1 multi-depth drizzle layering
      return {
        x: Math.random() * LOGICAL_W,
        y: Math.random() * LOGICAL_H,
        len: 15 + depth * 22 + Math.random() * 12,
        speed: 860 + depth * 580 + Math.random() * 200,
        alpha: 0.1 + depth * 0.2 + Math.random() * 0.06,
        width: 0.8 + depth * 0.9,
        drift: 175 + depth * 95,
      };
    });

    const renderFrame = (dt: number, flashBoost: number) => {
      ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);
      ctx.lineCap = 'round';

      for (const s of streaks) {
        if (dt > 0) {
          s.y += s.speed * dt;
          s.x += s.drift * dt;
          if (s.y > LOGICAL_H + 40 || s.x > LOGICAL_W + 40) {
            s.y = -30 - Math.random() * 90;
            s.x = Math.random() * (LOGICAL_W + 260) - 260;
          }
        }

        const dx = (s.drift / s.speed) * s.len;
        const dy = s.len;
        const alpha = Math.min(0.56, s.alpha + flashBoost * 0.18);

        const grad = ctx.createLinearGradient(s.x - dx, s.y - dy, s.x, s.y);
        grad.addColorStop(0, 'rgba(176, 212, 232, 0)');
        grad.addColorStop(1, `rgba(210, 235, 250, ${alpha.toFixed(3)})`);

        ctx.strokeStyle = grad;
        ctx.lineWidth = s.width;
        ctx.beginPath();
        ctx.moveTo(s.x - dx, s.y - dy);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }
    };

    if (prefersReduced) {
      renderFrame(0, 0);
      return;
    }

    let rafId = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      const flashRaw = Number.parseFloat(
        document.documentElement.style.getPropertyValue('--storm-flash') || '0',
      );
      const flashBoost = Number.isFinite(flashRaw) ? flashRaw : 0;
      renderFrame(dt, flashBoost);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
    >
      {/* Distant upper-sky lightning bloom & cloud sheen synced with Three.js strikes */}
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_64%_14%,rgba(190,226,255,0.92)_0%,rgba(104,162,216,0.42)_36%,transparent_72%)] transition-opacity duration-75"
        style={{ opacity: 'calc(var(--storm-flash, 0) * 0.34)' }}
      />
      {/* Multi-depth realistic diagonal rain drizzle */}
      <canvas
        ref={canvasRef}
        width={LOGICAL_W}
        height={LOGICAL_H}
        className="w-full h-full opacity-95"
      />
    </div>
  );
};
