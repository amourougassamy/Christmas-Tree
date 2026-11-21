import {
  AmbientLight,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { TREE_ANCHORS, type TreeAnchor } from "@/lib/tree/anchors";
import { fitDistance, sweepRings } from "@/lib/tree/framing";
import {
  coneRadiusAt,
  CONE_SEGMENTS,
  GROUND_Y,
  SCENE_UNITS_PER_METRE,
  STANDARD_ORNAMENT_SPAN,
  STAR_Y,
  TREE_TIERS,
  TRUNK,
} from "@/lib/tree/geometry";
import { createLoadQueue } from "@/lib/tree/load-queue";
import { prepareOrnamentModel } from "@/lib/tree/model";
import { beginDrag, createSpinState, dragBy, endDrag, nudge, stepSpin } from "@/lib/tree/spin";

export type SceneOrnament = { id: string; slot: number; modelUrl: string };

export type TreeSceneStats = {
  calls: number;
  triangles: number;
  loaded: number;
  failed: number;
  pending: number;
};

export type TreeScene = {
  sync(ornaments: readonly SceneOrnament[]): void;
  pointerDown(x: number): void;
  pointerMove(x: number): void;
  pointerUp(): void;
  nudge(direction: -1 | 1): void;
  stats(): TreeSceneStats;
  dispose(): void;
};

type SlotEntry = {
  ornament: SceneOrnament;
  anchor: TreeAnchor;
  group: Group;
  model: Object3D | null;
  state: "pending" | "loaded" | "failed";
};

const PLACEHOLDER_PALETTE = ["#c5533d", "#ddb55e", "#d9e1d7", "#8ea99a", "#c99173"];
const PLACEHOLDER_RADIUS = 0.26;
const STRING_RADIUS = 0.007;
const LOAD_CONCURRENCY = 3;
const FOV = 30;
const ELEVATION = (5 * Math.PI) / 180;

const zeroMatrix = new Matrix4().makeScale(0, 0, 0);

function disposeObject(root: Object3D) {
  root.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material: Material) => material.dispose());
  });
}

function addFoliage(tree: Group, occluders: Object3D[]) {
  const trunk = new Mesh(
    new CylinderGeometry(TRUNK.radiusTop, TRUNK.radiusBottom, TRUNK.height, 12),
    new MeshStandardMaterial({ color: "#563a2a", roughness: 0.92 }),
  );
  trunk.position.y = TRUNK.bottomY + TRUNK.height / 2;
  trunk.castShadow = trunk.receiveShadow = true;
  tree.add(trunk);
  occluders.push(trunk);

  const greens = ["#173f32", "#1d513e", "#245f46", "#2d6b4e"];
  TREE_TIERS.forEach((tier, layer) => {
    const cone = new Mesh(
      new ConeGeometry(tier.radius, tier.height, CONE_SEGMENTS),
      new MeshStandardMaterial({ color: greens[layer % greens.length], roughness: 0.88, metalness: 0.02 }),
    );
    cone.position.y = tier.baseY + tier.height / 2;
    cone.rotation.y = tier.rotationY;
    cone.castShadow = cone.receiveShadow = true;
    tree.add(cone);
    occluders.push(cone);
  });

  const star = new Mesh(
    new IcosahedronGeometry(0.36, 0),
    new MeshPhysicalMaterial({
      color: "#f6cd67",
      emissive: "#e8a72e",
      emissiveIntensity: 1.15,
      metalness: 0.62,
      roughness: 0.28,
    }),
  );
  star.position.y = STAR_Y + 0.36;
  star.scale.set(0.72, 1.42, 0.34);
  tree.add(star);

  // Fairy lights: one instanced, unlit draw call sprinkled over the cone surfaces.
  const bulbColours = ["#ffd27a", "#fff3d6", "#ff8a6a"].map((value) => new Color(value));
  const perTier = TREE_TIERS.map((tier) => Math.round(tier.radius * 4));
  const total = perTier.reduce((sum, count) => sum + count, 0);
  const bulbs = new InstancedMesh(new SphereGeometry(0.07, 8, 6), new MeshBasicMaterial({ color: "#ffffff" }), total);
  const matrix = new Matrix4();
  let index = 0;
  TREE_TIERS.forEach((tier, layer) => {
    for (let i = 0; i < perTier[layer]; i += 1) {
      const seed = index * 12.9898;
      const t = 0.18 + (((Math.sin(seed) * 43758.5453) % 1) + 1) % 1 * 0.62;
      const y = tier.baseY + tier.height * t;
      const angle = i * 2.399 + layer * 0.7;
      const radius = coneRadiusAt(tier, y) * Math.cos(Math.PI / CONE_SEGMENTS) + 0.04;
      matrix.makeTranslation(Math.sin(angle) * radius, y, Math.cos(angle) * radius);
      bulbs.setMatrixAt(index, matrix);
      bulbs.setColorAt(index, bulbColours[index % bulbColours.length]);
      index += 1;
    }
  });
  tree.add(bulbs);
}

/** Wrapped gifts sit on the ground just outside the lowest ornaments. */
const GIFTS = [
  { angle: 0.35, radius: 4.95, size: [1.05, 0.72, 0.82], color: "#b94736", ribbon: "#f1cf72", turn: -0.12 },
  { angle: -0.5, radius: 4.85, size: [0.92, 0.5, 0.72], color: "#e6d7ad", ribbon: "#2f7055", turn: 0.16 },
  { angle: 2.3, radius: 4.9, size: [0.76, 0.68, 0.68], color: "#2f7055", ribbon: "#e8c766", turn: -0.08 },
  { angle: 3.6, radius: 4.95, size: [1.1, 0.42, 0.7], color: "#c98b72", ribbon: "#fff0c4", turn: 0.24 },
] as const;
const GIFT_REACH = Math.max(...GIFTS.map((gift) => gift.radius + Math.hypot(gift.size[0], gift.size[2]) / 2));

function addGifts(tree: Group) {
  for (const gift of GIFTS) {
    const group = new Group();
    const [width, height, depth] = gift.size;
    group.position.set(Math.sin(gift.angle) * gift.radius, GROUND_Y + height / 2, Math.cos(gift.angle) * gift.radius);
    group.rotation.y = gift.angle + gift.turn;
    const wrapping = new MeshStandardMaterial({ color: gift.color, roughness: 0.72 });
    const ribbon = new MeshStandardMaterial({ color: gift.ribbon, roughness: 0.48, metalness: 0.08 });
    const box = new Mesh(new BoxGeometry(width, height, depth), wrapping);
    const verticalRibbon = new Mesh(new BoxGeometry(width * 0.16, height + 0.018, depth + 0.025), ribbon);
    const crossRibbon = new Mesh(new BoxGeometry(width + 0.025, height + 0.02, depth * 0.16), ribbon);
    box.castShadow = verticalRibbon.castShadow = crossRibbon.castShadow = true;
    box.receiveShadow = true;
    group.add(box, verticalRibbon, crossRibbon);
    tree.add(group);
  }
}

/** Silhouette used for framing: every rim with its hanging ornaments, gifts and the star. */
function framingPoints() {
  const hang = STANDARD_ORNAMENT_SPAN + 0.12;
  const rings: [number, number][] = [];
  for (const tier of TREE_TIERS) {
    rings.push([tier.radius + 0.45, tier.baseY], [tier.radius + 0.45, tier.baseY - hang]);
  }
  rings.push([GIFT_REACH, GROUND_Y], [GIFT_REACH, GROUND_Y + 0.75], [0.3, STAR_Y + 0.9]);
  return sweepRings(rings);
}

export function createTreeScene(options: {
  mount: HTMLElement;
  getButton: (id: string) => HTMLElement | undefined;
  reducedMotion: boolean;
}): TreeScene {
  const { mount, getButton, reducedMotion } = options;
  const scene = new Scene();

  const camera = new PerspectiveCamera(FOV, 1, 1, 200);
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.style.display = "block";
  mount.appendChild(renderer.domElement);

  // Lights live in the scene, not the spinning tree, and the camera never
  // moves, so shading stays put while the tree turns.
  scene.add(new AmbientLight("#ffeac7", 0.9));
  scene.add(new HemisphereLight("#fff3dc", "#1b3b2e", 1.1));
  const key = new DirectionalLight("#fff0cf", 3.1);
  key.position.set(6, 12, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 9;
  key.shadow.camera.bottom = -8;
  key.shadow.camera.near = 4;
  key.shadow.camera.far = 32;
  key.shadow.bias = -0.0008;
  scene.add(key);
  const fill = new DirectionalLight("#6ca68d", 1.4);
  fill.position.set(-8, 3, -2);
  scene.add(fill);

  const tree = new Group();
  scene.add(tree);
  const occluders: Object3D[] = [];
  addFoliage(tree, occluders);
  addGifts(tree);

  // Placeholders and hooks are instanced per slot: two draw calls for all 60.
  const placeholderGeometry = new SphereGeometry(PLACEHOLDER_RADIUS, 20, 14);
  const placeholderMaterial = new MeshPhysicalMaterial({ color: "#ffffff", clearcoat: 0.65, roughness: 0.3, metalness: 0.08 });
  const placeholders = new InstancedMesh(placeholderGeometry, placeholderMaterial, TREE_ANCHORS.length);
  const hookGeometry = new CylinderGeometry(STRING_RADIUS, STRING_RADIUS, 1, 5, 1, true);
  const hookMaterial = new MeshStandardMaterial({ color: "#d8c08a", metalness: 0.6, roughness: 0.4 });
  const hooks = new InstancedMesh(hookGeometry, hookMaterial, TREE_ANCHORS.length);
  const placeholderColour = new Color();
  for (let i = 0; i < TREE_ANCHORS.length; i += 1) {
    placeholders.setMatrixAt(i, zeroMatrix);
    hooks.setMatrixAt(i, zeroMatrix);
    placeholders.setColorAt(i, placeholderColour.set(PLACEHOLDER_PALETTE[i % PLACEHOLDER_PALETTE.length]));
  }
  // Instances move around the whole tree; skip per-object culling.
  placeholders.frustumCulled = hooks.frustumCulled = false;
  tree.add(placeholders, hooks);

  const scratch = new Matrix4();
  const scratchQuat = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const hookMatrix = (anchor: TreeAnchor) => {
    const tip = new Vector3(...anchor.tip);
    const eyelet = new Vector3(...anchor.position);
    const direction = tip.clone().sub(eyelet);
    const length = direction.length();
    scratchQuat.setFromUnitVectors(up, direction.normalize());
    return scratch.compose(tip.add(eyelet).multiplyScalar(0.5), scratchQuat, new Vector3(1, length, 1));
  };
  const setPlaceholder = (anchor: TreeAnchor, visible: boolean) => {
    const index = anchor.slot - 1;
    placeholders.setMatrixAt(
      index,
      visible
        ? scratch.makeTranslation(anchor.position[0], anchor.position[1] - PLACEHOLDER_RADIUS - 0.02, anchor.position[2])
        : zeroMatrix,
    );
    placeholders.instanceMatrix.needsUpdate = true;
  };
  const setHook = (anchor: TreeAnchor, visible: boolean) => {
    hooks.setMatrixAt(anchor.slot - 1, visible ? hookMatrix(anchor) : zeroMatrix);
    hooks.instanceMatrix.needsUpdate = true;
  };

  const spin = createSpinState(-0.35);
  tree.rotation.y = spin.angle;
  let dirty = true;

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const slots = new Map<number, SlotEntry>();
  let failed = 0;

  const queue = createLoadQueue<SlotEntry>({
    concurrency: LOAD_CONCURRENCY,
    // Front-facing first: the camera looks down -Z, so +Z after rotation faces it.
    priority: (entry) => Math.cos(entry.anchor.rotationY + spin.angle) + entry.anchor.position[1] * 0.01,
    load: async (entry, signal) => {
      try {
        const response = await fetch(entry.ornament.modelUrl, { signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        if (signal.aborted) return;
        const gltf = await loader.parseAsync(buffer, "");
        const model = gltf.scene;
        if (signal.aborted || slots.get(entry.anchor.slot) !== entry) {
          disposeObject(model);
          return;
        }
        prepareOrnamentModel(model, SCENE_UNITS_PER_METRE);
        entry.model = model;
        entry.state = "loaded";
        entry.group.add(model);
        setPlaceholder(entry.anchor, false);
        dirty = true;
      } catch (error) {
        if (signal.aborted) return;
        // Keep the placeholder bauble when a preview can't be fetched or decoded.
        entry.state = "failed";
        failed += 1;
        console.warn(`Ornament ${entry.ornament.id} preview failed to load`, error);
      }
    },
  });

  const removeSlot = (slot: number) => {
    const entry = slots.get(slot);
    if (!entry) return;
    queue.cancel(entry.ornament.id);
    slots.delete(slot);
    tree.remove(entry.group);
    if (entry.model) disposeObject(entry.model);
    if (entry.state === "failed") failed -= 1;
    setPlaceholder(entry.anchor, false);
    setHook(entry.anchor, false);
    dirty = true;
  };

  const sync = (ornaments: readonly SceneOrnament[]) => {
    const wanted = new Map<number, SceneOrnament>();
    for (const ornament of ornaments) {
      if (TREE_ANCHORS[ornament.slot - 1]) wanted.set(ornament.slot, ornament);
    }
    for (const [slot, entry] of slots) {
      const next = wanted.get(slot);
      if (!next || next.id !== entry.ornament.id || next.modelUrl !== entry.ornament.modelUrl) removeSlot(slot);
    }
    for (const [slot, ornament] of wanted) {
      if (slots.has(slot)) continue;
      const anchor = TREE_ANCHORS[slot - 1];
      const group = new Group();
      group.position.set(...anchor.position);
      group.rotation.y = anchor.rotationY;
      tree.add(group);
      const entry: SlotEntry = { ornament, anchor, group, model: null, state: "pending" };
      slots.set(slot, entry);
      setPlaceholder(anchor, true);
      setHook(anchor, true);
      queue.add(ornament.id, entry);
    }
    dirty = true;
  };

  const resize = () => {
    const width = Math.max(mount.clientWidth, 1);
    const height = Math.max(mount.clientHeight, 1);
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    camera.aspect = width / height;
    const portrait = camera.aspect < 1;
    const points = framingPoints();
    const ys = points.map((point) => point[1]);
    // Centre a little low so the header always has room above the star.
    const targetY = (Math.min(...ys) + Math.max(...ys)) / 2 + (portrait ? 0.3 : 0.15);
    const distance = fitDistance(points, {
      fovY: (FOV * Math.PI) / 180,
      aspect: camera.aspect,
      targetY,
      elevation: ELEVATION,
      maxHeightFraction: portrait ? 0.7 : 0.78,
      maxWidthFraction: portrait ? 0.86 : 0.8,
    });
    camera.position.set(0, targetY + Math.sin(ELEVATION) * distance, Math.cos(ELEVATION) * distance);
    camera.lookAt(0, targetY, 0);
    camera.near = Math.max(0.5, distance - 12);
    camera.far = distance + 12;
    camera.updateProjectionMatrix();
    dirty = true;
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(mount);
  resize();

  // Callouts follow ornaments every rendered frame and hide behind the tree.
  const raycaster = new Raycaster();
  const world = new Vector3();
  const toOrnament = new Vector3();
  const updateCallouts = () => {
    const width = mount.clientWidth;
    const height = mount.clientHeight;
    for (const entry of slots.values()) {
      const button = getButton(entry.ornament.id);
      if (!button) continue;
      world.set(0, -STANDARD_ORNAMENT_SPAN * 0.4, 0);
      entry.group.localToWorld(world);
      toOrnament.copy(world).sub(camera.position);
      const distance = toOrnament.length();
      raycaster.set(camera.position, toOrnament.normalize());
      raycaster.far = distance;
      const hit = raycaster.intersectObjects(occluders, false)[0];
      const hidden = hit !== undefined && hit.distance < distance - 0.3;
      world.project(camera);
      const visible = !hidden && world.z > -1 && world.z < 1;
      button.style.opacity = visible ? "1" : "0";
      button.style.pointerEvents = visible ? "auto" : "none";
      button.style.transform = `translate3d(${(world.x * 0.5 + 0.5) * width}px, ${(-world.y * 0.5 + 0.5) * height}px, 0) translate(-50%, -50%)`;
    }
  };

  let frame = 0;
  let last = performance.now();
  let lastMoveAt = 0;
  let lastX = 0;
  const render = (now: number) => {
    frame = requestAnimationFrame(render);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (stepSpin(spin, dt, !reducedMotion)) dirty = true;
    if (!dirty) return;
    dirty = false;
    tree.rotation.y = spin.angle;
    renderer.render(scene, camera);
    updateCallouts();
  };
  frame = requestAnimationFrame(render);

  return {
    sync,
    pointerDown(x) {
      beginDrag(spin);
      lastX = x;
      lastMoveAt = performance.now();
    },
    pointerMove(x) {
      if (!spin.dragging) return;
      const now = performance.now();
      dragBy(spin, x - lastX, (now - lastMoveAt) / 1000);
      lastX = x;
      lastMoveAt = now;
      dirty = true;
    },
    pointerUp() {
      if (!spin.dragging) return;
      endDrag(spin, performance.now() - lastMoveAt);
    },
    nudge(direction) {
      nudge(spin, direction);
    },
    stats() {
      let loaded = 0;
      for (const entry of slots.values()) if (entry.state === "loaded") loaded += 1;
      return {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        loaded,
        failed,
        pending: queue.pending + queue.active,
      };
    },
    dispose() {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      queue.dispose();
      for (const slot of [...slots.keys()]) removeSlot(slot);
      disposeObject(scene);
      placeholders.dispose();
      hooks.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
