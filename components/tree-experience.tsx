"use client";

import { useEffect, useRef, useState } from "react";
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  WebGLRenderer,
  Vector3,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Rhino3dmLoader } from "three/addons/loaders/3DMLoader.js";
import { TREE_ANCHORS } from "@/lib/tree/anchors";
import {
  normalizeVisibleGeometry,
  preserveSupportedMaterials,
} from "@/lib/tree/model";

type Ornament = {
  id: string;
  initials: string;
  slot: number;
  originalName: string;
  byteSize: number;
  createdAt: string;
  archivedAt: string | null;
  modelUrl: string;
};

const palette = ["#c5533d", "#ddb55e", "#d9e1d7", "#8ea99a", "#c99173"];

function seeded(index: number, salt: number) {
  return ((Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453) % 1 + 1) % 1;
}

function createSnow() {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(330 * 3);
  for (let index = 0; index < 330; index += 1) {
    positions[index * 3] = (seeded(index, 1) - 0.5) * 18;
    positions[index * 3 + 1] = seeded(index, 2) * 15 - 6;
    positions[index * 3 + 2] = (seeded(index, 3) - 0.5) * 11;
  }
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  return new Points(
    geometry,
    new PointsMaterial({
      color: "#fffdf7",
      size: 0.045,
      opacity: 0.58,
      transparent: true,
      depthWrite: false,
    }),
  );
}

function addEvergreen(root: Group) {
  const trunk = new Mesh(
    new CylinderGeometry(0.34, 0.48, 2.1, 12),
    new MeshStandardMaterial({ color: "#563a2a", roughness: 0.92 }),
  );
  trunk.position.y = -3.65;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  root.add(trunk);

  const greens = ["#173f32", "#1d513e", "#245f46", "#2d6b4e"];
  for (let layer = 0; layer < 7; layer += 1) {
    const mesh = new Mesh(
      new ConeGeometry(3.55 - layer * 0.36, 2.45, 18),
      new MeshStandardMaterial({
        color: greens[layer % greens.length],
        roughness: 0.88,
        metalness: 0.02,
      }),
    );
    mesh.position.y = -2.25 + layer * 0.93;
    mesh.rotation.y = layer * 0.34;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }

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
  star.position.y = 4.95;
  star.scale.set(0.72, 1.42, 0.34);
  root.add(star);

  const lightGeometry = new SphereGeometry(0.075, 10, 8);
  for (let index = 0; index < 94; index += 1) {
    const progress = (index + 0.5) / 94;
    const angle = index * 2.17;
    const radius = 0.55 + progress * 2.78;
    const bulb = new Mesh(
      lightGeometry,
      new MeshStandardMaterial({
        color: index % 3 === 0 ? "#ffd27a" : index % 3 === 1 ? "#f2eee0" : "#cf6a54",
        emissive: index % 3 === 2 ? "#b43f2d" : "#f2ae3e",
        emissiveIntensity: 1.7,
        roughness: 0.32,
      }),
    );
    bulb.position.set(
      Math.cos(angle) * radius,
      3.85 - progress * 6.65,
      Math.sin(angle) * radius,
    );
    root.add(bulb);
  }
}

function disposeObject(root: Object3D) {
  root.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}

export function TreeExperience() {
  const mountRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const [ornaments, setOrnaments] = useState<Ornament[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading community ornaments…");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ornaments", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load ornaments");
        return response.json() as Promise<{ ornaments: Ornament[] }>;
      })
      .then(({ ornaments: next }) => {
        setOrnaments(next.filter((item) => item.slot >= 1 && item.slot <= 60));
        setStatus(next.length ? `${next.length} community ornaments on the tree` : "The tree is ready for its first ornament");
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError") {
          setStatus("The tree is glowing; community ornaments are temporarily unavailable");
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let alive = true;
    const scene = new Scene();
    scene.background = new Color("#10271f");
    scene.fog = new Fog("#10271f", 11, 24);

    const camera = new PerspectiveCamera(34, 1, 0.1, 50);
    camera.position.set(0, 1.05, 13.5);

    const renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.style.touchAction = "none";
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 8.3;
    controls.maxDistance = 18;
    controls.minPolarAngle = 0.72;
    controls.maxPolarAngle = 1.72;
    controls.target.set(0, 0.35, 0);
    controls.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    controls.autoRotateSpeed = 0.42;

    scene.add(new AmbientLight("#ffeac7", 1.55));
    const key = new DirectionalLight("#fff0cf", 3.1);
    key.position.set(5, 9, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const fill = new DirectionalLight("#6ca68d", 1.4);
    fill.position.set(-6, 2, -4);
    scene.add(fill);

    const tree = new Group();
    tree.position.y = -0.25;
    scene.add(tree);
    addEvergreen(tree);

    const snow = createSnow();
    scene.add(snow);

    const ornamentGroups = new Map<number, Group>();
    const fallbackMaterial = new MeshStandardMaterial({
      color: "#d3ad5c",
      metalness: 0.12,
      roughness: 0.48,
    });
    const loader = new Rhino3dmLoader();
    loader.setLibraryPath("/rhino3dm/");

    for (const ornament of ornaments) {
      const anchor = TREE_ANCHORS[ornament.slot - 1];
      if (!anchor) continue;
      const anchorGroup = new Group();
      anchorGroup.position.set(...anchor.position);
      anchorGroup.rotation.y = anchor.rotationY;
      anchorGroup.scale.setScalar(anchor.scale);
      anchorGroup.userData.ornamentId = ornament.id;
      tree.add(anchorGroup);
      ornamentGroups.set(ornament.slot, anchorGroup);

      const fallback = new Mesh(
        new SphereGeometry(0.25, 20, 16),
        new MeshPhysicalMaterial({
          color: palette[(ornament.slot - 1) % palette.length],
          clearcoat: 0.65,
          roughness: 0.3,
          metalness: 0.08,
        }),
      );
      fallback.position.y = 0.25;
      fallback.castShadow = true;
      anchorGroup.add(fallback);

      loader.load(
        ornament.modelUrl,
        (loaded) => {
          if (!alive) {
            disposeObject(loaded);
            return;
          }
          preserveSupportedMaterials(loaded, fallbackMaterial);
          const normalized = normalizeVisibleGeometry(loaded);
          if (!normalized) {
            disposeObject(loaded);
            return;
          }
          anchorGroup.remove(fallback);
          fallback.geometry.dispose();
          (fallback.material as MeshPhysicalMaterial).dispose();
          anchorGroup.add(normalized.group);
        },
        undefined,
        () => {
          // The fallback bauble intentionally remains when a model cannot be decoded.
        },
      );
    }

    const resize = () => {
      const width = Math.max(mount.clientWidth, 1);
      const height = Math.max(mount.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.position.z = camera.aspect < 0.72 ? 16 : camera.aspect < 1 ? 14.5 : 13.5;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const projection = new Vector3();
    let frame = 0;
    const render = () => {
      frame = requestAnimationFrame(render);
      controls.update();

      const positions = snow.geometry.getAttribute("position") as BufferAttribute;
      if (controls.autoRotate) {
        for (let index = 1; index < positions.array.length; index += 3) {
          positions.array[index] = Number(positions.array[index]) - 0.003;
          if (Number(positions.array[index]) < -6) positions.array[index] = 9;
        }
        positions.needsUpdate = true;
      }

      const width = mount.clientWidth;
      const height = mount.clientHeight;
      for (const ornament of ornaments) {
        const group = ornamentGroups.get(ornament.slot);
        const button = buttonRefs.current.get(ornament.id);
        if (!group || !button) continue;
        group.getWorldPosition(projection);
        projection.project(camera);
        const visible = projection.z > -1 && projection.z < 1;
        button.style.opacity = visible ? "1" : "0";
        button.style.pointerEvents = visible ? "auto" : "none";
        button.style.transform = `translate3d(${(projection.x * 0.5 + 0.5) * width}px, ${(-projection.y * 0.5 + 0.5) * height}px, 0) translate(-50%, -50%)`;
      }
      renderer.render(scene, camera);
    };
    render();

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      controls.dispose();
      loader.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [ornaments]);

  return (
    <main className="relative min-h-[100svh] overflow-hidden bg-[#10271f] text-[#fff9ec]">
      <div ref={mountRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_34%,transparent_20%,rgb(5_18_14/22%)_75%,rgb(4_13_10/55%)_100%)]" />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-6 p-5 sm:p-8">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#d8bf83]">Our community tree</p>
          <h1 className="mt-2 font-serif text-2xl tracking-[-0.03em] sm:text-4xl">Made brighter together.</h1>
        </div>
        <p className="max-w-48 text-right text-[11px] leading-relaxed text-[#e9dfc7]/70 sm:max-w-60 sm:text-xs">
          Drag to look around · scroll or pinch to zoom
        </p>
      </header>

      <div className="pointer-events-none absolute inset-0 z-10">
        {ornaments.map((ornament) => {
          const active = activeId === ornament.id;
          return (
            <button
              key={ornament.id}
              ref={(element) => {
                if (element) buttonRefs.current.set(ornament.id, element);
                else buttonRefs.current.delete(ornament.id);
              }}
              type="button"
              aria-label={`Ornament by ${ornament.initials}, slot ${ornament.slot}`}
              aria-pressed={active}
              className="group pointer-events-auto absolute left-0 top-0 h-11 w-11 rounded-full outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-[#ffe19a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#153228]"
              onPointerEnter={() => setActiveId(ornament.id)}
              onPointerLeave={() => setActiveId((current) => current === ornament.id ? null : current)}
              onFocus={() => setActiveId(ornament.id)}
              onBlur={() => setActiveId((current) => current === ornament.id ? null : current)}
              onClick={() => setActiveId((current) => current === ornament.id ? null : ornament.id)}
            >
              <span className={`absolute left-1/2 top-[-1.8rem] -translate-x-1/2 whitespace-nowrap rounded-full border border-white/15 bg-[#10271f]/92 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-[#fff4cf] shadow-lg backdrop-blur transition ${active ? "scale-100 opacity-100" : "scale-90 opacity-0"}`}>
                {ornament.initials}
              </span>
              <span className="sr-only">{ornament.originalName}</span>
            </button>
          );
        })}
      </div>

      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-4 p-5 sm:p-8">
        <p aria-live="polite" className="max-w-[70vw] text-[11px] tracking-wide text-[#eee3c9]/70 sm:text-xs">{status}</p>
        <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.15em] text-[#f1d99e] backdrop-blur">
          60 branches
        </span>
      </footer>
    </main>
  );
}
