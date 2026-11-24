import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  ExtrudeGeometry,
  Shape,
  PointLight,
  InstancedMesh,
  Material,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  Scene,
  ShadowMaterial,
  SphereGeometry,
  TorusGeometry,
  TextureLoader,
  SRGBColorSpace,
  Vector3,
  Vector2,
  WebGLRenderer,
} from "three";
import { addWinterDetails, createArrivalSparkles } from "@/components/tree/winter-details";
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

export type SceneOrnament = { id: string; slot: number; modelUrl: string; message?: string; initials?: string };

export type TreeSceneStats = {
  calls: number;
  triangles: number;
  loaded: number;
  failed: number;
  pending: number;
};

export type TreeScene = {
  sync(ornaments: readonly SceneOrnament[], arrivalId?: string | null): void;
  pointerDown(x: number, y: number): void;
  pointerMove(x: number, y: number): void;
  pointerUp(): void;
  nudge(direction: -1 | 1): void;
  pan(delta: number): void;
  zoom(value: number): void;
  stats(): TreeSceneStats;
  dispose(): void;
};

type SlotEntry = {
  ornament: SceneOrnament;
  anchor: TreeAnchor;
  group: Group;
  model: Object3D | null;
  state: "pending" | "loaded" | "failed";
  celebrate: boolean;
};

const PLACEHOLDER_PALETTE = ["#b51f32", "#e3b74f", "#d8e4eb", "#276451", "#c5352e"];
const PLACEHOLDER_RADIUS = 0.26;
const DEFAULT_ORNAMENT_SCALE = 0.7;
const STRING_RADIUS = 0.007;
const ORNAMENT_DANGLE = 0.1;
const LOAD_CONCURRENCY = 3;
const FOV = 30;
const ELEVATION = (5 * Math.PI) / 180;

const zeroMatrix = new Matrix4().makeScale(0, 0, 0);

function disposeObject(root: Object3D) {
  root.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    if (mesh instanceof InstancedMesh) mesh.dispose();
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material: Material) => {
      const map = (material as MeshBasicMaterial).map;
      map?.dispose();
      material.dispose();
    });
  });
}

function addFoliage(tree: Group, occluders: Object3D[], onTextureReady: () => void) {
  const trunk = new Mesh(
    new CylinderGeometry(0.07, TRUNK.radiusBottom * 0.7, STAR_Y - TRUNK.bottomY, 28),
    new MeshStandardMaterial({ color: "#563a2a", roughness: 0.92 }),
  );
  trunk.position.y = (TRUNK.bottomY + STAR_Y) / 2;
  trunk.castShadow = trunk.receiveShadow = true;
  tree.add(trunk);
  occluders.push(trunk);

  // Build real radial boughs with paired side shoots and individual needles.
  // Instancing keeps the entire canopy to two draw calls.
  const woodMatrices: Matrix4[] = [];
  const needleMatrices: Matrix4[] = [];
  const needleColors: Color[] = [];
  const up = new Vector3(0, 1, 0);
  const rotation = new Quaternion();
  let seed = 419;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const segment = (from: Vector3, to: Vector3, radius: number, output: Matrix4[]) => {
    const direction = to.clone().sub(from);
    rotation.setFromUnitVectors(up, direction.clone().normalize());
    output.push(new Matrix4().compose(
      from.clone().add(to).multiplyScalar(0.5),
      rotation,
      new Vector3(radius, direction.length(), radius),
    ));
  };
  const greens = ["#143b27", "#1d4a2e", "#285838", "#326541", "#406f49", "#527d56"];
  const needle = (from: Vector3, direction: Vector3, length: number) => {
    segment(from, from.clone().addScaledVector(direction.normalize(), length), 0.007 + random() * 0.006, needleMatrices);
    needleColors.push(new Color(greens[Math.floor(random() * greens.length)]));
  };
  const bough = (tip: Vector3, angle: number, fullness: number) => {
    const radial = new Vector3(Math.sin(angle), 0, Math.cos(angle));
    const sideways = new Vector3(Math.cos(angle), 0, -Math.sin(angle));
    const root = new Vector3(radial.x * 0.12, tip.y + 0.55, radial.z * 0.12);
    const branchPoint = (t: number) => {
      const point = root.clone().lerp(tip, t);
      point.y -= Math.sin(t * Math.PI) * 0.2 * fullness;
      return point;
    };
    for (let section = 0; section < 8; section += 1) {
      segment(branchPoint(section / 8), branchPoint((section + 1) / 8),
        (0.038 - section * 0.0038) * fullness, woodMatrices);
    }
    // Fir sprays lie along the twig rather than forming upright spikes.
    // Mature shoots sag; only the final few centimetres lift toward the light.
    for (let step = 1; step <= 12; step += 1) {
      const t = step / 13;
      const origin = branchPoint(t);
      for (const side of [-1, 1]) {
        const spread = (1 - t) * 0.78 * fullness + 0.1;
        const end = origin.clone()
          .addScaledVector(sideways, side * spread)
          .addScaledVector(radial, 0.22 + random() * 0.18);
        end.y -= 0.03 + random() * 0.09;
        const shootPoint = (u: number) => {
          const point = origin.clone().lerp(end, u);
          point.y -= Math.sin(u * Math.PI) * 0.09;
          point.y += Math.max(0, u - 0.72) * 0.52;
          return point;
        };
        for (let section = 0; section < 4; section += 1) {
          segment(shootPoint(section / 4), shootPoint((section + 1) / 4),
            (0.012 - section * 0.0023) * fullness, woodMatrices);
        }
        const tangent = end.clone().sub(origin).normalize();
        const lateral = new Vector3().crossVectors(tangent, up).normalize();
        const normal = new Vector3().crossVectors(lateral, tangent).normalize();
        for (let n = 0; n < 18; n += 1) {
          const u = (n + random() * 0.4) / 18;
          const point = shootPoint(u);
          // Alternating needles form a broad, flat fan, with a smaller
          // scattered underside row for depth and natural irregularity.
          for (const direction of [-1, 1]) {
            const spray = lateral.clone().multiplyScalar(direction * (0.8 + random() * 0.2))
              .addScaledVector(tangent, 0.25 + random() * 0.35)
              .addScaledVector(normal, (random() - 0.48) * 0.24);
            needle(point, spray, (0.15 + random() * 0.12) * fullness * (1 - u * 0.4));
          }
          if (n % 2 === 0) {
            needle(point, normal.clone().multiplyScalar(-0.7)
              .addScaledVector(tangent, 0.5)
              .addScaledVector(lateral, (random() - 0.5) * 0.6),
            (0.12 + random() * 0.08) * fullness);
          }
        }
      }
      needle(origin, radial.clone().setY(-0.15 + random() * 0.25), 0.22 * fullness);
    }
  };

  for (const [layer, tier] of TREE_TIERS.entries()) {
    // The outer boughs end exactly where the existing ornament hooks attach.
    for (const anchor of TREE_ANCHORS.filter((anchor) => anchor.tier === layer)) {
      bough(new Vector3(...anchor.tip), anchor.rotationY, 1 - layer * 0.045);
    }
    // Overlapping, staggered whorls break up the tiered silhouette and fill
    // the space between outer branches with a dense, irregular canopy.
    const count = 20 - layer;
    for (let row = 0; row < 3; row += 1) {
      for (let i = 0; i < count; i += 1) {
        const angle = (i + row * 0.43) / count * Math.PI * 2 + tier.rotationY;
        const rise = 0.17 + row * 0.32 + random() * 0.18;
        const radius = tier.radius * (0.92 - row * 0.2) * (0.9 + random() * 0.1);
        bough(new Vector3(
          Math.sin(angle) * radius,
          tier.baseY + rise,
          Math.cos(angle) * radius,
        ), angle, 1.02 - layer * 0.035);
      }
    }
  }

  // A narrow central leader connects the crown to the star.
  const crown = TREE_TIERS[TREE_TIERS.length - 1];
  for (let i = 0; i < 11; i += 1) {
    const t = i / 11;
    const angle = i * 2.399;
    const radius = 0.65 * (1 - t) + 0.04;
    bough(new Vector3(Math.sin(angle) * radius, crown.baseY + 0.65 + t * 0.85, Math.cos(angle) * radius), angle, 0.4);
  }
  const branches = new InstancedMesh(
    new CylinderGeometry(0.35, 1, 1, 10),
    new MeshStandardMaterial({ color: "#654a35", roughness: 0.98, metalness: 0 }),
    woodMatrices.length,
  );
  woodMatrices.forEach((matrix, i) => branches.setMatrixAt(i, matrix));
  branches.castShadow = branches.receiveShadow = true;
  tree.add(branches);
  const needles = new InstancedMesh(
    new ConeGeometry(1, 1, 6),
    new MeshStandardMaterial({ color: "#ffffff", roughness: 0.96, metalness: 0 }),
    needleMatrices.length,
  );
  needleMatrices.forEach((matrix, i) => {
    needles.setMatrixAt(i, matrix);
    needles.setColorAt(i, needleColors[i]);
  });
  needles.castShadow = needles.receiveShadow = true;
  tree.add(needles);
  // Simple inner volumes hide rear callouts without raycasting every needle.
  for (const tier of TREE_TIERS) {
    const core = new Mesh(
      new ConeGeometry(tier.radius * 0.8, tier.height, CONE_SEGMENTS),
      new MeshBasicMaterial(),
    );
    core.position.y = tier.baseY + tier.height / 2;
    core.visible = false;
    tree.add(core);
    occluders.push(core);
  }

  const starShape = new Shape();
  for (let point = 0; point < 10; point += 1) {
    const angle = Math.PI / 2 + point * Math.PI / 5;
    const radius = point % 2 === 0 ? 0.52 : 0.235;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (point === 0) starShape.moveTo(x, y);
    else starShape.lineTo(x, y);
  }
  starShape.closePath();
  const starGeometry = new ExtrudeGeometry(starShape, {
    depth: 0.075, bevelEnabled: true, bevelThickness: 0.055,
    bevelSize: 0.045, bevelSegments: 3, steps: 1,
  });
  starGeometry.translate(0, 0, -0.0375);
  const topper = new Group();
  topper.position.y = STAR_Y + 0.42;
  const star = new Mesh(starGeometry, new MeshPhysicalMaterial({
    color: "#edbb45", emissive: "#e6a328", emissiveIntensity: 0.45,
    metalness: 0.78, roughness: 0.24, clearcoat: 0.8,
  }));
  topper.add(star);
  const inset = new Mesh(starGeometry, new MeshPhysicalMaterial({
    color: "#667fa4", emissive: "#263c61", emissiveIntensity: 0.22,
    metalness: 0.25, roughness: 0.32,
  }));
  inset.scale.set(0.64, 0.64, 0.55);
  inset.position.z = 0.1;
  topper.add(inset);
  const reverseInset = inset.clone();
  reverseInset.position.z = -0.1;
  topper.add(reverseInset);
  const logoTexture = new TextureLoader().load("/mka-mark.svg", onTextureReady);
  logoTexture.colorSpace = SRGBColorSpace;
  const logoMaterial = new MeshBasicMaterial({
    map: logoTexture, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1,
  });
  const logoGeometry = new PlaneGeometry(0.36, 0.36 * 88 / 120);
  for (const side of [-1, 1]) {
    const logo = new Mesh(logoGeometry, logoMaterial);
    logo.position.set(0, -0.015, side * 0.16);
    if (side === -1) logo.rotation.y = Math.PI;
    topper.add(logo);
  }
  const glow = new PointLight("#ffd18c", 1.3, 3, 2);
  glow.position.y = -0.15;
  topper.add(glow);
  tree.add(topper);

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

/** Stationary snow surface and a small companion behind the community tree. */
function addWinterGround(scene: Scene) {
  const ground = new Mesh(
    new PlaneGeometry(200, 200),
    new MeshBasicMaterial({ color: "#c2c5d4" }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND_Y - 0.015;
  scene.add(ground);
  const contactShadows = new Mesh(
    new PlaneGeometry(200, 200),
    new ShadowMaterial({ color: "#53566f", opacity: 0.28 }),
  );
  contactShadows.rotation.x = -Math.PI / 2;
  contactShadows.position.y = GROUND_Y - 0.01;
  contactShadows.receiveShadow = true;
  scene.add(contactShadows);

  const snowman = new Group();
  snowman.position.set(-6.3, GROUND_Y, -3.5);
  snowman.rotation.y = 0.25;
  const snow = new MeshStandardMaterial({ color: "#ffffff", roughness: 0.95 });
  const coal = new MeshStandardMaterial({ color: "#263332", roughness: 0.85 });
  const scarf = new MeshStandardMaterial({ color: "#a72d38", roughness: 0.95 });
  const sphere = (radius: number, x: number, y: number, z: number, material: Material) => {
    const mesh = new Mesh(new SphereGeometry(radius, 20, 14), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    snowman.add(mesh);
    return mesh;
  };
  sphere(0.64, 0, 0.59, 0, snow);
  sphere(0.47, 0, 1.35, 0, snow);
  sphere(0.34, 0, 1.98, 0, snow);
  for (const x of [-0.115, 0.115]) sphere(0.038, x, 2.04, 0.302, coal);
  for (const y of [1.24, 1.47]) sphere(0.045, 0, y, 0.45, coal);
  for (let i = -2; i <= 2; i += 1) {
    sphere(0.021, i * 0.052, 1.85 + Math.abs(i) * 0.014, 0.3, coal);
  }
  const nose = new Mesh(new ConeGeometry(0.065, 0.3, 10),
    new MeshStandardMaterial({ color: "#dc8135", roughness: 0.8 }));
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 1.98, 0.44);
  snowman.add(nose);
  const collar = new Mesh(new CylinderGeometry(0.32, 0.36, 0.15, 20), scarf);
  collar.position.y = 1.72;
  snowman.add(collar);
  const tail = new Mesh(new BoxGeometry(0.16, 0.48, 0.07), scarf);
  tail.position.set(0.19, 1.47, 0.43);
  tail.rotation.z = -0.12;
  snowman.add(tail);
  for (const side of [-1, 1]) {
    const arm = new Mesh(new CylinderGeometry(0.018, 0.03, 0.85, 6),
      new MeshStandardMaterial({ color: "#71543b", roughness: 1 }));
    arm.position.set(side * 0.69, 1.41, 0);
    arm.rotation.z = side * -1.1;
    arm.castShadow = true;
    snowman.add(arm);
  }
  scene.add(snowman);
}

/** Wrapped gifts sit on the ground just outside the lowest ornaments. */
const GIFTS = [
  { angle: -0.15, radius: 4.28, size: [1.02, 0.62, 0.78], color: "#a92632", ribbon: "#d8b45e", turn: 0.12, round: false, dots: false, bottom: 0 },
  { angle: 0.65, radius: 4.12, size: [0.88, 0.78, 0.76], color: "#1f613b", ribbon: "#dfbd69", turn: -0.1, round: false, dots: false, bottom: 0 },
  { angle: 1.45, radius: 4.22, size: [1.18, 0.5, 0.86], color: "#d4af67", ribbon: "#a72936", turn: 0.16, round: false, dots: true, bottom: 0 },
  { angle: 2.25, radius: 4.4, size: [1.28, 0.7, 0.9], color: "#b72b35", ribbon: "#e4c373", turn: -0.08, round: false, dots: false, bottom: 0 },
  { angle: 3.05, radius: 4.18, size: [0.92, 0.82, 0.78], color: "#276b42", ribbon: "#dcb866", turn: 0.14, round: false, dots: false, bottom: 0 },
  { angle: 3.85, radius: 4.27, size: [1.08, 0.56, 0.82], color: "#e3d4ae", ribbon: "#a82734", turn: -0.15, round: false, dots: true, bottom: 0 },
  { angle: 4.65, radius: 4.18, size: [0.78, 0.94, 0.72], color: "#a92734", ribbon: "#d8b45e", turn: 0.08, round: false, dots: false, bottom: 0 },
  { angle: 5.45, radius: 4.32, size: [0.92, 0.52, 0.76], color: "#24633d", ribbon: "#e2c071", turn: -0.12, round: false, dots: false, bottom: 0 },
  { angle: -0.15, radius: 4.28, size: [0.58, 0.38, 0.52], color: "#dfd2ad", ribbon: "#a62a35", turn: 0.08, round: true, dots: false, bottom: 0.66 },
  { angle: 1.45, radius: 4.22, size: [0.62, 0.44, 0.56], color: "#b42b35", ribbon: "#dfbd69", turn: -0.14, round: false, dots: false, bottom: 0.54 },
  { angle: 3.05, radius: 4.18, size: [0.62, 0.4, 0.56], color: "#d8b66e", ribbon: "#a72a36", turn: 0.1, round: true, dots: false, bottom: 0.86 },
  { angle: 4.65, radius: 4.18, size: [0.56, 0.34, 0.5], color: "#e7d9b6", ribbon: "#24633d", turn: -0.1, round: false, dots: false, bottom: 0.98 },
  { angle: 0.25, radius: 4.72, size: [0.84, 0.48, 0.68], color: "#e4d6b2", ribbon: "#a72936", turn: -0.18, round: false, dots: true, bottom: 0 },
  { angle: 1.05, radius: 4.62, size: [0.72, 0.7, 0.66], color: "#b32935", ribbon: "#ddba66", turn: 0.2, round: true, dots: false, bottom: 0 },
  { angle: 1.85, radius: 4.74, size: [1.02, 0.42, 0.76], color: "#23643e", ribbon: "#e1c06f", turn: -0.12, round: false, dots: false, bottom: 0 },
  { angle: 2.65, radius: 4.64, size: [0.76, 0.66, 0.7], color: "#d7b36b", ribbon: "#a62834", turn: 0.14, round: false, dots: false, bottom: 0 },
  { angle: 3.45, radius: 4.76, size: [1.08, 0.46, 0.8], color: "#aa2834", ribbon: "#e3c273", turn: -0.16, round: false, dots: true, bottom: 0 },
  { angle: 4.25, radius: 4.62, size: [0.7, 0.74, 0.68], color: "#e5d8b6", ribbon: "#286843", turn: 0.1, round: true, dots: false, bottom: 0 },
  { angle: 5.05, radius: 4.74, size: [0.96, 0.44, 0.74], color: "#24633e", ribbon: "#dcb967", turn: -0.2, round: false, dots: false, bottom: 0 },
  { angle: 5.85, radius: 4.64, size: [0.8, 0.64, 0.72], color: "#b52b36", ribbon: "#e4c474", turn: 0.16, round: false, dots: true, bottom: 0 },
  { angle: 2.25, radius: 4.4, size: [0.64, 0.42, 0.56], color: "#e6dab9", ribbon: "#286843", turn: 0.12, round: true, dots: false, bottom: 0.74 },
  { angle: 5.45, radius: 4.32, size: [0.58, 0.36, 0.5], color: "#d8b46b", ribbon: "#a62935", turn: -0.08, round: false, dots: false, bottom: 0.56 },
] as const;
const GIFT_REACH = Math.max(...GIFTS.map((gift) => gift.radius + Math.hypot(gift.size[0], gift.size[2]) / 2));
const GIFT_HEIGHT = Math.max(...GIFTS.map((gift) => gift.bottom + gift.size[1] + 0.2));

function addGifts(tree: Group) {
  for (const gift of GIFTS) {
    const group = new Group();
    const [width, height, depth] = gift.size;
    group.position.set(Math.sin(gift.angle) * gift.radius, GROUND_Y + gift.bottom + height / 2, Math.cos(gift.angle) * gift.radius);
    group.rotation.y = gift.angle + gift.turn;
    const wrapping = new MeshPhysicalMaterial({ color: gift.color, roughness: 0.52, clearcoat: 0.35, clearcoatRoughness: 0.55 });
    const ribbon = new MeshPhysicalMaterial({ color: gift.ribbon, roughness: 0.3, metalness: 0.14, clearcoat: 0.75, clearcoatRoughness: 0.25 });
    const box = new Mesh(gift.round
      ? new CylinderGeometry(width / 2, width / 2, height, 40)
      : new BoxGeometry(width, height, depth), wrapping);
    const lid = new Mesh(gift.round
      ? new CylinderGeometry(width / 2 + 0.018, width / 2 + 0.018, 0.065, 40)
      : new BoxGeometry(width + 0.035, 0.065, depth + 0.035), wrapping);
    lid.position.y = height / 2;
    const verticalRibbon = new Mesh(new BoxGeometry(width * 0.13, height + 0.075, gift.round ? width * 0.97 : depth + 0.025), ribbon);
    const crossRibbon = new Mesh(new BoxGeometry(width + 0.025, height + 0.08, depth * 0.13), ribbon);
    group.add(box, lid, verticalRibbon, crossRibbon);
    // Two satin loops and a knot make each parcel feel hand wrapped.
    for (const side of [-1, 1]) {
      const bow = new Mesh(new TorusGeometry(width * 0.12, 0.025, 10, 32), ribbon);
      bow.scale.set(1.25, 0.65, 1);
      bow.rotation.x = -Math.PI / 2 + side * 0.3;
      bow.rotation.y = side * 0.2;
      bow.position.set(side * width * 0.12, height / 2 + 0.1, 0);
      group.add(bow);
    }
    const knot = new Mesh(new SphereGeometry(0.055, 16, 12), ribbon);
    knot.position.y = height / 2 + 0.105;
    group.add(knot);
    if (gift.dots) {
      const dotGeometry = new SphereGeometry(0.025, 10, 8);
      for (const face of [-1, 1]) {
        for (let row = 0; row < 3; row += 1) {
          for (let col = 0; col < 4; col += 1) {
            const dot = new Mesh(dotGeometry, ribbon);
            dot.scale.z = 0.2;
            dot.position.set((col - 1.5) * width / 5, (row - 1) * height / 4, face * (depth / 2 + 0.005));
            group.add(dot);
          }
        }
      }
    }
    group.traverse((child) => {
      if (child instanceof Mesh) child.castShadow = child.receiveShadow = true;
    });
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
  rings.push([GIFT_REACH, GROUND_Y], [GIFT_REACH, GROUND_Y + GIFT_HEIGHT], [0.3, STAR_Y + 0.9]);
  return sweepRings(rings);
}

export function createTreeScene(options: {
  mount: HTMLElement;
  getButton: (id: string) => HTMLElement | undefined;
  reducedMotion: boolean;
  onReveal?: (id: string) => void;
}): TreeScene {
  const { mount, getButton, reducedMotion } = options;
  const scene = new Scene();

  const camera = new PerspectiveCamera(FOV, 1, 1, 200);
  camera.zoom = 1.25;
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.style.display = "block";
  mount.appendChild(renderer.domElement);

  // Lights live in the scene, not the spinning tree, and the camera never
  // moves, so shading stays put while the tree turns.
  scene.add(new AmbientLight("#b2b6d4", 0.5));
  scene.add(new HemisphereLight("#b9bddd", "#636b83", 0.75));
  const key = new DirectionalLight("#efb58b", 1.65);
  key.position.set(9, 5, -3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -10;
  key.shadow.camera.right = 10;
  key.shadow.camera.top = 9;
  key.shadow.camera.bottom = -12;
  key.shadow.camera.near = 4;
  key.shadow.camera.far = 32;
  key.shadow.bias = -0.0008;
  scene.add(key);
  const fill = new DirectionalLight("#a0b6df", 0.65);
  fill.position.set(-8, 3, -2);
  scene.add(fill);

  const tree = new Group();
  scene.add(tree);
  addWinterGround(scene);
  const winterDetails = addWinterDetails(scene);
  const occluders: Object3D[] = [];
  let dirty = true;
  const canopy = new Group();
  tree.add(canopy);
  addFoliage(canopy, occluders, () => { dirty = true; });
  const sparkles = createArrivalSparkles(canopy);
  addGifts(tree);

  // Placeholders and hooks are instanced per slot: two draw calls for all 60.
  const placeholderGeometry = new SphereGeometry(PLACEHOLDER_RADIUS, 32, 24);
  const placeholderMaterial = new MeshPhysicalMaterial({ color: "#ffffff", emissive: "#e9b955", emissiveIntensity: 0.16, clearcoat: 0.65, roughness: 0.3, metalness: 0.08 });
  const placeholders = new InstancedMesh(placeholderGeometry, placeholderMaterial, TREE_ANCHORS.length);
  const hookGeometry = new CylinderGeometry(STRING_RADIUS, STRING_RADIUS, 1, 10, 1, true);
  const hookMaterial = new MeshStandardMaterial({ color: "#d8c08a", metalness: 0.6, roughness: 0.4 });
  const hooks = new InstancedMesh(hookGeometry, hookMaterial, TREE_ANCHORS.length);
  const bells = new InstancedMesh(
    new LatheGeometry([
      new Vector2(0, 0.22), new Vector2(0.09, 0.21),
      new Vector2(0.13, 0.13), new Vector2(0.14, -0.04),
      new Vector2(0.2, -0.18), new Vector2(0.25, -0.22),
      new Vector2(0.25, -0.25), new Vector2(0.19, -0.25),
      new Vector2(0.16, -0.18), new Vector2(0, -0.17),
    ], 32),
    new MeshPhysicalMaterial({ color: "#dfad43", emissive: "#e9b955", emissiveIntensity: 0.16, metalness: 0.72, roughness: 0.25, clearcoat: 0.6 }),
    TREE_ANCHORS.length,
  );
  const icicles = new InstancedMesh(
    new ConeGeometry(0.12, 0.58, 16).rotateZ(Math.PI),
    new MeshPhysicalMaterial({ color: "#d8e9f0", emissive: "#e9b955", emissiveIntensity: 0.16, metalness: 0.32, roughness: 0.18, clearcoat: 1 }),
    TREE_ANCHORS.length,
  );
  const caps = new InstancedMesh(
    new CylinderGeometry(0.065, 0.075, 0.085, 18),
    new MeshStandardMaterial({ color: "#d6ad55", metalness: 0.7, roughness: 0.3 }),
    TREE_ANCHORS.length,
  );
  bells.frustumCulled = icicles.frustumCulled = caps.frustumCulled = false;
  canopy.add(bells, icicles, caps);
  const placeholderColour = new Color();
  for (let i = 0; i < TREE_ANCHORS.length; i += 1) {
    placeholders.setMatrixAt(i, zeroMatrix);
    hooks.setMatrixAt(i, zeroMatrix);
    placeholders.setColorAt(i, placeholderColour.set(PLACEHOLDER_PALETTE[i % PLACEHOLDER_PALETTE.length]));
  }
  // Instances move around the whole tree; skip per-object culling.
  placeholders.frustumCulled = hooks.frustumCulled = false;
  canopy.add(placeholders, hooks);

  const scratch = new Matrix4();
  const scratchQuat = new Quaternion();
  const defaultOrnamentScale = new Vector3(DEFAULT_ORNAMENT_SCALE, DEFAULT_ORNAMENT_SCALE, DEFAULT_ORNAMENT_SCALE);
  const up = new Vector3(0, 1, 0);
  const hookMatrix = (anchor: TreeAnchor) => {
    const tip = new Vector3(...anchor.tip);
    const eyelet = new Vector3(...anchor.position);
    eyelet.y -= ORNAMENT_DANGLE;
    const direction = tip.clone().sub(eyelet);
    const length = direction.length();
    scratchQuat.setFromUnitVectors(up, direction.normalize());
    return scratch.compose(tip.add(eyelet).multiplyScalar(0.5), scratchQuat, new Vector3(1, length, 1));
  };
  const setPlaceholder = (anchor: TreeAnchor, visible: boolean, sway = 0) => {
    const index = anchor.slot - 1;
    const kind = index % 3;
    const scaledRadius = PLACEHOLDER_RADIUS * DEFAULT_ORNAMENT_SCALE;
    const centerX = anchor.position[0] + Math.sin(sway) * scaledRadius;
    const centerY = anchor.position[1] - ORNAMENT_DANGLE - scaledRadius - 0.04;
    placeholders.setMatrixAt(index, visible && kind === 0
      ? scratch.makeRotationZ(sway).scale(defaultOrnamentScale).setPosition(centerX, centerY, anchor.position[2]) : zeroMatrix);
    bells.setMatrixAt(index, visible && kind === 1
      ? scratch.makeRotationZ(sway).scale(defaultOrnamentScale).setPosition(centerX, centerY, anchor.position[2]) : zeroMatrix);
    icicles.setMatrixAt(index, visible && kind === 2
      ? scratch.makeRotationZ(sway).scale(defaultOrnamentScale).setPosition(centerX, centerY - 0.02, anchor.position[2]) : zeroMatrix);
    caps.setMatrixAt(index, visible
      ? scratch.makeScale(DEFAULT_ORNAMENT_SCALE, DEFAULT_ORNAMENT_SCALE, DEFAULT_ORNAMENT_SCALE)
        .setPosition(anchor.position[0], anchor.position[1] - ORNAMENT_DANGLE - 0.032, anchor.position[2]) : zeroMatrix);
    for (const mesh of [placeholders, bells, icicles, caps]) mesh.instanceMatrix.needsUpdate = true;
  };
  const setHook = (anchor: TreeAnchor, visible: boolean) => {
    hooks.setMatrixAt(anchor.slot - 1, visible ? hookMatrix(anchor) : zeroMatrix);
    hooks.instanceMatrix.needsUpdate = true;
  };
  for (const anchor of TREE_ANCHORS) {
    setPlaceholder(anchor, true);
    setHook(anchor, true);
  }

  const spin = createSpinState(-0.35);
  tree.rotation.y = spin.angle;
  let zoomValue = 1;
  let panY = 0;
  let baseCameraY = 0;
  let baseTargetY = 0;

  const maxPan = () => 4 * ((zoomValue - 1) / 1.5);
  const applyCameraPan = () => {
    const limit = maxPan();
    panY = Math.max(-limit, Math.min(limit, panY));
    camera.position.y = baseCameraY + panY;
    camera.lookAt(0, baseTargetY + panY, 0);
    camera.updateProjectionMatrix();
    dirty = true;
  };

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
        if (entry.celebrate && !reducedMotion) sparkles.burst(entry.anchor.position);
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
    lastRevealed.delete(entry.ornament.id);
    canopy.remove(entry.group);
    if (entry.model) disposeObject(entry.model);
    if (entry.state === "failed") failed -= 1;
    setPlaceholder(entry.anchor, true);
    setHook(entry.anchor, true);
    dirty = true;
  };

  const sync = (ornaments: readonly SceneOrnament[], arrivalId?: string | null) => {
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
      group.position.y -= ORNAMENT_DANGLE;
      group.rotation.y = anchor.rotationY;
      canopy.add(group);
      const entry: SlotEntry = { ornament, anchor, group, model: null, state: "pending", celebrate: ornament.id === arrivalId };
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
    baseCameraY = targetY + Math.sin(ELEVATION) * distance;
    baseTargetY = targetY;
    camera.position.set(0, baseCameraY, Math.cos(ELEVATION) * distance);
    applyCameraPan();
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
  let nextRevealAt = 0;
  const lastRevealed = new Map<string, number>();
  let previousAngle = spin.angle;
  const updateCallouts = (now: number, spinning: boolean) => {
    let candidate: SlotEntry | undefined;
    let bestFacing = 0.65;
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
      const facing = Math.cos(entry.anchor.rotationY + spin.angle);
      if (spinning && visible && Math.abs(world.x) < 0.85 && facing > bestFacing
        && entry.ornament.message?.trim()
        && now - (lastRevealed.get(entry.ornament.id) ?? -Infinity) > 12000) {
        candidate = entry;
        bestFacing = facing;
      }
      button.style.opacity = visible ? "1" : "0";
      button.style.pointerEvents = visible ? "auto" : "none";
      button.style.transform = `translate3d(${(world.x * 0.5 + 0.5) * width}px, ${(-world.y * 0.5 + 0.5) * height}px, 0) translate(-50%, -50%)`;
    }
    if (candidate && now >= nextRevealAt) {
      options.onReveal?.(candidate.ornament.id);
      lastRevealed.set(candidate.ornament.id, now);
      nextRevealAt = now + 3400;
    }
  };

  let frame = 0;
  let last = performance.now();
  let lastMoveAt = 0;
  let lastX = 0;
  let lastY = 0;
  const render = (now: number) => {
    frame = requestAnimationFrame(render);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (stepSpin(spin, dt, !reducedMotion)) dirty = true;
    const time = now / 1000;
    if (!reducedMotion) {
      canopy.rotation.z = Math.sin(time * 0.34) * 0.0045 + Math.sin(time * 0.13 + 1.4) * 0.002;
      canopy.rotation.x = Math.sin(time * 0.27 + 1) * 0.0022 + Math.sin(time * 0.11) * 0.001;
      for (const entry of slots.values()) {
        entry.group.rotation.z = Math.sin(time * 0.85 + entry.anchor.slot * 1.7) * 0.035;
        entry.group.rotation.x = Math.sin(time * 0.63 + entry.anchor.slot) * 0.018;
      }
      for (const anchor of TREE_ANCHORS) {
        if (slots.get(anchor.slot)?.state !== "loaded") {
          setPlaceholder(anchor, true, Math.sin(time * 0.85 + anchor.slot * 1.7) * 0.035);
        }
      }
      winterDetails.update(time);
      dirty = true;
    }
    if (sparkles.update(time)) dirty = true;
    if (!dirty) return;
    dirty = false;
    tree.rotation.y = spin.angle;
    renderer.render(scene, camera);
    const spinning = Math.abs(spin.angle - previousAngle) > 0.00001;
    previousAngle = spin.angle;
    updateCallouts(now, spinning);
  };
  frame = requestAnimationFrame(render);

  return {
    sync,
    pointerDown(x, y) {
      beginDrag(spin);
      lastX = x;
      lastY = y;
      lastMoveAt = performance.now();
    },
    pointerMove(x, y) {
      if (!spin.dragging) return;
      const now = performance.now();
      dragBy(spin, x - lastX, (now - lastMoveAt) / 1000);
      if (zoomValue > 1) {
        panY += (y - lastY) * (0.014 / Math.sqrt(zoomValue));
        applyCameraPan();
      }
      lastX = x;
      lastY = y;
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
    pan(delta) {
      if (zoomValue <= 1) return;
      panY += delta;
      applyCameraPan();
    },
    zoom(value) {
      zoomValue = Math.max(1, Math.min(2.5, value));
      if (zoomValue === 1) panY = 0;
      camera.zoom = 1.25 * zoomValue;
      applyCameraPan();
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
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
