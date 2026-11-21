import { join } from "node:path";
import { dataDir, getDatabase } from "../../db/index.ts";
import { FileModelStore, SqliteOrnamentRepository } from "./repository.ts";
import { OrnamentService } from "./service.ts";

// Kept on globalThis so `next dev` module reloads reuse one database connection.
const globalState = globalThis as typeof globalThis & { __ornamentService?: OrnamentService };

/** The process-wide ornament service: SQLite metadata plus model files under `${DATA_DIR}/models`. */
export function getOrnamentService(): OrnamentService {
  globalState.__ornamentService ??= new OrnamentService(
    new SqliteOrnamentRepository(getDatabase()),
    new FileModelStore(join(dataDir(), "models")),
  );
  return globalState.__ornamentService;
}
