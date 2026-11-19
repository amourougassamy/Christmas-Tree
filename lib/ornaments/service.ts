import type { ModelStore, OrnamentRecord, OrnamentRepository, PublicOrnament, StoredModel } from "./types.ts";
import { ApiError, readValidatedModel, validateInitials, validateMessage, validateModel } from "./validation.ts";

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

  async upload(initialsValue: unknown, messageValue: unknown, modelValue: unknown): Promise<PublicOrnament> {
    const initials = validateInitials(initialsValue);
    const message = validateMessage(messageValue);
    validateModel(modelValue);
    const model = modelValue;
    const modelBytes = await readValidatedModel(model);
    const id = this.newId();
    const objectKey = `ornaments/${id}.3dm`;
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
      createdAt,
      archivedAt: null,
      deletedAt: null,
    };

    await this.models.put(objectKey, modelBytes, { id, initials });
    try {
      await this.repository.archiveActiveAndInsert(record);
    } catch (error) {
      await this.models.delete(objectKey).catch(() => undefined);
      throw error;
    }
    return toPublic(record);
  }

  async list(includeArchived = false): Promise<PublicOrnament[]> {
    return (await this.repository.list(includeArchived)).map(toPublic);
  }

  async model(id: string): Promise<{ record: OrnamentRecord; model: StoredModel }> {
    const record = await this.repository.find(id);
    if (!record) throw new ApiError(404, "NOT_FOUND", "Ornament not found.");
    const model = await this.models.get(record.objectKey);
    if (!model) throw new ApiError(404, "MODEL_NOT_FOUND", "Ornament model not found.");
    return { record, model };
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.repository.deleteAndRestore(id, this.now().toISOString());
    if (!deleted) throw new ApiError(404, "NOT_FOUND", "Ornament not found.");
    await this.models.delete(deleted.objectKey).catch(() => undefined);
  }
}

function toPublic(record: OrnamentRecord): PublicOrnament {
  return {
    id: record.id,
    initials: record.initials,
    message: record.message,
    slot: record.slot,
    originalName: record.originalName,
    byteSize: record.byteSize,
    createdAt: record.createdAt,
    archivedAt: record.archivedAt,
    modelUrl: `/api/ornaments/${encodeURIComponent(record.id)}/model`,
  };
}