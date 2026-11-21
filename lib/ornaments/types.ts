export const SLOT_COUNT = 60;
export const MAX_MODEL_BYTES = 512 * 1024;
export const MAX_NAME_LENGTH = 60;
export const MAX_MESSAGE_WORDS = 20;

/** Budgets for the optimized .glb preview the tree page renders. */
export const MAX_PREVIEW_BYTES = 512 * 1024;
export const MAX_PREVIEW_TRIANGLES = 8_000;
export const MAX_PREVIEW_MATERIALS = 4;

/** Every ornament renders at true size and must fit a cube this many inches per side. */
export const MAX_ORNAMENT_INCHES = 4;
export const ORNAMENT_SIZE_TOLERANCE = 0.05;
export const METRES_PER_INCH = 0.0254;
/** Largest allowed bounding-box side, in metres (glTF units). */
export const MAX_ORNAMENT_SIDE_METRES = MAX_ORNAMENT_INCHES * METRES_PER_INCH * (1 + ORNAMENT_SIZE_TOLERANCE);

export interface OrnamentRecord {
  id: string;
  initials: string;
  message: string;
  slot: number;
  /** Storage key of the original uploaded file (GLB for new uploads; legacy 3DM remains downloadable). */
  objectKey: string;
  originalName: string;
  byteSize: number;
  /** Storage key of the optimized .glb preview rendered on the tree. */
  previewKey: string;
  previewByteSize: number;
  createdAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
}

export type PublicOrnament = Omit<OrnamentRecord, "objectKey" | "previewKey" | "deletedAt"> & {
  /** Same-origin URL of the optimized .glb preview. */
  modelUrl: string;
  /** Same-origin URL of the original uploaded file. */
  sourceUrl: string;
};

export type NewOrnament = OrnamentRecord;

export interface OrnamentRepository {
  claimNextSlot(): Promise<number>;
  archiveActiveAndInsert(record: NewOrnament): Promise<void>;
  list(includeArchived: boolean): Promise<OrnamentRecord[]>;
  find(id: string): Promise<OrnamentRecord | null>;
  deleteAndRestore(id: string, deletedAt: string): Promise<OrnamentRecord | null>;
}

export interface StoredModel {
  body: ReadableStream;
  size: number;
  etag?: string;
}

export interface ModelStore {
  put(key: string, bytes: ArrayBuffer, metadata: Record<string, string>): Promise<void>;
  get(key: string): Promise<StoredModel | null>;
  delete(key: string): Promise<void>;
}
