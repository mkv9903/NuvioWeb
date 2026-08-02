import assert from "node:assert/strict";
import test from "node:test";

import { shouldEnterStillWatchingPrompt } from "./playerNextEpisodeRules.js";

test("still-watching prompt mirrors the Android autoplay gate", () => {
  const eligible = {
    stillWatchingEnabled: true,
    autoPlayNextEpisodeEnabled: true,
    nextEpisodeHasAired: true,
    consecutiveAutoPlayCount: 3,
    threshold: 3
  };

  assert.equal(shouldEnterStillWatchingPrompt(eligible), true);
  assert.equal(shouldEnterStillWatchingPrompt({ ...eligible, stillWatchingEnabled: false }), false);
  assert.equal(
    shouldEnterStillWatchingPrompt({ ...eligible, autoPlayNextEpisodeEnabled: false }),
    false
  );
  assert.equal(shouldEnterStillWatchingPrompt({ ...eligible, nextEpisodeHasAired: false }), false);
  assert.equal(shouldEnterStillWatchingPrompt({ ...eligible, consecutiveAutoPlayCount: 2 }), false);
});

test("still-watching prompt accepts the configured threshold boundary", () => {
  assert.equal(
    shouldEnterStillWatchingPrompt({
      stillWatchingEnabled: true,
      autoPlayNextEpisodeEnabled: true,
      nextEpisodeHasAired: true,
      consecutiveAutoPlayCount: 2,
      threshold: 2
    }),
    true
  );
});
