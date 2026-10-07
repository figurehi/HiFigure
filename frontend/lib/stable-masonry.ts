export type StableMasonryEntry<T> = {
  item: T;
  index: number;
};

/**
 * Splits an append-only list into explicit columns.
 *
 * Existing entries keep the same column when more entries are appended. This
 * avoids the full-list rebalancing performed by CSS multi-column layout.
 */
export function partitionStableMasonry<T>(
  items: readonly T[],
  columnCount: number,
): StableMasonryEntry<T>[][] {
  if (!Number.isInteger(columnCount) || columnCount < 1) {
    throw new RangeError("columnCount must be a positive integer");
  }

  const columns = Array.from(
    { length: columnCount },
    () => [] as StableMasonryEntry<T>[],
  );

  items.forEach((item, index) => {
    columns[index % columnCount].push({ item, index });
  });

  return columns;
}
