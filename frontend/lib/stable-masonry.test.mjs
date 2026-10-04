import assert from "node:assert/strict";
import test from "node:test";

import { partitionStableMasonry } from "./stable-masonry.ts";

function assignments(items, columnCount) {
  return new Map(
    partitionStableMasonry(items, columnCount).flatMap((column, columnIndex) =>
      column.map(({ item }) => [item, columnIndex]),
    ),
  );
}

test("appending items does not move existing masonry entries between columns", () => {
  const initial = ["a", "b", "c", "d", "e", "f"];
  const before = assignments(initial, 3);
  const after = assignments([...initial, "g", "h", "i", "j"], 3);

  for (const item of initial) {
    assert.equal(after.get(item), before.get(item));
  }
});

test("keeps each column in source order and preserves source indexes", () => {
  assert.deepEqual(partitionStableMasonry(["a", "b", "c", "d", "e"], 2), [
    [{ item: "a", index: 0 }, { item: "c", index: 2 }, { item: "e", index: 4 }],
    [{ item: "b", index: 1 }, { item: "d", index: 3 }],
  ]);
});

test("rejects invalid column counts", () => {
  assert.throws(() => partitionStableMasonry(["a"], 0), RangeError);
  assert.throws(() => partitionStableMasonry(["a"], 1.5), RangeError);
});
