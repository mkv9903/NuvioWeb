import assert from "node:assert/strict";
import test from "node:test";

import { activatePosterOption, getPosterOptions, posterItemFromNode } from "./posterOptionsMenu.js";
import { watchedSeriesReconciliationService } from "../../data/repository/watchedSeriesReconciliationService.js";

test("preserves addon origin when building a poster options item", () => {
  const item = posterItemFromNode({
    dataset: {
      itemId: "tt123",
      itemType: "series",
      itemTitle: "Example",
      posterSrc: "poster.jpg",
      backdropSrc: "backdrop.jpg",
      addonBaseUrl: "https://example.com/manifest.json",
      addonId: "example",
      addonName: "Example Addon",
      catalogType: "series"
    }
  });

  assert.deepEqual(item, {
    id: "tt123",
    type: "series",
    title: "Example",
    poster: "poster.jpg",
    background: "backdrop.jpg",
    addonBaseUrl: "https://example.com/manifest.json",
    addonId: "example",
    addonName: "Example Addon",
    catalogType: "series"
  });
});

test("offers watched state changes for series like Android TV", () => {
  const options = getPosterOptions(
    {
      item: { id: "tt123", type: "series", title: "Example" },
      sourceMode: "local",
      isSaved: false,
      isWatched: false
    },
    { includeLibrary: false }
  );

  assert.equal(
    options.some((option) => option.action === "toggleWatched"),
    true
  );
  assert.equal(watchedSeriesReconciliationService.isSeriesType("anime"), true);
});

test("does not offer watched state changes for unsupported content types", () => {
  const options = getPosterOptions(
    {
      item: { id: "channel-1", type: "channel", title: "Example Channel" },
      sourceMode: "local",
      isSaved: false,
      isWatched: false
    },
    { includeLibrary: false }
  );

  assert.equal(
    options.some((option) => option.action === "toggleWatched"),
    false
  );
});

test("uses series reconciliation when marking a series watched", async () => {
  const originalMarkSeriesWatched = watchedSeriesReconciliationService.markSeriesWatched;
  let received = null;
  watchedSeriesReconciliationService.markSeriesWatched = async (...args) => {
    received = args;
    return true;
  };

  try {
    const result = await activatePosterOption(
      {
        item: { id: "tt123", type: "anime", title: "Example Anime" },
        isWatched: false
      },
      "toggleWatched"
    );

    assert.deepEqual(received, ["tt123", "anime", { title: "Example Anime" }]);
    assert.equal(result.type, "updated");
    assert.equal(result.state.isWatched, true);
  } finally {
    watchedSeriesReconciliationService.markSeriesWatched = originalMarkSeriesWatched;
  }
});
