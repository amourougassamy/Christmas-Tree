/**
 * Turntable spin: drag sets the angle directly, release leaves inertia that
 * decays, and after a pause the tree eases into a slow idle spin.
 * Pure state + functions so it can be tested without a browser.
 */

export const RADIANS_PER_PIXEL = 0.0085;
/** Idle auto-spin speed in radians per second (about one turn a minute). */
export const IDLE_SPIN_SPEED = 0.1;
/** Seconds after the last interaction before the idle spin resumes. */
export const IDLE_RESUME_DELAY = 2.5;
/** How fast velocity relaxes toward its target, per second. */
export const SPIN_DAMPING = 2.4;
/** Keyboard nudge, in radians per second added per key press. */
export const KEY_NUDGE = 1.1;
const MAX_SPEED = 9;

export type SpinState = {
  angle: number;
  /** Radians per second. */
  velocity: number;
  dragging: boolean;
  /** Seconds since the last pointer or key interaction. */
  idleFor: number;
};

export function createSpinState(angle = 0): SpinState {
  return { angle, velocity: 0, dragging: false, idleFor: IDLE_RESUME_DELAY };
}

export function beginDrag(state: SpinState): void {
  state.dragging = true;
  state.velocity = 0;
  state.idleFor = 0;
}

/** Apply a horizontal pointer movement of `dx` CSS pixels that took `dt` seconds. */
export function dragBy(state: SpinState, dx: number, dt: number): void {
  const delta = dx * RADIANS_PER_PIXEL;
  state.angle += delta;
  state.idleFor = 0;
  if (dt > 0) {
    // Smooth the release velocity over the last few moves.
    const instant = clamp(delta / dt, -MAX_SPEED, MAX_SPEED);
    state.velocity = state.velocity * 0.6 + instant * 0.4;
  }
}

export function endDrag(state: SpinState, msSinceLastMove: number): void {
  state.dragging = false;
  state.idleFor = 0;
  // Holding still before letting go should not fling the tree.
  if (msSinceLastMove > 80) state.velocity = 0;
}

export function nudge(state: SpinState, direction: -1 | 1): void {
  state.velocity = clamp(state.velocity + direction * KEY_NUDGE, -MAX_SPEED, MAX_SPEED);
  state.idleFor = 0;
}

/** Advance the spin by `dt` seconds. Returns true when the angle changed. */
export function stepSpin(state: SpinState, dt: number, autoSpin: boolean): boolean {
  if (state.dragging) return false;
  state.idleFor += dt;
  const target = autoSpin && state.idleFor >= IDLE_RESUME_DELAY ? IDLE_SPIN_SPEED : 0;
  state.velocity = target + (state.velocity - target) * Math.exp(-dt * SPIN_DAMPING);
  if (target === 0 && Math.abs(state.velocity) < 1e-3) state.velocity = 0;
  if (state.velocity === 0) return false;
  state.angle += state.velocity * dt;
  return true;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
