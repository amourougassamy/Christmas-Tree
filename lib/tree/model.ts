import {
  Box3,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  Sphere,
  Vector3,
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

export type NormalizedModel = {
  group: Group;
  sourceRadius: number;
  scale: number;
};

export function normalizeVisibleGeometry(
  source: Object3D,
  targetDiameter = 0.72,
): NormalizedModel | null {
  source.updateMatrixWorld(true);
  const box = new Box3();
  let visibleGeometry = false;

  source.traverseVisible((child) => {
    const candidate = child as Object3D & { geometry?: unknown };
    if (candidate.geometry) {
      box.expandByObject(candidate);
      visibleGeometry = true;
    }
  });

  if (!visibleGeometry || box.isEmpty()) return null;

  const sphere = box.getBoundingSphere(new Sphere());
  if (!Number.isFinite(sphere.radius) || sphere.radius <= Number.EPSILON) return null;

  const group = new Group();
  group.add(source);
  source.position.sub(sphere.center);
  const scale = targetDiameter / (sphere.radius * 2);
  source.scale.multiplyScalar(scale);
  source.updateMatrixWorld(true);

  const normalizedBox = new Box3().setFromObject(source);
  const center = normalizedBox.getCenter(new Vector3());
  source.position.x -= center.x;
  source.position.z -= center.z;
  // Put the highest visible point at the branch attachment so the ornament
  // extends downward instead of standing on the branch.
  source.position.y -= normalizedBox.max.y;

  return { group, sourceRadius: sphere.radius, scale };
}

/** Convert Rhino's Z-up model coordinates to Three.js' Y-up scene. */
export function orientRhinoModel(source: Object3D): void {
  source.rotation.x = -Math.PI / 2;
  source.updateMatrixWorld(true);
}
