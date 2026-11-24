"use client";

import { useEffect, useRef } from "react";

type SnowLayer = "background" | "foreground";
type Flake = { x: number; y: number; r: number; speed: number; sway: number; phase: number; alpha: number; blur: number };

const FLAKES_PER_MEGAPIXEL = 150;
const MAX_FLAKES = 260;

function makeFlake(width: number, height: number, anywhere: boolean, layer: SnowLayer): Flake {
  const foreground = layer === "foreground";
  const r = foreground ? 2.4 + Math.random() ** 1.7 * 4.8 : 0.55 + Math.random() ** 2 * 2.4;
  return {
    x: Math.random() * width,
    y: anywhere ? Math.random() * height : -r * 2,
    r,
    // Size, speed and softness work together as a simple depth cue.
    speed: foreground ? 48 + r * 9 + Math.random() * 18 : 14 + r * 9 + Math.random() * 9,
    sway: foreground ? 14 + Math.random() * 28 : 5 + Math.random() * 14,
    phase: Math.random() * Math.PI * 2,
    alpha: foreground ? 0.34 + Math.random() * 0.34 : 0.2 + (r / 2.95) * 0.5,
    blur: foreground ? Math.max(0, (r - 3.2) * 0.18) : 0,
  };
}

/** Layered snowfall. Two canvases create distant and close depth planes. */
export function SnowCanvas({ className, layer = "background" }: { className?: string; layer?: SnowLayer }) {
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
        context.filter = flake.blur ? `blur(${flake.blur}px)` : "none";
        context.beginPath();
        context.arc(flake.x + Math.sin(time * (layer === "foreground" ? 0.42 : 0.6) + flake.phase) * flake.sway, flake.y, flake.r, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      context.filter = "none";
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = layer === "foreground"
        ? Math.max(18, Math.round(((width * height) / 1e6) * 28))
        : Math.min(MAX_FLAKES, Math.round(((width * height) / 1e6) * FLAKES_PER_MEGAPIXEL) + 40);
      flakes = Array.from({ length: count }, () => makeFlake(width, height, true, layer));
      draw();
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      // Keep a quiet drift for reduced-motion users instead of turning a
      // living snowfall into a completely static field of dots.
      const motionScale = reducedMotion.matches ? 0.28 : 1;
      time += dt * motionScale;
      for (let i = 0; i < flakes.length; i += 1) {
        const flake = flakes[i];
        flake.y += flake.speed * dt * motionScale;
        if (flake.y - flake.r > height) flakes[i] = makeFlake(width, height, false, layer);
      }
      draw();
    };

    const start = () => {
      cancelAnimationFrame(frame);
      last = 0;
      if (document.visibilityState === "visible") frame = requestAnimationFrame(tick);
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
  }, [layer]);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
