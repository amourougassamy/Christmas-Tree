import { prepareGlb } from "./prepare-glb.ts";
import type { ModelStore, OrnamentRecord, OrnamentRepository, PublicOrnament, StoredModel } from "./types.ts";
import {
  ApiError,
  readValidatedModel,
  validateInitials,
  validateMessage,
  validateModel,
} from "./validation.ts";

export class OrnamentService {
  private readonly repository: OrnamentRepository;
  private readonly models: ModelStore;
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(
    repository: OrnamentRepository,
    models: ModelStore,
    now: () => Date = () => new Date(),
    newId: () => string = () => crypto.randomUUID(),
  ) {
    this.repository = repository;
    this.models = models;
    this.now = now;
    this.newId = newId;
  }

  async upload(
    initialsValue: unknown,
    messageValue: unknown,
    modelValue: unknown,
  ): Promise<PublicOrnament> {
    const initials = validateInitials(initialsValue);
    const message = validateMessage(messageValue);
    validateModel(modelValue);
    const model = modelValue;
    const modelBytes = await readValidatedModel(model);
    const prepared = await prepareGlb(new Uint8Array(modelBytes));
    const previewBytes = prepared.glb.slice().buffer;

    const id = this.newId();
    const objectKey = `ornaments/${id}.source.glb`;
    const previewKey = `ornaments/${id}.glb`;
    const createdAt = this.now().toISOString();
    const slot = await this.repository.claimNextSlot();
    const record: OrnamentRecord = {
      id,
      initials,
      message,
      slot,
      objectKey,
      originalName: model.name,
      byteSize: model.size,
      previewKey,
      previewByteSize: previewBytes.byteLength,
      createdAt,
      archivedAt: null,
      deletedAt: null,
    };

    try {
      await this.models.put(objectKey, modelBytes, { id, initials, kind: "source" });
      await this.models.put(previewKey, previewBytes, { id, initials, kind: "preview" });
      await this.repository.archiveActiveAndInsert(record);
    } catch (error) {
      await Promise.all([
        this.models.delete(objectKey).catch(() => undefined),
        this.models.delete(previewKey).catch(() => undefined),
      ]);
      throw error;
    }
    return toPublic(record);
  }

  async list(includeArchived = false): Promise<PublicOrnament[]> {
    return (await this.repository.list(includeArchived)).map(toPublic);
  }

  /** The optimized .glb preview. */
  async model(id: string): Promise<{ record: OrnamentRecord; model: StoredModel }> {
    return this.stored(id, (record) => record.previewKey);
  }

  /** The original uploaded file. */
  async source(id: string): Promise<{ record: OrnamentRecord; model: StoredModel }> {
    return this.stored(id, (record) => record.objectKey);
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.repository.deleteAndRestore(id, this.now().toISOString());
    if (!deleted) throw new ApiError(404, "NOT_FOUND", "Ornament not found.");
    await Promise.all([
      this.models.delete(deleted.objectKey).catch(() => undefined),
      this.models.delete(deleted.previewKey).catch(() => undefined),
    ]);
  }

  private async stored(id: string, key: (record: OrnamentRecord) => string) {
    const record = await this.repository.find(id);
    if (!record) throw new ApiError(404, "NOT_FOUND", "Ornament not found.");
    const model = await this.models.get(key(record));
    if (!model) throw new ApiError(404, "MODEL_NOT_FOUND", "Ornament model not found.");
    return { record, model };
  }
}

function toPublic(record: OrnamentRecord): PublicOrnament {
  const base = `/api/ornaments/${encodeURIComponent(record.id)}`;
  return {
    id: record.id,
    initials: record.initials,
    message: record.message,
    slot: record.slot,
    originalName: record.originalName,
    byteSize: record.byteSize,
    previewByteSize: record.previewByteSize,
    createdAt: record.createdAt,
    archivedAt: record.archivedAt,
    modelUrl: `${base}/model`,
    sourceUrl: `${base}/source`,
  };
}
