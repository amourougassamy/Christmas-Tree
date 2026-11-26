import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { disposeObject } from "@/components/tree/tree-scene";
import {
  closeupBeginDrag,
  closeupCameraDistance,
  closeupDragBy,
  closeupEndDrag,
  createCloseupRotation,
  stepCloseupRotation,
  turntableYaw,
} from "@/lib/tree/closeup";
import { SCENE_UNITS_PER_METRE } from "@/lib/tree/geometry";
import { prepareOrnamentModel } from "@/lib/tree/model";

export type CloseupStageState = "loading" | "ready" | "failed";

export function createCloseupStage(options: {
  mount: HTMLElement;
  modelUrl: string;
  reducedMotion: boolean;
  /** Showcase mode: turn exactly once over this many seconds and ignore dragging. */
  turnSeconds?: number;
  onStateChange?: (state: CloseupStageState) => void;
}): { dispose(): void } {
  const { mount, modelUrl, reducedMotion, turnSeconds, onStateChange } = options;
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.01, 200);
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.touchAction = "none";
  mount.appendChild(renderer.domElement);

  scene.add(new AmbientLight("#b2b6d4", 0.5));
  scene.add(new HemisphereLight("#b9bddd", "#636b83", 0.75));
  const key = new DirectionalLight("#efb58b", 1.65);
  key.position.set(2.25, 1.25, -0.75);
  scene.add(key);
  const fill = new DirectionalLight("#a0b6df", 0.65);
  fill.position.set(-2, 0.75, -0.5);
  scene.add(fill);

  const yawGroup = new Group();
  const pitchGroup = new Group();
  yawGroup.add(pitchGroup);
  scene.add(yawGroup);
  const rotation = createCloseupRotation();
  yawGroup.rotation.y = rotation.yaw;
  pitchGroup.rotation.x = rotation.pitch;

  let model: Object3D | null = null;
  let radius = 1;
  let dirty = true;
  let disposed = false;
  let frame = 0;
  let previousFrame = performance.now();
  /** When the turntable started (model ready); null until then. */
  let turnStartedAt: number | null = null;
  let pointer: { id: number; x: number; y: number; movedAt: number } | null = null;

  const fitCamera = () => {
    const width = Math.max(1, mount.clientWidth);
    const height = Math.max(1, mount.clientHeight);
    camera.aspect = width / height;
    camera.position.set(0, 0, closeupCameraDistance(radius, camera.fov * Math.PI / 180, camera.aspect));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    dirty = true;
  };
  const resizeObserver = new ResizeObserver(fitCamera);
  resizeObserver.observe(mount);
  fitCamera();

  const animate = (now: number) => {
    if (disposed) return;
    const dt = Math.min((now - previousFrame) / 1000, 0.1);
    previousFrame = now;
    if (turnSeconds) {
      if (turnStartedAt !== null) {
        yawGroup.rotation.y = turntableYaw(rotation.yaw, (now - turnStartedAt) / 1000, turnSeconds);
        dirty = true;
      }
    } else if (stepCloseupRotation(rotation, dt, !reducedMotion)) {
      yawGroup.rotation.y = rotation.yaw;
      pitchGroup.rotation.x = rotation.pitch;
      dirty = true;
    }
    if (dirty) {
      renderer.render(scene, camera);
      dirty = false;
    }
    frame = requestAnimationFrame(animate);
  };
  frame = requestAnimationFrame(animate);

  const onPointerDown = (event: PointerEvent) => {
    if (turnSeconds) return;
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    renderer.domElement.setPointerCapture(event.pointerId);
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, movedAt: performance.now() };
    closeupBeginDrag(rotation);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const now = performance.now();
    closeupDragBy(rotation, event.clientX - pointer.x, event.clientY - pointer.y, (now - pointer.movedAt) / 1000);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.movedAt = now;
    yawGroup.rotation.y = rotation.yaw;
    pitchGroup.rotation.x = rotation.pitch;
    dirty = true;
  };
  const onPointerEnd = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    closeupEndDrag(rotation, performance.now() - pointer.movedAt);
    pointer = null;
  };
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerEnd);
  renderer.domElement.addEventListener("pointercancel", onPointerEnd);

  onStateChange?.("loading");
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  void (async () => {
    try {
      const response = await fetch(modelUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      const gltf = await loader.parseAsync(buffer, "");
      const loaded = gltf.scene;
      if (disposed) {
        disposeObject(loaded);
        return;
      }
      prepareOrnamentModel(loaded, SCENE_UNITS_PER_METRE);
      const bounds = new Box3().setFromObject(loaded);
      const center = bounds.getCenter(new Vector3());
      const size = bounds.getSize(new Vector3());
      loaded.position.sub(center);
      loaded.updateMatrixWorld(true);
      radius = Math.max(size.x, size.y, size.z) / 2 || 1;
      model = loaded;
      pitchGroup.add(loaded);
      fitCamera();
      turnStartedAt = performance.now();
      onStateChange?.("ready");
    } catch (error) {
      if (disposed) return;
      console.warn("Ornament close-up preview failed to load", error);
      onStateChange?.("failed");
      dirty = true;
    }
  })();

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerEnd);
      renderer.domElement.removeEventListener("pointercancel", onPointerEnd);
      if (model) disposeObject(model);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
