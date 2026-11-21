"use client";

import { useEffect, useRef } from "react";

type Flake = { x: number; y: number; r: number; speed: number; sway: number; phase: number; alpha: number };

const FLAKES_PER_MEGAPIXEL = 150;
const MAX_FLAKES = 260;

function makeFlake(width: number, height: number, anywhere: boolean): Flake {
  const r = 0.6 + Math.random() ** 2 * 2.2;
  return {
    x: Math.random() * width,
    y: anywhere ? Math.random() * height : -r * 2,
    r,
    // Bigger flakes are "closer": a little faster and brighter.
    speed: 9 + r * 7 + Math.random() * 6,
    sway: 6 + Math.random() * 14,
    phase: Math.random() * Math.PI * 2,
    alpha: 0.25 + (r / 2.8) * 0.5,
  };
}

/** Full-screen 2D snowfall behind the tree. Cheap, DPR-capped, pauses when hidden. */
export function SnowCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let flakes: Flake[] = [];
    let frame = 0;
    let last = 0;
    let time = 0;

    const draw = () => {
      context.clearRect(0, 0, width, height);
      context.fillStyle = "#fffdf7";
      for (const flake of flakes) {
        context.globalAlpha = flake.alpha;
        context.beginPath();
        context.arc(flake.x + Math.sin(time * 0.6 + flake.phase) * flake.sway, flake.y, flake.r, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.min(MAX_FLAKES, Math.round(((width * height) / 1e6) * FLAKES_PER_MEGAPIXEL) + 40);
      flakes = Array.from({ length: count }, () => makeFlake(width, height, true));
      draw();
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      time += dt;
      for (let i = 0; i < flakes.length; i += 1) {
        const flake = flakes[i];
        flake.y += flake.speed * dt;
        if (flake.y - flake.r > height) flakes[i] = makeFlake(width, height, false);
      }
      draw();
    };

    const start = () => {
      cancelAnimationFrame(frame);
      last = 0;
      if (!reducedMotion.matches && document.visibilityState === "visible") frame = requestAnimationFrame(tick);
      else draw();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    start();
    document.addEventListener("visibilitychange", start);
    reducedMotion.addEventListener("change", start);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", start);
      reducedMotion.removeEventListener("change", start);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
