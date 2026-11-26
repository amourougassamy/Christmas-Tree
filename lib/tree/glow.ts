/**
 * Tuning for the fairy-light glow. Pure numbers so they can be tested and
 * adjusted in one place.
 */

/** Bulb core colour multiplier (1 = the bulb's own colour, unboosted). */
export const BULB_BRIGHTNESS = 1;

/** Halo sprite diameter in scene units before perspective; renders roughly 40px across at the default framing. */
export const HALO_SIZE = 3.2;

/** Star halo, relative to a bulb halo. */
export const STAR_HALO_SCALE = 2.6;

/** Star and lantern flame emissive levels before the gentle pulse. */
export const EMISSIVE_LEVEL = { "star-glow": 0.6, "lantern-flame": 1.3 } as const;

/** Halo strength from the night factor (0 bright day .. 1 deep night): faint by day, soft at night. */
export function haloOpacity(nightFactor: number): number {
  const night = Math.min(1, Math.max(0, nightFactor));
  return 0.18 + 0.32 * night;
}

/** Slow, bounded pulse: never flashes or extinguishes a light. */
export function glowPulse(time: number, phase = 0): number {
  return 1 + 0.07 * Math.sin(time * 0.85 + phase) + 0.025 * Math.sin(time * 1.7 + phase);
}
