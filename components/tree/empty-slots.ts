import { InstancedBufferAttribute, MeshPhysicalMaterial, type BufferGeometry } from "three";

/** One attribute and one shared material: clear empty slots, opaque occupied fallbacks. */
export function createSlotMaterial(geometry: BufferGeometry, count: number) {
  const occupied = new InstancedBufferAttribute(new Float32Array(count), 1);
  geometry.setAttribute("slotOccupied", occupied);
  const material = new MeshPhysicalMaterial({
    color: "#ffffff", emissive: "#e9b955", emissiveIntensity: 0.16,
    clearcoat: 0.65, roughness: 0.3, metalness: 0.08,
    transparent: true, depthWrite: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = "attribute float slotOccupied; varying float vSlotOccupied;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvSlotOccupied = slotOccupied;");
    shader.fragmentShader = "varying float vSlotOccupied;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
      float rim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0);
      if (vSlotOccupied < 0.5) {
        outgoingLight = vec3(0.73, 0.87, 0.91) * (0.55 + rim * 0.45);
        diffuseColor.a = 0.025 + rim * 0.24;
      }
      #include <opaque_fragment>
    `);
  };
  return {
    material,
    setOccupied(index: number, value: boolean) {
      if (occupied.getX(index) === Number(value)) return false;
      occupied.setX(index, Number(value));
      occupied.needsUpdate = true;
      return true;
    },
  };
}
