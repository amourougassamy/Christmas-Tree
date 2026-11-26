"use client";

import { type KeyboardEvent, type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MonitorPlayIcon, XIcon } from "lucide-react";
import { ShootingStar } from "@/components/tree/shooting-star";
import { HolidayMusic } from "@/components/tree/holiday-music";
import { ForestWaldo } from "@/components/tree/forest-waldo";
import { SnowCanvas } from "@/components/tree/snow-canvas";
import { OrnamentCloseup } from "@/components/tree/ornament-closeup";
import { createTreeScene, type TreeScene } from "@/components/tree/tree-scene";
import { TREE_SLOT_COUNT } from "@/lib/tree/anchors";
import { formatOrnamentCallout } from "@/lib/tree/model";
import {
  advanceShowcase,
  armShowcaseHold,
  cycleIndex,
  parseShowcaseParams,
  startShowcase,
  stepShowcase,
  type ShowcasePhase,
  type ShowcaseTiming,
} from "@/lib/tree/showcase";

type Ornament = {
  id: string;
  initials: string;
  message: string;
  slot: number;
  originalName: string;
  modelUrl: string;
};

/** Pointer travel (CSS px) after which a press counts as a spin, not a click. */
const DRAG_THRESHOLD = 6;

export function TreeExperience({ ornaments, arrivalId }: { ornaments: Ornament[]; arrivalId?: string | null }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<TreeScene | null>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const pointerRef = useRef<{ id: number; startX: number; startY: number; dragged: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const [autoMessageId, setAutoMessageId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [closeupOrnament, setCloseupOrnament] = useState<Ornament | null>(null);
  const [showcase, setShowcase] = useState<{ phase: ShowcasePhase; timing: ShowcaseTiming } | null>(null);
  const visibleOrnaments = useMemo(
    () => ornaments
      .filter((item) => item.slot >= 1 && item.slot <= TREE_SLOT_COUNT)
      .sort((a, b) => a.slot - b.slot),
    [ornaments],
  );
  const latestOrnaments = useRef(visibleOrnaments);
  const status = visibleOrnaments.length
    ? `${visibleOrnaments.length} community ornaments on the tree`
    : "Traditional decorations for now — add yours to make it our tree";

  // Build the scene once; ornament changes are applied slot by slot below.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = createTreeScene({
      mount,
      getButton: (id) => buttonRefs.current.get(id),
      onReveal: setAutoMessageId,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
    sceneRef.current = scene;
    scene.sync(latestOrnaments.current);
    return () => {
      sceneRef.current = null;
      scene.dispose();
    };
  }, []);

  useEffect(() => {
    latestOrnaments.current = visibleOrnaments;
    sceneRef.current?.sync(visibleOrnaments, arrivalId);
  }, [visibleOrnaments, arrivalId]);

  useEffect(() => {
    sceneRef.current?.zoom(zoom);
  }, [zoom]);

  // ── TV showcase: spin, then a close-up of every ornament, then spin again. ──
  const beginShowcase = useCallback((timing: ShowcaseTiming) => {
    setCloseupOrnament(null);
    setZoom(1);
    setShowcase({ phase: startShowcase(Date.now(), timing), timing });
  }, []);
  const endShowcase = useCallback(() => {
    setShowcase(null);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);

  // `?showcase` starts it on load (handy for a kiosk TV); `?spin=` / `?hold=` tune it.
  useEffect(() => {
    const { enabled, timing } = parseShowcaseParams(window.location.search);
    if (!enabled) return;
    // Deferred so it runs after hydration rather than inside the effect body.
    const timer = setTimeout(() => beginShowcase(timing), 0);
    return () => clearTimeout(timer);
  }, [beginShowcase]);

  // Move to the next phase when the current one's time is up.
  useEffect(() => {
    if (!showcase) return;
    const timer = setTimeout(() => {
      setShowcase((current) => current && current.phase === showcase.phase
        ? { ...current, phase: advanceShowcase(current.phase, Date.now(), latestOrnaments.current.map((item) => item.id), current.timing) }
        : current);
    }, Math.max(0, showcase.phase.endsAt - Date.now()));
    return () => clearTimeout(timer);
  }, [showcase]);

  const showcasePhase = showcase?.phase ?? null;
  const showcaseOrnament = showcasePhase?.kind === "closeup"
    ? visibleOrnaments.find((item) => item.id === showcasePhase.queue[showcasePhase.index]) ?? null
    : null;

  // An ornament deleted mid-round: skip straight past it.
  useEffect(() => {
    if (showcasePhase?.kind !== "closeup" || showcaseOrnament) return;
    setShowcase((current) => current && {
      ...current,
      phase: advanceShowcase(current.phase, Date.now(), latestOrnaments.current.map((item) => item.id), current.timing),
    });
  }, [showcasePhase, showcaseOrnament]);

  // Escape leaves showcase while the tree is spinning (the close-up dialog handles its own Escape).
  useEffect(() => {
    if (!showcase) return;
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") endShowcase(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showcase, endShowcase]);

  const displayedCloseup = showcase ? showcaseOrnament : closeupOrnament;
  const closeupPosition = displayedCloseup
    ? showcasePhase?.kind === "closeup"
      ? { index: showcasePhase.index, total: showcasePhase.queue.length }
      : { index: Math.max(0, visibleOrnaments.findIndex((item) => item.id === displayedCloseup.id)), total: visibleOrnaments.length }
    : undefined;
  const navigateCloseup = (delta: -1 | 1) => {
    if (showcase) {
      setShowcase((current) => current && { ...current, phase: stepShowcase(current.phase, Date.now(), delta, current.timing) });
      return;
    }
    setCloseupOrnament((current) => {
      if (!current || visibleOrnaments.length === 0) return current;
      const index = visibleOrnaments.findIndex((item) => item.id === current.id);
      return visibleOrnaments[cycleIndex(Math.max(0, index), delta, visibleOrnaments.length)];
    });
  };
  const armHold = useCallback(() => {
    setShowcase((current) => current && { ...current, phase: armShowcaseHold(current.phase, Date.now(), current.timing) });
  }, []);

  useEffect(() => {
    if (!autoMessageId) return;
    const timer = setTimeout(() => setAutoMessageId(null), 2600);
    return () => clearTimeout(timer);
  }, [autoMessageId]);

  const adjustZoom = (delta: number) => {
    setZoom((current) => Math.max(1, Math.min(2.5, Math.round((current + delta) * 100) / 100)));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    pointerRef.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, dragged: false };
    sceneRef.current?.pointerDown(event.clientX, event.clientY);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    if (!pointer.dragged && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > DRAG_THRESHOLD) {
      pointer.dragged = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    sceneRef.current?.pointerMove(event.clientX, event.clientY);
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    suppressClickRef.current = pointer.dragged;
    pointerRef.current = null;
    sceneRef.current?.pointerUp();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "+" || event.key === "=" || event.key === "-") {
      event.preventDefault();
      adjustZoom(event.key === "-" ? -0.05 : 0.05);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (zoom <= 1) return;
      event.preventDefault();
      sceneRef.current?.pan(event.key === "ArrowUp" ? 0.6 : -0.6);
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    sceneRef.current?.nudge(event.key === "ArrowLeft" ? -1 : 1);
  };

  return (
    <main className="tree-backdrop relative min-h-[100svh] overflow-hidden text-[#fff4e8]">
      <ShootingStar />
      <ForestWaldo />
      <SnowCanvas className="pointer-events-none absolute inset-0 z-0 h-full w-full" />

      <div
        tabIndex={0}
        role="group"
        aria-roledescription="3D tree"
        aria-label="Community tree. Drag sideways to spin it. When zoomed in, drag vertically or use the up and down arrow keys to explore it."
        className="tree-stage absolute inset-0 z-[1] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#426052]/60"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
        onClickCapture={(event) => {
          if (!suppressClickRef.current) return;
          suppressClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <div ref={mountRef} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-0">
          {visibleOrnaments.map((ornament) => {
            const active = activeId === ornament.id;
            const showMessage = active || (!activeId && autoMessageId === ornament.id);
            return (
              <button
                key={ornament.id}
                ref={(element) => {
                  if (element) buttonRefs.current.set(ornament.id, element);
                  else buttonRefs.current.delete(ornament.id);
                }}
                type="button"
                aria-label={ornament.message ? `${ornament.message} — ${ornament.initials}, ornament slot ${ornament.slot}` : `Ornament by ${ornament.initials}, slot ${ornament.slot}`}
                className="group pointer-events-auto absolute left-0 top-0 h-11 w-11 rounded-full opacity-0 outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-[#ffe19a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#153228]"
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse") setActiveId(ornament.id);
                }}
                onPointerLeave={() => setActiveId((current) => current === ornament.id ? null : current)}
                onFocus={() => setActiveId(ornament.id)}
                onBlur={() => setActiveId((current) => current === ornament.id ? null : current)}
                onClick={() => setCloseupOrnament(ornament)}
              >
                <span className={`absolute left-1/2 top-[-1.8rem] w-max max-w-[min(16rem,70vw)] -translate-x-1/2 whitespace-normal rounded-xl border border-white/15 bg-[#10271f]/92 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-[#fff4cf] shadow-lg backdrop-blur transition duration-500 ${showMessage ? "scale-100 opacity-100" : "scale-90 opacity-0"}`}>
                  {formatOrnamentCallout(ornament.message, ornament.initials)}
                </span>
                <span className="sr-only">{ornament.originalName}</span>
              </button>
            );
          })}
        </div>
      </div>

      <SnowCanvas layer="foreground" className="pointer-events-none absolute inset-0 z-10 h-full w-full" />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-6 p-5 sm:p-8">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#e3d2c7]">MKA community tree</p>
          <h1 className="mt-2 font-serif text-2xl tracking-[-0.03em] sm:text-4xl">Made brighter together.</h1>
        </div>
        {showcase ? (
          <button
            type="button"
            onClick={endShowcase}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/15 bg-[#10271f]/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#fff4e8]/80 opacity-40 backdrop-blur transition hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[#ffe19a]"
          >
            <XIcon aria-hidden="true" className="size-3.5" /> Exit showcase
          </button>
        ) : (
          <p className="max-w-40 text-right text-[11px] leading-relaxed text-[#f0e4df]/85 sm:max-w-60 sm:text-xs">
            Drag sideways to spin · tap an ornament for a close-up
          </p>
        )}
      </header>

      <HolidayMusic />

      <div className={`absolute bottom-20 right-5 z-20 flex items-center gap-2 sm:right-8 ${showcase ? "hidden" : ""}`}>
        <button type="button" aria-label="Start TV showcase"
          title="TV showcase: spin the tree, then show each ornament up close"
          onClick={() => {
            void document.documentElement.requestFullscreen?.().catch(() => {});
            beginShowcase(parseShowcaseParams(window.location.search).timing);
          }}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[#547064]/20 bg-white/65 text-[#426052] shadow-sm backdrop-blur transition hover:bg-white/80 focus-visible:outline-2 focus-visible:outline-[#426052]">
          <MonitorPlayIcon aria-hidden="true" className="size-4" />
        </button>
        <div role="group" aria-label="Pan up and down"
          className="flex items-center rounded-full border border-[#547064]/20 bg-white/65 p-1 text-[#426052] shadow-sm backdrop-blur">
          <button type="button" aria-label="Pan up" disabled={zoom <= 1}
            onClick={() => sceneRef.current?.pan(0.6)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-base transition hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-[#426052] disabled:opacity-30">↑</button>
          <button type="button" aria-label="Pan down" disabled={zoom <= 1}
            onClick={() => sceneRef.current?.pan(-0.6)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-base transition hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-[#426052] disabled:opacity-30">↓</button>
        </div>
        <div role="group" aria-label="Tree zoom"
          className="flex items-center rounded-full border border-[#547064]/20 bg-white/65 p-1 text-[#426052] shadow-sm backdrop-blur">
        <button type="button" aria-label="Zoom out" disabled={zoom <= 1}
          onClick={() => adjustZoom(-0.05)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-xl transition hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-[#426052] disabled:opacity-30">
          −
        </button>
        <span aria-live="polite" className="w-10 text-center text-[10px] tabular-nums">{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="Zoom in" disabled={zoom >= 2.5}
          onClick={() => adjustZoom(0.05)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-xl transition hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-[#426052] disabled:opacity-30">
          +
        </button>
        </div>
      </div>

      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-4 p-5 sm:p-8">
        <div className="max-w-[70vw]">
          <p aria-live="polite" className="sr-only">{status}</p>
          <p className="font-serif text-[9px] italic tracking-[0.025em] text-[#58665e]/65 sm:text-[10px]">
            Happy Holidays from Adv Geom TST
          </p>
        </div>
        <span className="rounded-full border border-[#547064]/20 bg-white/65 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.15em] text-[#426052] backdrop-blur">
          {TREE_SLOT_COUNT} branches
        </span>
      </footer>
      <OrnamentCloseup
        ornament={displayedCloseup}
        onClose={() => (showcase ? endShowcase() : setCloseupOrnament(null))}
        onNavigate={navigateCloseup}
        position={closeupPosition}
        showcase={showcase && showcasePhase?.kind === "closeup"
          ? { holdSeconds: showcase.timing.holdSeconds, started: showcasePhase.armed, onSettled: armHold }
          : undefined}
      />
    </main>
  );
}
