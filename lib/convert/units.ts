import { METRES_PER_INCH } from "../ornaments/types.ts";

/** Metres per unit for Rhino `UnitSystem` values, keyed by the enum's short name. */
const METRES_PER_UNIT: Record<string, number> = {
  Angstroms: 1e-10,
  Nanometers: 1e-9,
  Microns: 1e-6,
  Millimeters: 1e-3,
  Centimeters: 1e-2,
  Decimeters: 1e-1,
  Meters: 1,
  Dekameters: 10,
  Hectometers: 100,
  Kilometers: 1000,
  Microinches: METRES_PER_INCH * 1e-6,
  Mils: METRES_PER_INCH * 1e-3,
  Inches: METRES_PER_INCH,
  Feet: METRES_PER_INCH * 12,
  Yards: METRES_PER_INCH * 36,
  Miles: 1609.344,
  PrinterPoints: METRES_PER_INCH / 72,
  PrinterPicas: METRES_PER_INCH / 6,
};

/** Rhino `UnitSystem` numeric values, for when only the number survives. */
const UNIT_NAMES_BY_VALUE: Record<number, string> = {
  0: "None",
  1: "Microns",
  2: "Millimeters",
  3: "Centimeters",
  4: "Meters",
  5: "Kilometers",
  6: "Microinches",
  7: "Mils",
  8: "Inches",
  9: "Feet",
  10: "Miles",
  11: "CustomUnits",
  12: "Angstroms",
  13: "Nanometers",
  14: "Decimeters",
  15: "Dekameters",
  16: "Hectometers",
  19: "Yards",
  20: "PrinterPoints",
  21: "PrinterPicas",
  255: "Unset",
};

export interface ModelUnit {
  name: string;
  metresPerUnit: number;
  /** True when the file had no usable unit system and inches were assumed. */
  assumed: boolean;
}

/**
 * Reads the model unit system from Rhino3dmLoader's `userData.settings`
 * (`{ modelUnitSystem: { name: "UnitSystem_Millimeters", value: 2 } }`).
 * No unit system, or an unknown/custom one, is treated as inches.
 */
export function modelUnit(settings: unknown): ModelUnit {
  const raw = (settings as { modelUnitSystem?: unknown } | null | undefined)?.modelUnitSystem;
  const name = unitName(raw);
  const metresPerUnit = name ? METRES_PER_UNIT[name] : undefined;
  if (name && metresPerUnit) return { name, metresPerUnit, assumed: false };
  return { name: name ?? "None", metresPerUnit: METRES_PER_INCH, assumed: true };
}

function unitName(raw: unknown): string | null {
  if (typeof raw === "string") return raw.replace(/^UnitSystem_/, "");
  if (typeof raw === "number") return UNIT_NAMES_BY_VALUE[raw] ?? null;
  if (raw && typeof raw === "object") {
    const { name, value } = raw as { name?: unknown; value?: unknown };
    if (typeof name === "string" && name.startsWith("UnitSystem_")) return name.slice("UnitSystem_".length);
    if (typeof value === "number") return UNIT_NAMES_BY_VALUE[value] ?? null;
  }
  return null;
}
