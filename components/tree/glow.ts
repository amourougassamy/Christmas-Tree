import {
  BufferGeometry, CanvasTexture, Color, CustomBlending, Float32BufferAttribute, OneFactor, ZeroFactor, InstancedMesh, Matrix4,
  Mesh, MeshStandardMaterial, Points, PointsMaterial, SRGBColorSpace, Vector3, type Scene,
} from "three";
import { BULB_BRIGHTNESS, EMISSIVE_LEVEL, HALO_SIZE, glowPulse, haloOpacity } from "../../lib/tree/glow.ts";

/**
 * Fairy-light glow without full-screen post-processing.
 *
 * Each bulb keeps its small solid core and gets one soft, additive halo
 * sprite drawn in a single `Points` call. That keeps the renderer's MSAA
 * (a bloom composer renders to non-multisampled targets, which made the
 * needles grainy and fringed the silhouette) and costs one draw call.
 */

let haloTexture: CanvasTexture | null = null;
function softHaloTexture(): CanvasTexture {
  if (haloTexture) return haloTexture;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // A fast falloff: bright only right around the bulb, then a long faint tail.
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.18, "rgba(255,255,255,0.55)");
  gradient.addColorStop(0.45, "rgba(255,255,255,0.12)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  haloTexture = new CanvasTexture(canvas);
  haloTexture.colorSpace = SRGBColorSpace;
  return haloTexture;
}

export type BulbGlow = {
  /** 0 (bright day) .. 1 (deep night): halos and bulbs read a little stronger after dark. */
  setNightFactor(value: number): void;
  update(time: number): void;
  dispose(): void;
};

/** An extra halo in the bulbs' local space, e.g. behind the star. `scale` multiplies the bulb halo size. */
export type ExtraHalo = { position: [number, number, number]; color: string; scale: number };

/** Add one soft halo per fairy-light instance, as a child of the bulbs so it spins with the tree. */
export function addBulbGlow(bulbs: InstancedMesh, reducedMotion: boolean, extras: ExtraHalo[] = []): BulbGlow {
  const count = bulbs.count + extras.length;
  const positions = new Float32Array(count * 3);
  const colours = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const scales = new Float32Array(count).fill(1);
  const matrix = new Matrix4();
  const position = new Vector3();
  const colour = new Color();
  for (let i = 0; i < bulbs.count; i += 1) {
    bulbs.getMatrixAt(i, matrix);
    position.setFromMatrixPosition(matrix);
    position.toArray(positions, i * 3);
    if (bulbs.instanceColor) bulbs.getColorAt(i, colour);
    else colour.set("#ffffff");
    colour.toArray(colours, i * 3);
    phases[i] = i * 2.399963;
  }
  extras.forEach((extra, offset) => {
    const i = bulbs.count + offset;
    positions.set(extra.position, i * 3);
    colour.set(extra.color).toArray(colours, i * 3);
    phases[i] = i * 2.399963;
    scales[i] = extra.scale;
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colours, 3));
  geometry.setAttribute("glowPhase", new Float32BufferAttribute(phases, 1));
  geometry.setAttribute("haloScale", new Float32BufferAttribute(scales, 1));

  const material = new PointsMaterial({
    map: softHaloTexture(),
    size: HALO_SIZE,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    // Colour: dst + src (light adds). Alpha: keep dst, so the CSS sky behind isn't affected.
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneFactor,
    blendSrcAlpha: ZeroFactor,
    blendDstAlpha: OneFactor,
    toneMapped: false,
  });
  const glowTime = { value: 0 };
  const strength = { value: haloOpacity(0.65) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.glowTime = glowTime;
    shader.uniforms.glowStrength = strength;
    shader.vertexShader = "attribute float glowPhase; attribute float haloScale; uniform float glowTime; varying float vTwinkle;\n" + shader.vertexShader
      .replace("gl_PointSize = size;", "gl_PointSize = size * haloScale;")
      // Pull the sprite a little toward the camera so the needles around a bulb
      // don't clip its halo; bulbs on the far side stay hidden behind the tree.
      .replace("#include <project_vertex>", `#include <project_vertex>
        mvPosition.z += 0.35;
        gl_Position = projectionMatrix * mvPosition;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        // Slow, small breathing; never fully off, never a flash.
        vTwinkle = 0.82 + 0.18 * sin(glowTime * 0.7 + glowPhase) * sin(glowTime * 0.23 + glowPhase * 1.3);`);
    shader.fragmentShader = "uniform float glowStrength; varying float vTwinkle;\n" + shader.fragmentShader
      .replace("#include <premultiplied_alpha_fragment>", `#include <premultiplied_alpha_fragment>
        gl_FragColor.rgb *= gl_FragColor.a * glowStrength * vTwinkle;`);
  };
  material.customProgramCacheKey = () => "bulb-halo-v3";

  const halos = new Points(geometry, material);
  halos.frustumCulled = false;
  halos.renderOrder = 2;
  bulbs.add(halos);

  const bulbMaterial = bulbs.material as MeshStandardMaterial | { color: Color };
  return {
    setNightFactor(value) {
      strength.value = haloOpacity(value);
      bulbMaterial.color.setScalar(BULB_BRIGHTNESS * (0.85 + 0.25 * value));
    },
    update(time) {
      if (!reducedMotion) glowTime.value = time;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/** Gentle emissive breathing for the star and lantern flames, from their own base levels. */
export function createGlowAnimation(scene: Scene, reducedMotion: boolean) {
  const materials: { material: MeshStandardMaterial; base: number }[] = [];
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      const base = EMISSIVE_LEVEL[material.name as keyof typeof EMISSIVE_LEVEL];
      if (base !== undefined && !materials.some((entry) => entry.material === material)) {
        materials.push({ material: material as MeshStandardMaterial, base });
      }
    }
  });
  const apply = (time: number) => {
    for (let i = 0; i < materials.length; i += 1) {
      materials[i].material.emissiveIntensity = materials[i].base * glowPulse(time, i * 2.1);
    }
  };
  apply(0);
  return { update(time: number) { if (!reducedMotion) apply(time); } };
}
