import assert from "node:assert/strict";
import test from "node:test";

import { mapWithConcurrency } from "./mapWithConcurrency.js";

test("preserves input order while bounding concurrent work", async () => {
  let active = 0;
  let peak = 0;

  const result = await mapWithConcurrency(
    Array.from({ length: 12 }, (_, index) => index),
    4,
    async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, value % 3));
      active -= 1;
      return value * 2;
    }
  );

  assert.equal(peak, 4);
  assert.deepEqual(
    result,
    Array.from({ length: 12 }, (_, index) => index * 2)
  );
});
