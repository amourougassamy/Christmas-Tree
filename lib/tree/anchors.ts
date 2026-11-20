export type TreeAnchor = {
  slot: number;
  position: readonly [number, number, number];
  rotationY: number;
  scale: number;
};

export const TREE_SLOT_COUNT = 60;
const ORNAMENTS_PER_RIDGE = [4, 6, 8, 9, 10, 11, 12] as const;
const RIDGE_COUNT = ORNAMENTS_PER_RIDGE.length;
const LOWEST_CONE_CENTER = -2.25;
const CONE_CENTER_STEP = 0.93;
const CONE_HALF_HEIGHT = 2.45 / 2;
const LOWEST_CONE_RADIUS = 3.55;
const CONE_RADIUS_STEP = 0.36;

export function createTreeAnchors(count = TREE_SLOT_COUNT): TreeAnchor[] {
  const anchors: TreeAnchor[] = [];

  // Work from the top ridge down, keeping the original one-based slot order.
  // A small radial offset prevents models from intersecting the foliage.
  for (let ridge = 0; ridge < RIDGE_COUNT && anchors.length < count; ridge += 1) {
    const coneLayer = RIDGE_COUNT - 1 - ridge;
    const ridgeCapacity = ORNAMENTS_PER_RIDGE[ridge];
    const y = LOWEST_CONE_CENTER + coneLayer * CONE_CENTER_STEP - CONE_HALF_HEIGHT - 0.03;
    const radius = LOWEST_CONE_RADIUS - coneLayer * CONE_RADIUS_STEP + 0.08;
    const stagger = ridge % 2 === 0 ? 0 : Math.PI / ridgeCapacity;

    for (let index = 0; index < ridgeCapacity && anchors.length < count; index += 1) {
      const angle = (index / ridgeCapacity) * Math.PI * 2 + stagger;
      const slot = anchors.length + 1;
      anchors.push({
        slot,
        position: [Math.cos(angle) * radius, y, Math.sin(angle) * radius],
        rotationY: -angle + Math.PI / 2,
        scale: 0.82 + (((slot - 1) * 17) % 9) / 50,
      });
    }
  }

  return anchors;
}

export const TREE_ANCHORS = createTreeAnchors();
