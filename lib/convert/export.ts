import { Document, Logger } from "@gltf-transform/core";
import { dedup, meshopt, prune } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import { previewIO } from "../ornaments/gltf-io.ts";
import type { FinalGroup } from "./geometry.ts";
import type { EyeletSource } from "./types.ts";

export interface PreviewExtras {
  eyelet: EyeletSource;
  sizeInches: [number, number, number];
}

/**
 * Writes groups as one glTF mesh with one primitive per material (base colour factors only,
 * no textures), then dedups, prunes, quantizes, and meshopt-compresses it into a .glb.
 */
export async function exportPreviewGlb(groups: readonly FinalGroup[], extras: PreviewExtras): Promise<Uint8Array> {
  const document = new Document().setLogger(new Logger(Logger.Verbosity.WARN));
  const root = document.getRoot();
  root.getAsset().generator = "christmas-tree ornament converter";
  root.getAsset().extras = { eyelet: extras.eyelet, sizeInches: extras.sizeInches };
  const buffer = document.createBuffer();
  const mesh = document.createMesh("ornament");

  groups.forEach((group, index) => {
    const vertexCount = group.positions.length / 3;
    const position = document.createAccessor().setType("VEC3").setArray(new Float32Array(group.positions)).setBuffer(buffer);
    const normal = document.createAccessor().setType("VEC3").setArray(new Float32Array(group.normals)).setBuffer(buffer);
    const indices = document
      .createAccessor()
      .setType("SCALAR")
      .setArray(vertexCount <= 0xffff ? Uint16Array.from(group.indices) : Uint32Array.from(group.indices))
      .setBuffer(buffer);
    const material = document
      .createMaterial(`colour-${index + 1}`)
      .setBaseColorFactor([...srgbToLinear(group.color), group.alpha])
      .setMetallicFactor(group.metalness)
      .setRoughnessFactor(group.roughness)
      .setDoubleSided(true)
      .setAlphaMode(group.alpha < 1 ? "BLEND" : "OPAQUE");
    mesh.addPrimitive(
      document
        .createPrimitive()
        .setAttribute("POSITION", position)
        .setAttribute("NORMAL", normal)
        .setIndices(indices)
        .setMaterial(material),
    );
  });

  const node = document.createNode("ornament").setMesh(mesh);
  document.createScene("ornament").addChild(node);
  root.setDefaultScene(root.listScenes()[0]);

  await MeshoptEncoder.ready;
  await document.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  const io = await previewIO();
  return io.writeBinary(document);
}

/** Rhino colours are sRGB; glTF base colour factors are linear. */
function srgbToLinear(color: readonly [number, number, number]): [number, number, number] {
  return color.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
}
