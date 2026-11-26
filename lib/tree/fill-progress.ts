/** Shared visible and screen-reader wording for the finite ornament slots. */
export function treeFillProgress(count: number, total: number) {
  const capacity = Math.max(0, Math.floor(total));
  const decorated = Math.min(capacity, Math.max(0, Math.floor(count)));
  const label = capacity > 0 && decorated === capacity
    ? "Every branch decorated!"
    : `${decorated} of ${capacity} ${capacity === 1 ? "branch" : "branches"} decorated`;
  return { decorated, total: capacity, percent: capacity ? decorated / capacity * 100 : 0, label };
}
