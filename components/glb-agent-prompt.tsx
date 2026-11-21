"use client";

import { useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";

export const GLB_AGENT_PROMPT = `Use the Rhino MCP connector to prepare my selected ornament for the Adv Geometry community Christmas tree.

1. Work on a copy of the selected ornament only. Leave my original model unchanged. Exclude all other scene objects, construction geometry, lights, cameras, curves, and point objects from the export.
2. Check the Rhino document units. Keep the ornament at true physical size and within 4 × 4 × 4 inches (101.6 mm per side), including its hanging loop. If it is too large, ask before scaling it down.
3. Create a lightweight static triangle mesh with at most 8,000 triangles total and at most 4 materials. Use solid-color PBR materials with metallic/roughness settings. Do not embed textures or images, animation, skins, or unsupported material extensions. Keep the shape recognizable and check the meshing quality.
4. Export the ornament as one self-contained glTF 2.0 binary (.glb), not .gltf or .3dm. Use Rhino's GLB exporter when available; enable "Map Rhino Z to glTF Y" and export materials. The result must be Y-up and use metres, as required by glTF. Standard core glTF is preferred; only EXT_meshopt_compression and KHR_mesh_quantization extensions are accepted.
5. Keep the file at or below 512 KiB (524,288 bytes). Simplify the mesh if necessary and verify the final file. The website hangs the ornament from the top centre of its bounding box, so orient its intended hanging loop at the top; no eyelet point or special layer is needed.
6. Save it as ornament.glb in a location I can access. Report the full file path, file size, triangle count, material count, and physical dimensions. If your tools cannot export or verify a requirement, explain what remains instead of claiming it is done.

I will upload the GLB on the website and add my name and optional holiday message there.`;

export function GlbAgentPrompt() {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(GLB_AGENT_PROMPT);
      setCopied(true);
      setError(false);
    } catch {
      setError(true);
    }
  }

  return (
    <aside className="rounded-3xl border border-[#785e25]/15 bg-[#fffaf0] p-6 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#947943]">Made with your agent</p>
      <h2 className="mt-2 font-serif text-2xl font-bold text-[#563f16]">Let Claude wrap it up.</h2>
      <p className="mt-3 text-sm leading-6 text-[#6e6040]">Select your ornament in Rhino, connect Claude to Rhino MCP, and paste this prompt. Your agent will prepare a GLB you can upload here.</p>
      <button type="button" onClick={() => void copyPrompt()}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#174b3a] px-4 py-3 text-sm font-semibold text-white hover:bg-[#235d48] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174b3a]">
        {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
        {copied ? "Copied — paste into Claude" : "Copy prompt for Claude"}
      </button>
      <p role="status" className="sr-only">{copied ? "Prompt copied to clipboard." : ""}</p>
      <details open={error || undefined} className="group mt-5 border-t border-[#8c6d29]/15 pt-4 text-sm text-[#6e6040]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded font-semibold text-[#563f16] focus-visible:outline-2 focus-visible:outline-[#bd3d30]">
          Read or select the prompt <ChevronDown className="size-4 shrink-0 transition group-open:rotate-180" aria-hidden="true" />
        </summary>
        {error && <p role="alert" className="mt-3 text-xs text-[#a6382d]">Copy is unavailable in this browser. Select and copy the prompt below.</p>}
        <textarea readOnly aria-label="Prompt for your Rhino agent" value={GLB_AGENT_PROMPT}
          onFocus={(event) => event.currentTarget.select()}
          className="mt-3 min-h-80 w-full resize-y rounded-xl border border-[#8c6d29]/20 bg-white/80 p-3 text-xs leading-6 text-[#563f16] focus:outline-2 focus:outline-[#174b3a]" />
      </details>
      <p className="mt-4 text-xs leading-5 text-[#7b7058]">4″ maximum · 512 KiB · 8,000 triangles · 4 solid-color materials. You can check the preview before sharing.</p>
    </aside>
  );
}
