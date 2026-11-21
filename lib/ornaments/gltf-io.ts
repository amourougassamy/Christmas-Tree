import { Logger, WebIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

/** glTF extensions a preview .glb may use (see API_CONTRACT.md, Preview format). */
export const ALLOWED_PREVIEW_EXTENSIONS: readonly string[] = ["EXT_meshopt_compression", "KHR_mesh_quantization"];

let ioPromise: Promise<WebIO> | null = null;

/**
 * A platform-neutral glTF reader/writer with only the allowed extensions registered.
 * WebIO's binary read/write needs no DOM or filesystem, so this works in browsers and Node.
 */
export function previewIO(): Promise<WebIO> {
  ioPromise ??= (async () => {
    await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
    return new WebIO()
      .setLogger(new Logger(Logger.Verbosity.WARN))
      .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
      .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
  })();
  return ioPromise;
}
