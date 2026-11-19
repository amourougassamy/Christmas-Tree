import { env } from "cloudflare:workers";
import { D1OrnamentRepository, R2ModelStore } from "./repository";
import { OrnamentService } from "./service";

export function getOrnamentService(): OrnamentService {
  if (!env.DB || !env.BUCKET) {
    throw new Error("Required DB and BUCKET bindings are unavailable.");
  }
  return new OrnamentService(new D1OrnamentRepository(env.DB), new R2ModelStore(env.BUCKET));
}
