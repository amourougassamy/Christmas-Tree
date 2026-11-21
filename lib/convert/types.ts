export type EyeletSource = "layer" | "fallback";

export interface ConvertReport {
  eyelet: EyeletSource;
  /** Present when the eyelet fell back to the top-centre of the bounding box. */
  eyeletWarning?: string;
  /** Bounding box of the rendered geometry, in inches, as [x, y, z] (Y-up). */
  sizeInches: [number, number, number];
  /** Triangles in the produced .glb. */
  triangles: number;
  /** Materials in the produced .glb. */
  materials: number;
  /** Size of the produced .glb, in bytes. */
  bytes: number;
  /** Triangles in the source model's renderable meshes. */
  sourceTriangles: number;
  /** Metres per model unit that was applied, and the unit name read from the file. */
  unit: { name: string; metresPerUnit: number; assumed: boolean };
}

export interface ConvertResult {
  glb: Uint8Array;
  report: ConvertReport;
}

export type ConvertErrorCode =
  | "NO_GEOMETRY"
  | "TOO_BIG"
  | "TOO_DETAILED"
  | "PREVIEW_TOO_LARGE"
  | "PARSE_FAILED";

export class ConvertError extends Error {
  readonly code: ConvertErrorCode;

  constructor(code: ConvertErrorCode, message: string) {
    super(message);
    this.name = "ConvertError";
    this.code = code;
  }
}
