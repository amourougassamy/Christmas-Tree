/** Wall-clock schedules stay in sync across the canvas, SVG and WebGL layers.
 * Each time slot has a stable pseudo-random offset; no timers or frame allocations.
 */
export type Surprise = "sleigh" | "wave" | "gust";
const SETTINGS = {
  sleigh: { period: 690, jitter: 210, duration: 14 },
  wave: { period: 210, jitter: 60, duration: 3.6 },
  gust: { period: 240, jitter: 90, duration: 4.5 },
} as const;
function offset(slot: number, seed: number) {
  const n = Math.sin(slot * 127.1 + seed * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
export function surpriseStart(slot: number, kind: Surprise, fast = false): number {
  const { period, jitter } = SETTINGS[kind];
  return (slot * (fast ? 20 : period) + offset(slot, period) * (fast ? 2 : jitter)) * 1000;
}
/** Seconds into an active event, or -1 between events. */
export function surprisePhase(now: number, kind: Surprise, fast = false): number {
  const slot = Math.floor(now / ((fast ? 20 : SETTINGS[kind].period) * 1000));
  for (let candidate = slot - 1; candidate <= slot; candidate++) {
    const elapsed = (now - surpriseStart(candidate, kind, fast)) / 1000;
    if (elapsed >= 0 && elapsed < SETTINGS[kind].duration) return elapsed;
  }
  return -1;
}
export function gustEnvelope(now: number, fast = false): number {
  const phase = surprisePhase(now, "gust", fast);
  return phase < 0 ? 0 : Math.sin(Math.PI * phase / SETTINGS.gust.duration) ** 2;
}
export function waveAngle(now: number, fast = false): number {
  const phase = surprisePhase(now, "wave", fast);
  return phase < 0 ? 0 : Math.sin(Math.PI * phase / SETTINGS.wave.duration) ** 2 * (0.55 + Math.sin(phase * 10) * 0.3);
}
/** Fresh snow at 06:00, building until 18:00, melting/resetting after midnight. */
export function snowAmount(date: Date): number {
  const hour = date.getHours() + date.getMinutes() / 60;
  return hour < 6 ? 0 : Math.min(1, (hour - 6) / 12);
}
