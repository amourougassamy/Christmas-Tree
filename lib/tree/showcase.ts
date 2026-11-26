/**
 * TV showcase loop: the tree spins for a while, then every ornament gets a
 * close-up in turn, then the tree spins again. Pure state + functions so the
 * schedule can be tested without a browser or timers.
 */

export const SHOWCASE_SPIN_SECONDS = 120;
export const SHOWCASE_HOLD_SECONDS = 15;
/** Longest wait for a close-up model to load before the round moves on anyway. */
export const SHOWCASE_LOAD_GRACE_SECONDS = 10;

export type ShowcaseTiming = { spinSeconds: number; holdSeconds: number };

export const DEFAULT_SHOWCASE_TIMING: ShowcaseTiming = {
  spinSeconds: SHOWCASE_SPIN_SECONDS,
  holdSeconds: SHOWCASE_HOLD_SECONDS,
};

export type ShowcasePhase =
  | { kind: "spin"; endsAt: number }
  /**
   * `armed` turns true once the model has loaded (or failed); only then does
   * the hold clock start, so every ornament gets its full turn on screen.
   */
  | { kind: "closeup"; queue: string[]; index: number; armed: boolean; endsAt: number };

function waitForModel(now: number, timing: ShowcaseTiming): { armed: false; endsAt: number } {
  return { armed: false, endsAt: now + (timing.holdSeconds + SHOWCASE_LOAD_GRACE_SECONDS) * 1000 };
}

/** Step `index` by `delta` around a ring of `length` items. */
export function cycleIndex(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (((index + delta) % length) + length) % length;
}

export function startShowcase(now: number, timing: ShowcaseTiming = DEFAULT_SHOWCASE_TIMING): ShowcasePhase {
  return { kind: "spin", endsAt: now + timing.spinSeconds * 1000 };
}

/**
 * Called when the current phase's time is up. `ids` is the current ornament
 * order; a close-up round snapshots it so ornaments added mid-round wait for
 * the next round, and ornaments removed mid-round are skipped.
 */
export function advanceShowcase(
  phase: ShowcasePhase,
  now: number,
  ids: readonly string[],
  timing: ShowcaseTiming = DEFAULT_SHOWCASE_TIMING,
): ShowcasePhase {
  if (phase.kind === "spin") {
    if (ids.length === 0) return startShowcase(now, timing);
    return { kind: "closeup", queue: [...ids], index: 0, ...waitForModel(now, timing) };
  }
  const present = new Set(ids);
  for (let next = phase.index + 1; next < phase.queue.length; next += 1) {
    if (present.has(phase.queue[next])) return { ...phase, index: next, ...waitForModel(now, timing) };
  }
  return startShowcase(now, timing);
}

/** Manual arrow-key step during a close-up round; wraps and waits for the new model. */
export function stepShowcase(
  phase: ShowcasePhase,
  now: number,
  delta: -1 | 1,
  timing: ShowcaseTiming = DEFAULT_SHOWCASE_TIMING,
): ShowcasePhase {
  if (phase.kind !== "closeup") return phase;
  return { ...phase, index: cycleIndex(phase.index, delta, phase.queue.length), ...waitForModel(now, timing) };
}

/** The close-up model is on screen (or failed): start the hold clock once. */
export function armShowcaseHold(
  phase: ShowcasePhase,
  now: number,
  timing: ShowcaseTiming = DEFAULT_SHOWCASE_TIMING,
): ShowcasePhase {
  if (phase.kind !== "closeup" || phase.armed) return phase;
  return { ...phase, armed: true, endsAt: now + timing.holdSeconds * 1000 };
}

/** Read `?showcase`, `?spin=<seconds>` and `?hold=<seconds>` from a query string. */
export function parseShowcaseParams(search: string): { enabled: boolean; timing: ShowcaseTiming } {
  const params = new URLSearchParams(search);
  const seconds = (key: string, fallback: number) => {
    const value = Number(params.get(key));
    return Number.isFinite(value) && value >= 1 ? value : fallback;
  };
  const flag = params.get("showcase");
  return {
    enabled: flag !== null && flag !== "0" && flag !== "false",
    timing: { spinSeconds: seconds("spin", SHOWCASE_SPIN_SECONDS), holdSeconds: seconds("hold", SHOWCASE_HOLD_SECONDS) },
  };
}
