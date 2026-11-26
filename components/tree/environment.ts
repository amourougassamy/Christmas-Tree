import { Mesh, MeshLambertMaterial, PMREMGenerator, type WebGLRenderer } from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/** Bake once per renderer; no network assets or extra draw calls in the render loop. */
export function createWinterEnvironment(renderer: WebGLRenderer) {
  const room = new RoomEnvironment();
  const generator = new PMREMGenerator(renderer);
  try {
    // Broad softboxes give polished metal readable shapes and glass bright edges.
    // Warm candlelight on one side, cool winter sky on the other.
    room.traverse((object) => {
      if (object instanceof Mesh && object.material instanceof MeshLambertMaterial) {
        object.material.emissive.set(object.position.x < 0 ? "#ffe0bd" : "#cfddff");
      }
    });
    return generator.fromScene(room, 0.04);
  } finally {
    room.dispose();
    generator.dispose();
  }
}
