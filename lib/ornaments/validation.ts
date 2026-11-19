import { MAX_MODEL_BYTES } from "./types.ts";

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
  if (typeof value !== "string" || !/^[A-Z]{1,4}$/.test(value)) {
    throw new ApiError(400, "INVALID_INITIALS", "Initials must be 1-4 uppercase A-Z letters.");
  }
  return value;
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
    throw new ApiError(413, "MODEL_TOO_LARGE", "The model file cannot exceed 10 MiB.");
  }
}
