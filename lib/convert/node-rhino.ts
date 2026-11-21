/**
 * Node-only helper for tests and scripts. Rhino3dmLoader needs Web Workers and fetch, so it
 * cannot run under Node; this reads a .3dm with rhino3dm directly and builds the same
 * object shape the loader returns (userData.layers/settings, Mesh/Points children with
 * userData.attributes.layerIndex and drawColor, loader-style materials).
 * Never import this from browser code.
 */
import rhino3dm from "rhino3dm";
import { BufferGeometryLoader, Color, DoubleSide, Float32BufferAttribute, BufferGeometry, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, Points, PointsMaterial } from "three";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rhino = any;

let rhinoPromise: Promise<Rhino> | null = null;

export function loadRhino(): Promise<Rhino> {
  rhinoPromise ??= (rhino3dm as unknown as () => Promise<Rhino>)();
  return rhinoPromise;
}

export async function readRhinoAsLoaderObject(bytes: Uint8Array): Promise<Object3D> {
  const rhino = await loadRhino();
  const doc = rhino.File3dm.fromByteArray(bytes);
  if (!doc) throw new Error("rhino3dm could not read the file");
  const root = new Object3D();

  const layers: { name: string; fullPath: string; visible: boolean; renderMaterialIndex: number }[] = [];
  for (let i = 0; i < doc.layers().count; i += 1) {
    const layer = doc.layers().get(i);
    layers.push({ name: layer.name, fullPath: layer.fullPath, visible: layer.visible, renderMaterialIndex: layer.renderMaterialIndex });
  }
  const unit = doc.settings().modelUnitSystem;
  root.userData.layers = layers;
  root.userData.settings = { modelUnitSystem: { name: unit.constructor.name, value: unit.value } };
  root.userData.objectType = "File3dm";

  const geometryLoader = new BufferGeometryLoader();
  for (let i = 0; i < doc.objects().count; i += 1) {
    const object = doc.objects().get(i);
    const geometry = object.geometry();
    const attrs = object.attributes();
    const drawColor = attrs.drawColor(doc);
    const attributes = { layerIndex: attrs.layerIndex, drawColor, name: attrs.name };
    const type = geometry.objectType.constructor.name.substring("ObjectType_".length);

    if (type === "Point") {
      const [x, y, z] = geometry.location;
      const points = new Points(
        new BufferGeometry().setAttribute("position", new Float32BufferAttribute([x, y, z], 3)),
        new PointsMaterial({ size: 2, sizeAttenuation: false }),
      );
      points.userData.attributes = attributes;
      points.userData.objectType = type;
      root.add(points);
    } else if (type === "Mesh") {
      const threeGeometry = geometryLoader.parse(geometry.toThreejsJSON());
      let materialIndex = -1;
      const source = attrs.materialSource.constructor.name;
      if (source === "ObjectMaterialSource_MaterialFromObject") materialIndex = attrs.materialIndex;
      if (source === "ObjectMaterialSource_MaterialFromLayer" && attrs.layerIndex >= 0) materialIndex = layers[attrs.layerIndex].renderMaterialIndex;
      const rhinoMaterial = materialIndex >= 0 ? doc.materials().get(materialIndex) : null;
      const material = rhinoMaterial
        ? new MeshPhysicalMaterial({
            color: new Color(rhinoMaterial.diffuseColor.r / 255, rhinoMaterial.diffuseColor.g / 255, rhinoMaterial.diffuseColor.b / 255),
            name: rhinoMaterial.name,
            opacity: 1 - rhinoMaterial.transparency,
            transparent: rhinoMaterial.transparency > 0,
            side: DoubleSide,
          })
        : new MeshStandardMaterial({ color: new Color(1, 1, 1), metalness: 0.8, name: "__DEFAULT", side: DoubleSide });
      const mesh = new Mesh(threeGeometry, material);
      mesh.userData.attributes = attributes;
      mesh.userData.objectType = type;
      mesh.visible = attrs.layerIndex >= 0 && layers[attrs.layerIndex] ? layers[attrs.layerIndex].visible : true;
      root.add(mesh);
    }
  }
  return root;
}
