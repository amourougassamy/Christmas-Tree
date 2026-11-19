export type TreeAnchor = {
  slot: number;
  position: readonly [number, number, number];
  rotationY: number;
  scale: number;
};

export const TREE_SLOT_COUNT = 60;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function createTreeAnchors(count = TREE_SLOT_COUNT): TreeAnchor[] {
  return Array.from({ length: count }, (_, index) => {
    const progress = (index + 0.5) / count;
    const y = 3.45 - progress * 6.45;
    const crownRadius = 0.58 + progress * 2.5;
    const angle = index * GOLDEN_ANGLE + Math.sin(index * 12.9898) * 0.08;

    return {
      slot: index + 1,
      position: [
        Math.cos(angle) * crownRadius,
        y,
        Math.sin(angle) * crownRadius,
      ] as const,
      rotationY: -angle + Math.PI / 2,
      scale: 0.82 + ((index * 17) % 9) / 50,
    };
  });
}

export const TREE_ANCHORS = createTreeAnchors();
