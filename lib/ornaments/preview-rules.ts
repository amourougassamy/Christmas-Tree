import { MAX_ORNAMENT_INCHES, MAX_ORNAMENT_SIDE_METRES, METRES_PER_INCH } from "./types.ts";

/** Shared by the browser converter and the server validator so both report sizes identically. */

export function metresToInches(metres: number): number {
  return metres / METRES_PER_INCH;
}

export function sizeInches(sizeMetres: readonly [number, number, number]): [number, number, number] {
  return sizeMetres.map((value) => roundTo(metresToInches(value), 2)) as [number, number, number];
}

export function exceedsOrnamentLimit(sizeMetres: readonly number[]): boolean {
  return sizeMetres.some((side) => side > MAX_ORNAMENT_SIDE_METRES);
}

export function formatSizeInches(sizeMetres: readonly [number, number, number]): string {
  return `${sizeMetres.map((side) => metresToInches(side).toFixed(2)).join(" × ")} in`;
}

export function tooBigMessage(sizeMetres: readonly [number, number, number]): string {
  const limit = metresToInches(MAX_ORNAMENT_SIDE_METRES).toFixed(2);
  return (
    `This ornament measures ${formatSizeInches(sizeMetres)}. ` +
    `It must fit within a ${MAX_ORNAMENT_INCHES}″ cube (each side at most ${limit} in). ` +
    "Scale it down in Rhino and check the file's units."
  );
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
