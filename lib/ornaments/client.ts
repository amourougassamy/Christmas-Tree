import { MAX_MODEL_BYTES, MAX_NAME_LENGTH } from "./types.ts";

export const RHINO_HEADER = "3D Geometry File Format";

export type ClientValidationError = {
  field: "initials" | "model";
  message: string;
};

export function validateInitialsClient(value: string): ClientValidationError | null {
  const name = value.trim();
  if (!name || name.length > MAX_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(name)) {
    return { field: "initials", message: "Enter a name between 1 and 60 characters." };
  }
  return null;
}

export function validateModelMetadata(file: Pick<File, "name" | "size">): ClientValidationError | null {
  if (!file.name.toLowerCase().endsWith(".3dm")) {
    return { field: "model", message: "Choose a Rhino .3dm file." };
  }
  if (file.size === 0) {
    return { field: "model", message: "That file is empty. Export it from Rhino again." };
  }
  if (file.size > MAX_MODEL_BYTES) {
    return { field: "model", message: "That file is larger than 20 MiB." };
  }
  return null;
}

export function hasRhinoHeader(bytes: Uint8Array): boolean {
  const header = new TextDecoder("ascii").decode(bytes.slice(0, 32));
  return header.startsWith(RHINO_HEADER);
}

export async function validateRhinoFile(file: File): Promise<ClientValidationError | null> {
  const metadataError = validateModelMetadata(file);
  if (metadataError) return metadataError;

  const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  if (!hasRhinoHeader(header)) {
    return {
      field: "model",
      message: "This file does not appear to be a Rhino 3DM model. Re-export it as .3dm and try again.",
    };
  }
  return null;
}

export function formatMessageCount(value: string): string {
  return `${value.length}/80`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Filename for the converted preview uploaded alongside `modelName`. */
export function previewFileName(modelName: string): string {
  const base = modelName.replace(/\.3dm$/i, "").trim();
  return `${base || "ornament"}.glb`;
}

/** "3.00 × 3.22 × 3.00 in" */
export function formatInches(size: readonly number[]): string {
  return `${size.map((side) => side.toFixed(2)).join(" × ")} in`;
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}
