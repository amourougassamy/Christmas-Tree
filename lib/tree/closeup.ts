/** Pure rotation state for the ornament close-up. */
export const CLOSEUP_RADIANS_PER_PIXEL = 0.006;
export const CLOSEUP_PITCH_LIMIT = Math.PI / 3;
export const CLOSEUP_IDLE_SPIN_SPEED = 0.35;
export const CLOSEUP_IDLE_RESUME_DELAY = 1.5;
export const CLOSEUP_DAMPING = 2.8;
const MAX_CLOSEUP_SPEED = 9;

export type CloseupRotation = {
  yaw: number;
  pitch: number;
  yawVelocity: number;
  pitchVelocity: number;
  dragging: boolean;
  idleFor: number;
};

export function createCloseupRotation(): CloseupRotation {
  return { yaw: 0.55, pitch: 0.14, yawVelocity: 0, pitchVelocity: 0, dragging: false, idleFor: CLOSEUP_IDLE_RESUME_DELAY };
}

export function closeupBeginDrag(state: CloseupRotation): void {
  state.dragging = true;
  state.yawVelocity = 0;
  state.pitchVelocity = 0;
  state.idleFor = 0;
}

/** Apply a pointer movement in CSS pixels that took dt seconds. */
export function closeupDragBy(state: CloseupRotation, dx: number, dy: number, dt: number): void {
  const yawDelta = dx * CLOSEUP_RADIANS_PER_PIXEL;
  const previousPitch = state.pitch;
  state.yaw += yawDelta;
  state.pitch = clamp(state.pitch + dy * CLOSEUP_RADIANS_PER_PIXEL, -CLOSEUP_PITCH_LIMIT, CLOSEUP_PITCH_LIMIT);
  state.idleFor = 0;
  if (dt > 0) {
    const instantYaw = clamp(yawDelta / dt, -MAX_CLOSEUP_SPEED, MAX_CLOSEUP_SPEED);
    const instantPitch = clamp((state.pitch - previousPitch) / dt, -MAX_CLOSEUP_SPEED, MAX_CLOSEUP_SPEED);
    state.yawVelocity = state.yawVelocity * 0.6 + instantYaw * 0.4;
    state.pitchVelocity = state.pitchVelocity * 0.6 + instantPitch * 0.4;
  }
}

export function closeupEndDrag(state: CloseupRotation, msSinceLastMove: number): void {
  state.dragging = false;
  state.idleFor = 0;
  if (msSinceLastMove > 80) {
    state.yawVelocity = 0;
    state.pitchVelocity = 0;
  }
}

/** Advance rotation by dt seconds. Returns true when either angle changed. */
export function stepCloseupRotation(state: CloseupRotation, dt: number, autoSpin: boolean): boolean {
  if (state.dragging) return false;
  state.idleFor += dt;
  const yawTarget = autoSpin && state.idleFor >= CLOSEUP_IDLE_RESUME_DELAY ? CLOSEUP_IDLE_SPIN_SPEED : 0;
  const decay = Math.exp(-dt * CLOSEUP_DAMPING);
  state.yawVelocity = yawTarget + (state.yawVelocity - yawTarget) * decay;
  state.pitchVelocity *= decay;
  if (yawTarget === 0 && Math.abs(state.yawVelocity) < 1e-3) state.yawVelocity = 0;
  if (Math.abs(state.pitchVelocity) < 1e-3) state.pitchVelocity = 0;
  if (state.yawVelocity === 0 && state.pitchVelocity === 0) return false;
  state.yaw += state.yawVelocity * dt;
  state.pitch = clamp(state.pitch + state.pitchVelocity * dt, -CLOSEUP_PITCH_LIMIT, CLOSEUP_PITCH_LIMIT);
  return true;
}

/**
 * Showcase turntable: exactly one full turn over `turnSeconds`, linear so the
 * speed is steady on a TV, then it holds at the starting pose.
 */
export function turntableYaw(startYaw: number, elapsedSeconds: number, turnSeconds: number): number {
  if (turnSeconds <= 0) return startYaw;
  return startYaw + Math.PI * 2 * clamp(elapsedSeconds / turnSeconds, 0, 1);
}

export function closeupCameraDistance(radius: number, fovY: number, aspect: number, maxFraction = 0.62): number {
  const vertical = radius / Math.tan(fovY / 2);
  const horizontal = radius / (Math.tan(fovY / 2) * aspect);
  return Math.max(vertical, horizontal) / maxFraction + radius * 0.4;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
