"use client";

import { useEffect, useRef } from "react";
import { surprisePhase } from "@/lib/tree/surprises";

/** Original geometric silhouettes: two leaping deer towing a little curled sleigh. */
export function SleighSurprise() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fast = new URLSearchParams(window.location.search).get("surprises") === "fast";
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      const svg = ref.current;
      if (!svg) return;
      const phase = media.matches || document.hidden ? -1 : surprisePhase(Date.now(), "sleigh", fast);
      svg.style.visibility = phase < 0 ? "hidden" : "visible";
      timer = setTimeout(update, phase < 0 ? 500 : 16);
      if (phase < 0) return;
      svg.style.left = `${-35 + Math.max(0, phase) / 14 * 150}%`;
      svg.style.top = `${13 - Math.sin(Math.max(0, phase) / 14 * Math.PI) * 4}%`;
    };
    update();
    return () => clearTimeout(timer);
  }, []);
  return <svg ref={ref} aria-hidden="true" viewBox="0 0 300 80" className="pointer-events-none absolute z-0 w-[clamp(150px,22vw,330px)]" style={{ visibility: "hidden", color: "#263546", opacity: 0.8 }}>
    <g fill="currentColor" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 48 Q32 58 60 43 L65 59 Q47 69 17 61 Z" />
      <path d="M10 71 H64 Q78 71 79 62 M23 60 L20 71 M57 59 L60 71" fill="none" />
      <circle cx="40" cy="30" r="7" /><path d="M32 39 Q44 33 50 47 H28Z M42 23 L35 17 30 25" />
      <path d="M61 47 Q103 53 139 34 T236 28" fill="none" strokeWidth="1" />
      {[115, 213].map((x) => <g key={x} transform={`translate(${x} 0)`}>
        <ellipse cx="18" cy="34" rx="21" ry="8" /><path d="M30 32 L41 15 49 18 44 34Z" />
        <path d="M4 38 L-9 52 -22 49 M12 39 L2 57 -9 61 M30 38 L48 47 58 44 M34 36 L53 39 63 34 M-2 32 L-12 24 M44 17 L39 5 M40 10 L32 7 M40 10 L46 3" fill="none" />
      </g>)}
    </g>
  </svg>;
}
