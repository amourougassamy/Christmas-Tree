import { previewIO } from "./gltf-io.ts";
import { validatePreview, type PreviewStats } from "./preview-validation.ts";

export interface PreparedGlb {
  glb: Uint8Array;
  report: PreviewStats;
}

/** Validate and hang a direct GLB from its top centre, preserving real-world scale. */
export async function prepareGlb(bytes: Uint8Array): Promise<PreparedGlb> {
  const stats = await validatePreview(bytes);
  const io = await previewIO();
  const document = await io.readBinary(bytes);
  const [min, max] = stats.boundsMetres;
  const offset: [number, number, number] = [-(min[0] + max[0]) / 2, -max[1], -(min[2] + max[2]) / 2];
  for (const scene of document.getRoot().listScenes()) {
    const children = scene.listChildren();
    const hanger = document.createNode("ornament-hanging-origin").setTranslation(offset);
    for (const child of children) {
      scene.removeChild(child);
      hanger.addChild(child);
    }
    scene.addChild(hanger);
  }
  const glb = await io.writeBinary(document);
  return { glb, report: await validatePreview(glb) };
}
