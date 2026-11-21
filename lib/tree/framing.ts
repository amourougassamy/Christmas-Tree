/**
 * Pick a camera distance so a set of points (the tree's silhouette, swept
 * around its axis because it spins) fits inside a fraction of the viewport.
 * The camera sits on +Z, raised by `elevation` radians, looking at `target`.
 */
export type FramingOptions = {
  fovY: number; // radians
  aspect: number;
  targetY: number;
  elevation: number;
  /** Largest fraction of the viewport height / width the points may cover. */
  maxHeightFraction: number;
  maxWidthFraction: number;
};

export type Point = readonly [number, number, number];

/** Projected NDC extents (-1..1) of `points` seen from distance `d`. */
export function projectExtents(points: readonly Point[], d: number, options: FramingOptions) {
  const { fovY, aspect, targetY, elevation } = options;
  const tanY = Math.tan(fovY / 2);
  const cos = Math.cos(elevation);
  const sin = Math.sin(elevation);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y, z] of points) {
    // Camera frame: forward = -(0, sin, cos) pointing at target, up = (0, cos, -sin).
    const ry = y - targetY;
    const depth = d - (z * cos + ry * sin);
    const up = ry * cos - z * sin;
    const ndcY = up / (depth * tanY);
    const ndcX = x / (depth * tanY * aspect);
    minX = Math.min(minX, ndcX); maxX = Math.max(maxX, ndcX);
    minY = Math.min(minY, ndcY); maxY = Math.max(maxY, ndcY);
  }
  return { minX, maxX, minY, maxY };
}

export function fitDistance(points: readonly Point[], options: FramingOptions): number {
  const fits = (d: number) => {
    const e = projectExtents(points, d, options);
    return (
      Math.max(Math.abs(e.minY), Math.abs(e.maxY)) <= options.maxHeightFraction &&
      Math.max(Math.abs(e.minX), Math.abs(e.maxX)) <= options.maxWidthFraction
    );
  };
  let low = 1;
  let high = 400;
  for (let i = 0; i < 50; i += 1) {
    const mid = (low + high) / 2;
    if (fits(mid)) high = mid;
    else low = mid;
  }
  return high;
}

/** Sweep each (radius, y) ring around the axis into points. */
export function sweepRings(rings: readonly (readonly [radius: number, y: number])[], segments = 32): Point[] {
  const points: Point[] = [];
  for (const [radius, y] of rings) {
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      points.push([Math.sin(a) * radius, y, Math.cos(a) * radius]);
    }
  }
  return points;
}
