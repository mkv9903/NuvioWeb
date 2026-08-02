import assert from "node:assert/strict";
import test from "node:test";

import { normalizeEpisodeImdbRating, parseEpisodeRuntimeMinutes } from "./episodeCardMetadata.js";

test("keeps numeric episode runtimes", () => {
  assert.equal(parseEpisodeRuntimeMinutes(52), 52);
  assert.equal(parseEpisodeRuntimeMinutes("48"), 48);
});

test("parses addon episode runtime labels like Android TV", () => {
  assert.equal(parseEpisodeRuntimeMinutes("1h 05m"), 65);
  assert.equal(parseEpisodeRuntimeMinutes("42 min"), 42);
  assert.equal(parseEpisodeRuntimeMinutes("1h"), 60);
});

test("returns zero when an episode runtime is missing or invalid", () => {
  assert.equal(parseEpisodeRuntimeMinutes(null), 0);
  assert.equal(parseEpisodeRuntimeMinutes("unknown"), 0);
});

test("shows only positive IMDb episode ratings like Android TV", () => {
  assert.equal(normalizeEpisodeImdbRating("8.4"), 8.4);
  assert.equal(normalizeEpisodeImdbRating(0), null);
  assert.equal(normalizeEpisodeImdbRating("unknown"), null);
});
