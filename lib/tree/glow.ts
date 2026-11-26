/** Skip expensive postprocessing on high-density/mobile or small-core devices.
 * An explicit bloom option always overrides this conservative TV/desktop default. */
export function defaultBloom(pixelRatio: number, cores: number): boolean {
  return pixelRatio <= 2 && cores >= 4;
}

/** Slow, bounded pulse: never flashes or extinguishes a light. */
export function glowPulse(time: number, phase = 0): number {
  return 1 + 0.07 * Math.sin(time * 0.85 + phase) + 0.025 * Math.sin(time * 1.7 + phase);
}
