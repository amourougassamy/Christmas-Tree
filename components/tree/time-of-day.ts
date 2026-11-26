import { getTimeOfDay, previewTime } from "../../lib/tree/time-of-day";
import type { TreeScene } from "./tree-scene";

/** One clock read per minute; no React renders or frame-loop work. */
export function followLocalClock(scene: TreeScene, mount: HTMLElement) {
  const backdrop = mount.closest<HTMLElement>(".tree-backdrop");
  const forcedTime = new URLSearchParams(window.location.search).get("time");
  const update = () => {
    const look = getTimeOfDay(previewTime(forcedTime));
    scene.setTimeOfDay(look);
    backdrop?.style.setProperty("--sky-filter", `brightness(${look.brightness}) saturate(${look.saturation})`);
    backdrop?.style.setProperty("--sky-overlay", look.overlay);
    backdrop?.style.setProperty("--sky-opacity", String(look.overlayOpacity));
  };
  update();
  const timer = window.setInterval(update, 60_000);
  return () => window.clearInterval(timer);
}
