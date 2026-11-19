export const SLOT_COUNT = 60;
export const MAX_MODEL_BYTES = 10 * 1024 * 1024;

export interface OrnamentRecord {
  id: string;
  initials: string;
  slot: number;
  objectKey: string;
  originalName: string;
  byteSize: number;
  createdAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
}

export type PublicOrnament = Omit<OrnamentRecord, "objectKey" | "deletedAt"> & {
  modelUrl: string;
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
