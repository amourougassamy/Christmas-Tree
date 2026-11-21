import {
  Box3,
  BufferGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  Mesh,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Material, Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer";

/**
 * Renders a preview .glb into `canvas`, slowly turning around its hanging point, with a short
 * thread above the origin so the eyelet position is visible. Returns a cleanup function.
 */
export async function mountGlbPreview(canvas: HTMLCanvasElement, glb: Uint8Array): Promise<() => void> {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const buffer = glb.slice().buffer;
  const gltf = await loader.parseAsync(buffer, "");

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new Scene();
  scene.add(new HemisphereLight(0xffffff, 0x4a5a52, 2.2));
  const key = new DirectionalLight(0xffffff, 2.4);
  key.position.set(1, 2, 1.5);
  scene.add(key);

  const ornament = gltf.scene;
  scene.add(ornament);

  const bounds = new Box3().setFromObject(ornament);
  const size = bounds.getSize(new Vector3());
  const radius = Math.max(size.x, size.y, size.z, 0.005);
  const thread = new Line(
    new BufferGeometry().setFromPoints([new Vector3(0, 0, 0), new Vector3(0, radius * 0.35, 0)]),
    new LineBasicMaterial({ color: new Color(0xb08d2e) }),
  );
  scene.add(thread);

  const centre = bounds.getCenter(new Vector3());
  centre.y = (bounds.min.y + radius * 0.35) / 2;
  const camera = new PerspectiveCamera(35, 1, radius / 100, radius * 100);
  camera.position.set(centre.x, centre.y + radius * 0.25, centre.z + radius * 2.6);
  camera.lookAt(centre);

  let frame = 0;
  let disposed = false;
  const render = (time: number) => {
    if (disposed) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.floor(width * renderer.getPixelRatio()) || canvas.height !== Math.floor(height * renderer.getPixelRatio())) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    }
    ornament.rotation.y = time * 0.0004;
    renderer.render(scene, camera);
    frame = requestAnimationFrame(render);
  };
  frame = requestAnimationFrame(render);

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    scene.traverse((object: Object3D) => {
      if (object instanceof Mesh || object instanceof Line) {
        object.geometry.dispose();
        const materials: Material[] = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    renderer.dispose();
  };
}
