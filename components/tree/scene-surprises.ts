import { BoxGeometry, CylinderGeometry, Mesh, MeshStandardMaterial, InstancedMesh, Matrix4, type Group, type Object3D } from "three";
import { gustEnvelope, snowAmount, waveAngle } from "@/lib/tree/surprises";

const boxCap = new BoxGeometry(1, 1, 1);
const roundCap = new CylinderGeometry(0.5, 0.5, 1, 24);
const snowMaterial = new MeshStandardMaterial({ color: "#f5f9ff", roughness: 1 });
/** A thin cap follows each parcel's existing transform; the bow stays exposed. */
export function addGiftSnow(group: Group, width: number, height: number, depth: number, round: boolean) {
  const cap = new Mesh(round ? roundCap : boxCap, snowMaterial);
  cap.name = "daily-snow";
  cap.scale.set(width + 0.04, 0.001, (round ? width : depth) + 0.04);
  cap.position.y = height / 2 + 0.045;
  cap.receiveShadow = true;
  group.add(cap);
}
export function createSceneSurprises(tree: Group, arm: Object3D | undefined, reducedMotion: boolean) {
  const fast = new URLSearchParams(window.location.search).get("surprises") === "fast";
  const caps: Mesh[] = [];
  tree.traverse((object) => { if (object instanceof Mesh && object.name === "daily-snow") caps.push(object); });
  // All parcel caps share two draw calls, regardless of the number of gifts.
  const batches = [boxCap, roundCap].map((geometry) => {
    const entries = caps.filter((cap) => cap.geometry === geometry).map((cap) => {
      const parent = cap.parent!;
      parent.updateMatrix();
      parent.remove(cap);
      return { cap, parent };
    });
    const mesh = new InstancedMesh(geometry, snowMaterial, entries.length);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    tree.add(mesh);
    return { mesh, entries };
  });
  const matrix = new Matrix4();
  let nextSnowUpdate = 0;
  const result = { gust: 0, changed: false };
  return (now: number) => {
    let changed = false;
    if (now >= nextSnowUpdate) {
      const amount = snowAmount(new Date(now));
      for (const { mesh, entries } of batches) {
        mesh.visible = amount > 0;
        for (let i = 0; i < entries.length; i++) {
          const { cap, parent } = entries[i];
          cap.scale.y = Math.max(0.001, amount * 0.045);
          cap.updateMatrix();
          mesh.setMatrixAt(i, matrix.multiplyMatrices(parent.matrix, cap.matrix));
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
      nextSnowUpdate = now + 60000;
      changed = true;
    }
    if (arm) arm.rotation.z = -1.1 + (reducedMotion ? 0 : waveAngle(now, fast));
    result.gust = reducedMotion ? 0 : gustEnvelope(now, fast);
    result.changed = changed;
    return result;
  };
}
