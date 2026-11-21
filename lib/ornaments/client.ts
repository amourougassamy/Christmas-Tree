import { countMessageWords } from "./message.ts";
import { MAX_MODEL_BYTES, MAX_NAME_LENGTH, MAX_MESSAGE_WORDS } from "./types.ts";



export type ClientValidationError = {
  field: "initials" | "model" | "message";
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
  if (!file.name.toLowerCase().endsWith(".glb")) {
    return { field: "model", message: "Choose a .glb file." };
  }
  if (file.size === 0) {
    return { field: "model", message: "That file is empty. Export it from Rhino again." };
  }
  if (file.size > MAX_MODEL_BYTES) {
    return { field: "model", message: "That file is larger than 512 KiB." };
  }
  return null;
}

export function hasGlbHeader(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(0, true) === 0x46546c67 && view.getUint32(4, true) === 2;
}

export async function validateGlbFile(file: File): Promise<ClientValidationError | null> {
  const metadataError = validateModelMetadata(file);
  if (metadataError) return metadataError;
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return hasGlbHeader(header) ? null : {
    field: "model", message: "This is not a GLB 2.0 model. Ask your agent to export it as .glb.",
  };
}

export function formatMessageCount(value: string): string {
  return `${countMessageWords(value)}/${MAX_MESSAGE_WORDS} words`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "3.00 × 3.22 × 3.00 in" */
export function formatInches(size: readonly number[]): string {
  return `${size.map((side) => side.toFixed(2)).join(" × ")} in`;
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}
