import assert from "node:assert/strict";
import test from "node:test";

import {
  getContinueWatchingRenderItems,
  shouldAppendContinueWatchingItems
} from "./continueWatchingRenderWindow.js";

test("mounts only the requested Continue Watching window", () => {
  const items = Array.from({ length: 300 }, (_, index) => index);
  assert.deepEqual(
    getContinueWatchingRenderItems(items, 12),
    Array.from({ length: 12 }, (_, index) => index)
  );
});

test("loads ahead near the mounted edge without exceeding the available data", () => {
  assert.equal(
    shouldAppendContinueWatchingItems({
      focusedIndex: 8,
      mountedCount: 12,
      totalCount: 300,
      loadAheadItems: 4
    }),
    true
  );
  assert.equal(
    shouldAppendContinueWatchingItems({
      focusedIndex: 3,
      mountedCount: 12,
      totalCount: 300,
      loadAheadItems: 4
    }),
    false
  );
  assert.equal(
    shouldAppendContinueWatchingItems({
      focusedIndex: 11,
      mountedCount: 12,
      totalCount: 12,
      loadAheadItems: 4,
      force: true
    }),
    false
  );
});
