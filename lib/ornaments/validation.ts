import { MAX_MESSAGE_LENGTH, MAX_MODEL_BYTES, MAX_NAME_LENGTH, MAX_PREVIEW_BYTES } from "./types.ts";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    status: number,
    code: string,
    message: string,
  ) {
    super(message);
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
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new ApiError(400, "INVALID_MESSAGE", "Message cannot exceed 80 characters.");
  }
  return message;
}

export function validateModel(file: unknown): asserts file is File {
  if (!(file instanceof File)) {
    throw new ApiError(400, "MODEL_REQUIRED", "A model file is required.");
  }
  if (!file.name.toLowerCase().endsWith(".3dm")) {
    throw new ApiError(415, "INVALID_MODEL_TYPE", "Only .3dm model files are accepted.");
  }
  if (file.size === 0) {
    throw new ApiError(400, "EMPTY_MODEL", "The model file cannot be empty.");
  }
  if (file.size > MAX_MODEL_BYTES) {
    throw new ApiError(413, "MODEL_TOO_LARGE", "The model file cannot exceed 20 MiB.");
  }
}

export async function readValidatedModel(file: File): Promise<ArrayBuffer> {
  const bytes = await file.arrayBuffer();
  const header = new TextDecoder("ascii").decode(bytes.slice(0, 32));
  if (!header.startsWith("3D Geometry File Format")) {
    throw new ApiError(415, "INVALID_MODEL_CONTENT", "The file is not a valid Rhino 3DM model.");
  }
  return bytes;
}

export function validatePreviewFile(file: unknown): asserts file is File {
  if (!(file instanceof File) || file.size === 0) {
    throw new ApiError(400, "PREVIEW_REQUIRED", "An optimized .glb preview is required. Re-select the model so it can be prepared.");
  }
  if (file.size > MAX_PREVIEW_BYTES) {
    throw new ApiError(413, "PREVIEW_TOO_LARGE", `The preview cannot exceed ${MAX_PREVIEW_BYTES / 1024} KiB.`);
  }
}
