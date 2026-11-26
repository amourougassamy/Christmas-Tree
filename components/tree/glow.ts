import {
  CustomBlending, InstancedBufferAttribute, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  OneFactor, Vector2, ZeroFactor, type Camera, type Scene, type WebGLRenderer,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { defaultBloom, glowPulse } from "../../lib/tree/glow.ts";

/** Patch the existing unlit instanced draw: phase travels with each bulb. */
export function twinkleBulbs(bulbs: InstancedMesh, chase = false) {
  const phase = new Float32Array(bulbs.count);
  for (let i = 0; i < phase.length; i++) phase[i] = i * 2.399963;
  bulbs.geometry.setAttribute("glowPhase", new InstancedBufferAttribute(phase, 1));
  const material = bulbs.material as MeshBasicMaterial;
  material.name = "fairy-glow";
  const time = { value: 0 };
  material.userData.glowTime = time;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.glowTime = time;
    shader.vertexShader = "attribute float glowPhase; varying float vGlowPhase;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlowPhase = glowPhase;");
    shader.fragmentShader = "uniform float glowTime; varying float vGlowPhase;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
      float twinkle = 1.0 + 0.10 * sin(glowTime * 0.9 + vGlowPhase)
        + 0.035 * sin(glowTime * 1.6 + vGlowPhase * 1.7);
      float chase = ${chase ? "0.05 * sin(glowTime * 0.3 - vGlowPhase * 0.25)" : "0.0"};
      outgoingLight *= 5.0 * (twinkle + chase);
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => `fairy-glow-v1-${chase}`;
}

export function createGlowAnimation(scene: Scene, reducedMotion: boolean) {
  const times: { value: number }[] = [];
  const emissives = new Set<MeshStandardMaterial>();
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material.userData.glowTime) times.push(material.userData.glowTime);
      if (material.name === "star-glow" || material.name === "lantern-flame") emissives.add(material as MeshStandardMaterial);
    }
  });
  const materials = [...emissives];
  const update = (time: number) => {
    for (const uniform of times) uniform.value = time;
    for (let i = 0; i < materials.length; i++) {
      const material = materials[i];
      material.emissiveIntensity = (material.name === "star-glow" ? 4.5 : 5) * glowPulse(time, i * 2.1);
    }
  };
  update(0);
  return { update(time: number) { if (!reducedMotion) update(time); } };
}

export function createBloom(renderer: WebGLRenderer, scene: Scene, camera: Camera, enabled?: boolean) {
  if (!(enabled ?? defaultBloom(window.devicePixelRatio, navigator.hardwareConcurrency ?? 4))) return null;
  const composer = new EffectComposer(renderer);
  // Bound the full-screen blur cost on high-DPI displays. Scene geometry is unchanged.
  composer.setPixelRatio(Math.min(renderer.getPixelRatio(), 1.5));
  const render = new RenderPass(scene, camera);
  // Linear HDR threshold: ordinary white snow remains below it; light cores exceed it.
  const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.65, 0.45, 1.8);
  // Preserve the source canvas alpha while adding light, including the CSS backdrop.
  bloom.blendMaterial.blending = CustomBlending;
  bloom.blendMaterial.blendSrc = OneFactor;
  bloom.blendMaterial.blendDst = OneFactor;
  bloom.blendMaterial.blendSrcAlpha = ZeroFactor;
  bloom.blendMaterial.blendDstAlpha = OneFactor;
  const output = new OutputPass();
  // OutputPass applies the same renderer ACES exposure and sRGB conversion once.
  composer.addPass(render);
  composer.addPass(bloom);
  composer.addPass(output);
  return {
    render() { composer.render(); },
    resize(width: number, height: number) { composer.setSize(width, height); },
    dispose() { render.dispose(); bloom.dispose(); output.dispose(); composer.dispose(); },
  };
}
