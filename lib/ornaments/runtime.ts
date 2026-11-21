import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { dataDir, getDatabase } from "../../db/index.ts";
import { FileModelStore, SqliteOrnamentRepository } from "./repository.ts";
import { OrnamentService } from "./service.ts";

// Kept on globalThis so `next dev` module reloads reuse one database connection.
const globalState = globalThis as typeof globalThis & { __ornamentService?: OrnamentService };

/** The process-wide ornament service: SQLite metadata plus model files under `${DATA_DIR}/models`. */
export function getOrnamentService(): OrnamentService {
  if (!globalState.__ornamentService) {
    const modelsDir = join(dataDir(), "models");
    mkdirSync(modelsDir, { recursive: true });
    globalState.__ornamentService = new OrnamentService(
      new SqliteOrnamentRepository(getDatabase()),
      new FileModelStore(modelsDir),
    );
  }
  return globalState.__ornamentService;
}
