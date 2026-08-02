import assert from "node:assert/strict";
import test from "node:test";

import {
  CW_DISPLAY_SNAPSHOT_MAX_ITEMS,
  CW_INITIAL_RESOLVE_BUDGET_MS,
  CW_MAX_ENRICHMENT_CONCURRENCY,
  CW_MAX_NEXT_UP_LOOKUPS,
  CW_MAX_VISIBLE_ITEMS,
  CW_RENDER_BATCH_ITEMS_CONSTRAINED,
  CW_RENDER_BATCH_ITEMS_DEFAULT,
  CW_RENDER_BATCH_ITEMS_LEGACY_TV,
  CW_RENDER_LOAD_AHEAD_ITEMS
} from "./homeConstants.js";

test("Continue Watching limits match the Android TV contract", () => {
  assert.equal(CW_MAX_VISIBLE_ITEMS, 300);
  assert.equal(CW_MAX_NEXT_UP_LOOKUPS, 32);
  assert.equal(CW_MAX_ENRICHMENT_CONCURRENCY, 4);
});

test("the warm-start snapshot remains bounded for TV storage", () => {
  assert.ok(CW_DISPLAY_SNAPSHOT_MAX_ITEMS > 0);
  assert.ok(CW_DISPLAY_SNAPSHOT_MAX_ITEMS < CW_MAX_VISIBLE_ITEMS);
});

test("slow-TV rendering stays incremental and cannot block Home indefinitely", () => {
  assert.ok(CW_INITIAL_RESOLVE_BUDGET_MS > 0);
  assert.ok(CW_RENDER_BATCH_ITEMS_LEGACY_TV < CW_RENDER_BATCH_ITEMS_CONSTRAINED);
  assert.ok(CW_RENDER_BATCH_ITEMS_CONSTRAINED < CW_RENDER_BATCH_ITEMS_DEFAULT);
  assert.ok(CW_RENDER_BATCH_ITEMS_DEFAULT < CW_MAX_VISIBLE_ITEMS);
  assert.ok(CW_RENDER_LOAD_AHEAD_ITEMS < CW_RENDER_BATCH_ITEMS_LEGACY_TV);
});
