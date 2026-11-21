import { countMessageWords } from "./message.ts";
import { MAX_MESSAGE_WORDS, MAX_MODEL_BYTES, MAX_NAME_LENGTH } from "./types.ts";

/**
 * True for an ApiError from any copy of this module. Next.js can bundle this file
 * more than once (instrumentation vs. route chunks, or dev reloads with the
 * service cached on globalThis), so `instanceof` alone is not reliable.
 */
export function isApiError(error: unknown): error is ApiError {
  if (error instanceof ApiError) return true;
  if (!(error instanceof Error) || error.name !== "ApiError") return false;
  const { status, code } = error as Error & { status?: unknown; code?: unknown };
  return typeof status === "number" && typeof code === "string";
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    status: number,
    code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function validateInitials(value: unknown): string {
  if (typeof value !== "string") {
    throw new ApiError(400, "INVALID_INITIALS", "Name must be text.");
  }
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > MAX_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new ApiError(400, "INVALID_INITIALS", "Enter a name between 1 and 60 characters.");
  }
  return name;
}

export function validateMessage(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") {
    throw new ApiError(400, "INVALID_MESSAGE", "Message must be text.");
  }
  const message = value.trim();
  if (countMessageWords(message) > MAX_MESSAGE_WORDS) {
    throw new ApiError(400, "INVALID_MESSAGE", "Your holiday wish cannot exceed 20 words.");
  }
  return message;
}

export function validateModel(file: unknown): asserts file is File {
  if (!(file instanceof File)) {
    throw new ApiError(400, "MODEL_REQUIRED", "A model file is required.");
  }
  if (!file.name.toLowerCase().endsWith(".glb")) {
    throw new ApiError(415, "INVALID_MODEL_TYPE", "Only .glb model files are accepted.");
  }
  if (file.size === 0) {
    throw new ApiError(400, "EMPTY_MODEL", "The model file cannot be empty.");
  }
  if (file.size > MAX_MODEL_BYTES) {
    throw new ApiError(413, "MODEL_TOO_LARGE", "The model file cannot exceed 512 KiB.");
  }
}

export async function readValidatedModel(file: File): Promise<ArrayBuffer> {
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength < 12 || new DataView(bytes).getUint32(0, true) !== 0x46546c67) {
    throw new ApiError(415, "INVALID_MODEL_CONTENT", "The file is not a valid GLB model.");
  }
  return bytes;
}
