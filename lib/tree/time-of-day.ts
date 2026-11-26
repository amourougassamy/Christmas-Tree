/** Clock-local, season-independent art direction; all colours are sRGB hex. */
export type TimeOfDayLook = {
  brightness: number; saturation: number; overlay: string; overlayOpacity: number;
  ambient: string; ambientIntensity: number; sky: string; ground: string;
  hemisphereIntensity: number; key: string; keyIntensity: number; nightFactor: number;
};
type Frame = TimeOfDayLook & { minute: number };
export const TIME_OF_DAY_KEYFRAMES: readonly Frame[] = [
  { minute: 300, brightness: 0.55, saturation: 0.7, overlay: "#203d78", overlayOpacity: 0.35, ambient: "#849bc7", ambientIntensity: 0.35, sky: "#889fca", ground: "#394965", hemisphereIntensity: 0.5, key: "#9bb5e0", keyIntensity: 0.65, nightFactor: 0.85 },
  { minute: 540, brightness: 1.2, saturation: 0.65, overlay: "#dceeff", overlayOpacity: 0.22, ambient: "#d7e6ff", ambientIntensity: 0.75, sky: "#deefff", ground: "#8795a4", hemisphereIntensity: 1, key: "#fff0db", keyIntensity: 2, nightFactor: 0.1 },
  { minute: 780, brightness: 1.4, saturation: 0.45, overlay: "#e8f5ff", overlayOpacity: 0.28, ambient: "#e4efff", ambientIntensity: 0.85, sky: "#dceeff", ground: "#9ba7af", hemisphereIntensity: 1.1, key: "#fff9ed", keyIntensity: 2.3, nightFactor: 0 },
  { minute: 960, brightness: 1.12, saturation: 0.85, overlay: "#ffc78c", overlayOpacity: 0.18, ambient: "#d6c5c4", ambientIntensity: 0.6, sky: "#dcc9cf", ground: "#837783", hemisphereIntensity: 0.85, key: "#ffbd79", keyIntensity: 2, nightFactor: 0.3 },
  { minute: 1050, brightness: 1, saturation: 1, overlay: "#000000", overlayOpacity: 0, ambient: "#b2b6d4", ambientIntensity: 0.5, sky: "#b9bddd", ground: "#636b83", hemisphereIntensity: 0.75, key: "#efb58b", keyIntensity: 1.65, nightFactor: 0.65 },
  { minute: 1320, brightness: 0.38, saturation: 0.65, overlay: "#10295c", overlayOpacity: 0.55, ambient: "#667fab", ambientIntensity: 0.25, sky: "#728bbd", ground: "#283650", hemisphereIntensity: 0.4, key: "#98b4e5", keyIntensity: 0.65, nightFactor: 1 },
];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function colour(a: string, b: string, t: number) {
  return "#" + [1, 3, 5].map((offset) => Math.round(mix(parseInt(a.slice(offset, offset + 2), 16), parseInt(b.slice(offset, offset + 2), 16), t)).toString(16).padStart(2, "0")).join("");
}
export function getTimeOfDay(date: Date): TimeOfDayLook {
  const minute = date.getHours() * 60 + date.getMinutes();
  if (!Number.isFinite(minute)) throw new RangeError("A valid local date is required");
  const frames = TIME_OF_DAY_KEYFRAMES;
  const next = frames.findIndex((frame) => frame.minute > minute);
  const a = frames[(next === -1 ? frames.length : next || frames.length) - 1];
  const b = frames[next === -1 ? 0 : next];
  const span = (b.minute - a.minute + 1440) % 1440;
  const fraction = ((minute - a.minute + 1440) % 1440) / span;
  const t = fraction * fraction * (3 - 2 * fraction);
  return {
    brightness: mix(a.brightness, b.brightness, t), saturation: mix(a.saturation, b.saturation, t),
    overlay: colour(a.overlay, b.overlay, t), overlayOpacity: mix(a.overlayOpacity, b.overlayOpacity, t),
    ambient: colour(a.ambient, b.ambient, t), ambientIntensity: mix(a.ambientIntensity, b.ambientIntensity, t),
    sky: colour(a.sky, b.sky, t), ground: colour(a.ground, b.ground, t),
    hemisphereIntensity: mix(a.hemisphereIntensity, b.hemisphereIntensity, t),
    key: colour(a.key, b.key, t), keyIntensity: mix(a.keyIntensity, b.keyIntensity, t), nightFactor: mix(a.nightFactor, b.nightFactor, t),
  };
}
/** Invalid preview parameters fall back to the real clock. */
export function previewTime(value: string | null, now = new Date()): Date {
  const date = new Date(now);
  if (value && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    const [hour, minute] = value.split(":").map(Number);
    date.setHours(hour, minute, 0, 0);
  }
  return date;
}
