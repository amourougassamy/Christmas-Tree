import {
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
} from "three";

const SUPPORTED_MATERIALS = [
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
];

export function isSupportedMaterial(material: Material): boolean {
  return SUPPORTED_MATERIALS.some((MaterialType) => material instanceof MaterialType);
}

export function preserveSupportedMaterials(root: Object3D, fallback: Material): void {
  root.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const safe = materials.map((material) =>
      isSupportedMaterial(material) ? material : fallback.clone(),
    );
    child.material = Array.isArray(child.material) ? safe : safe[0];
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

export function formatOrnamentCallout(message: string, initials: string): string {
  return message ? `${message} — ${initials}` : initials;
}

/**
 * Prepare a loaded `.glb` preview for the tree. Previews are in metres with
 * their origin at the eyelet (see "Preview format" in API_CONTRACT.md), so the
 * only transform is the one shared scene scale: no per-model normalization,
 * no recentring. Ornaments don't cast or receive shadows.
 */
export function prepareOrnamentModel(root: Object3D, unitsPerMetre: number): Object3D {
  root.position.set(0, 0, 0);
  root.scale.setScalar(unitsPerMetre);
  root.traverse((child) => {
    child.castShadow = false;
    child.receiveShadow = false;
  });
  root.updateMatrixWorld(true);
  return root;
}
