import assert from "node:assert/strict";
import test from "node:test";

import { buildSearchTargets } from "./searchCatalogTargets.js";

test("buildSearchTargets accepts every catalog type that supports search", () => {
  const addons = [
    {
      baseUrl: "https://example.com/manifest.json",
      id: "localized-addon",
      displayName: "Localized Addon",
      catalogs: [
        {
          id: "films",
          name: "Filme",
          apiType: "Film",
          extra: [{ name: "search" }]
        },
        {
          id: "series",
          name: "Serien",
          apiType: "Serie",
          extra: [{ name: "SEARCH" }, { name: "skip" }]
        },
        {
          id: "ai-search",
          name: "AI Search",
          apiType: "other",
          extra: [{ name: "search", isRequired: true }]
        },
        {
          id: "browse-only",
          name: "Browse Only",
          apiType: "movie",
          extra: [{ name: "genre" }]
        }
      ]
    }
  ];

  assert.deepEqual(
    buildSearchTargets(addons).map(({ catalogId, type, supportsSkip }) => ({
      catalogId,
      type,
      supportsSkip
    })),
    [
      { catalogId: "films", type: "Film", supportsSkip: false },
      { catalogId: "series", type: "Serie", supportsSkip: true },
      { catalogId: "ai-search", type: "other", supportsSkip: false }
    ]
  );
});
