"use client";

import * as React from "react";

const COLOR_VARS = [
  "--primary",
  "--accent",
  "--type-compound",
  "--stage-seedling",
  "--stage-sprout",
  "--stage-evergreen",
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  life: number;
}

/**
 * A dependency-free confetti burst. Increment `trigger` to fire. Colors are
 * pulled from the current theme tokens; respects prefers-reduced-motion.
 */
export function ConfettiBurst({ trigger }: { trigger: number }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const rafRef = React.useRef<number>(0);

  React.useEffect(() => {
    if (trigger === 0) return;
    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const w = (canvas.width = window.innerWidth);
    const h = (canvas.height = window.innerHeight);

    const styles = getComputedStyle(document.documentElement);
    const colors = COLOR_VARS.map(
      (v) => styles.getPropertyValue(v).trim() || "#F0522E",
    );

    const cx = w / 2;
    const cy = h * 0.3;
    const particles: Particle[] = [];
    for (let i = 0; i < 90; i++) {
      const angle = Math.PI * 2 * (i / 90);
      const speed = 4 + ((i * 37) % 60) / 10;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed * (0.5 + ((i * 13) % 10) / 10),
        vy: Math.sin(angle) * speed - 3,
        size: 4 + ((i * 7) % 6),
        color: colors[i % colors.length],
        rot: i,
        vr: (i % 2 ? 1 : -1) * 0.2,
        life: 0,
      });
    }

    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      let alive = false;
      for (const p of particles) {
        p.life += 1;
        p.vy += 0.16;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        const opacity = Math.max(0, 1 - p.life / 90);
        if (opacity <= 0) continue;
        alive = true;
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      if (alive) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
    };
    tick();

    return () => cancelAnimationFrame(rafRef.current);
  }, [trigger]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50"
    />
  );
}
