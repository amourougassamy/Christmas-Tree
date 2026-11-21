import type { Object3D } from "three";
import type { Rhino3dmLoader } from "three/addons/loaders/3DMLoader.js";
import { MAX_MODEL_BYTES } from "../ornaments/types.ts";
import { ConvertError } from "./types.ts";
import type { ConvertResult } from "./types.ts";

export { ConvertError } from "./types.ts";
export type { ConvertReport, ConvertResult, ConvertErrorCode, EyeletSource } from "./types.ts";

/** Served by scripts/prepare-rhino.mjs from node_modules/rhino3dm. */
const RHINO_LIBRARY_PATH = "/rhino3dm/";

let loaderPromise: Promise<Rhino3dmLoader> | null = null;

/** Loaded lazily so the rhino3dm wasm is only fetched when someone uploads. */
function rhinoLoader(): Promise<Rhino3dmLoader> {
  loaderPromise ??= import("three/addons/loaders/3DMLoader.js")
    .then(({ Rhino3dmLoader }) => new Rhino3dmLoader().setLibraryPath(RHINO_LIBRARY_PATH).setWorkerLimit(1))
    .catch((error) => {
      loaderPromise = null;
      throw error;
    });
  return loaderPromise;
}

/** Browser only: converts an uploaded .3dm into a preview .glb that follows API_CONTRACT.md. */
export async function convertRhinoFile(file: File): Promise<ConvertResult> {
  if (file.size > MAX_MODEL_BYTES) throw new ConvertError("TOO_BIG", "That file is larger than 20 MiB.");
  const [loader, { convertObject }, buffer] = await Promise.all([
    rhinoLoader(),
    import("./pipeline.ts"),
    file.arrayBuffer(),
  ]);

  let object: Object3D;
  try {
    object = await new Promise<Object3D>((resolve, reject) => loader.parse(buffer, resolve, reject));
  } catch (error) {
    console.error(error);
    throw new ConvertError("PARSE_FAILED", "This .3dm file could not be read. Save it again from Rhino 7 or 8 and retry.");
  }
  return convertObject(object);
}
