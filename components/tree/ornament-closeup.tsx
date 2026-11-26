"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { createCloseupStage, type CloseupStageState } from "@/components/tree/closeup-stage";

type CloseupOrnament = {
  id: string;
  initials: string;
  message: string;
  modelUrl: string;
};

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reducedMotion;
}

function OrnamentStage({
  modelUrl,
  reducedMotion,
  turnSeconds,
  onSettled,
}: {
  modelUrl: string;
  reducedMotion: boolean;
  turnSeconds?: number;
  /** Called once the model is showing or has failed to load. */
  onSettled?: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<CloseupStageState>("loading");
  const onSettledRef = useRef(onSettled);
  useEffect(() => { onSettledRef.current = onSettled; });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const stage = createCloseupStage({
      mount,
      modelUrl,
      reducedMotion,
      turnSeconds,
      onStateChange: (next) => {
        setState(next);
        if (next !== "loading") onSettledRef.current?.();
      },
    });
    return () => stage.dispose();
  }, [modelUrl, reducedMotion, turnSeconds]);

  return (
    <div className="relative h-64 overflow-hidden rounded-t-2xl bg-[radial-gradient(circle_at_50%_42%,#315044_0%,#18352b_45%,#0d211a_100%)] sm:h-72">
      <div ref={mountRef} className="absolute inset-0" />
      {state === "loading" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="size-8 animate-spin rounded-full border-2 border-[#fff4e8]/25 border-t-[#ffe19a]" />
        </div>
      )}
      {state === "failed" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center text-[#f0e4df]">
          <span className="relative block size-16 rounded-full bg-[#b52d3c] shadow-[inset_-10px_-12px_18px_#6f1724,0_10px_30px_#0005] before:absolute before:-top-3 before:left-1/2 before:h-4 before:w-5 before:-translate-x-1/2 before:rounded-t-md before:bg-[#d7b35a]" />
          <p className="text-xs leading-relaxed">This ornament preview is taking a holiday.</p>
        </div>
      )}
      {state === "ready" && !turnSeconds && (
        <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[9px] font-semibold tracking-[0.2em] text-[#fff4e8]/70 backdrop-blur">
          DRAG TO SPIN
        </span>
      )}
    </div>
  );
}

const navButtonClass =
  "absolute top-32 z-10 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-[#08130d]/55 text-[#fff4e8] backdrop-blur transition hover:bg-[#08130d]/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffe19a] sm:top-36";

export function OrnamentCloseup({
  ornament,
  onClose,
  onNavigate,
  position,
  showcase,
}: {
  ornament: CloseupOrnament | null;
  onClose: () => void;
  /** Step to the previous (-1) or next (+1) ornament; omit to hide the arrows. */
  onNavigate?: (delta: -1 | 1) => void;
  /** Zero-based place of this ornament in the ring, for the "3 / 12" label. */
  position?: { index: number; total: number };
  /** TV showcase: one full turn over `holdSeconds`, with a progress bar once `started`. */
  showcase?: { holdSeconds: number; started: boolean; onSettled: () => void };
}) {
  const [lastOrnament, setLastOrnament] = useState<CloseupOrnament | null>(ornament);
  const reducedMotion = usePrefersReducedMotion();
  if (ornament && ornament !== lastOrnament) setLastOrnament(ornament);
  const displayed = ornament ?? lastOrnament;

  return (
    <DialogPrimitive.Root open={ornament !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#08130d]/55 backdrop-blur-[3px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        {displayed && (
          <DialogPrimitive.Content
            onKeyDown={(event) => {
              if (!onNavigate || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
              event.preventDefault();
              onNavigate(event.key === "ArrowLeft" ? -1 : 1);
            }}
            className="fixed left-[50%] top-[50%] z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-[#547064]/30 bg-[#10271f]/95 text-[#fff4e8] shadow-2xl outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:w-[30rem]">
            <OrnamentStage
              key={displayed.id}
              modelUrl={displayed.modelUrl}
              reducedMotion={reducedMotion}
              turnSeconds={showcase?.holdSeconds}
              onSettled={showcase?.onSettled}
            />
            {showcase && (
              <div className="absolute inset-x-0 top-0 z-10 h-1 bg-white/10">
                {showcase.started && (
                  <div
                    key={displayed.id}
                    className="showcase-progress h-full origin-left bg-[#ffe19a]/80"
                    style={{ animationDuration: `${showcase.holdSeconds}s` }}
                  />
                )}
              </div>
            )}
            {onNavigate && position && position.total > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous ornament"
                  onClick={() => onNavigate(-1)}
                  className={navButtonClass + " left-3"}
                >
                  <ChevronLeftIcon className="size-5" />
                </button>
                <button
                  type="button"
                  aria-label="Next ornament"
                  onClick={() => onNavigate(1)}
                  className={navButtonClass + " right-3"}
                >
                  <ChevronRightIcon className="size-5" />
                </button>
              </>
            )}
            <DialogPrimitive.Close
              aria-label="Close close-up and return to the tree"
              className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full border border-white/15 bg-[#08130d]/55 text-[#fff4e8] backdrop-blur transition hover:bg-[#08130d]/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffe19a]"
            >
              <XIcon className="size-4" />
            </DialogPrimitive.Close>
            <div className="border-t border-white/10 px-6 py-5 sm:px-7 sm:py-6">
              <p className="flex justify-between gap-3 text-[9px] font-semibold uppercase tracking-[0.24em] text-[#d5c9bd]/75">
                <span>Community ornament</span>
                {position && position.total > 1 && (
                  <span aria-live="polite" className="tabular-nums">{position.index + 1} / {position.total}</span>
                )}
              </p>
              <DialogPrimitive.Title className="mt-2 font-serif text-2xl tracking-[-0.02em] text-[#fff4e8]">
                {displayed.initials}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-3 text-sm leading-6 text-[#f0e4df]/85">
                {displayed.message.trim() || "No message — just a little something for the tree."}
              </DialogPrimitive.Description>
            </div>
          </DialogPrimitive.Content>
        )}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
