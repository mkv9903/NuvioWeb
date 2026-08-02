import assert from "node:assert/strict";
import test from "node:test";

import { mapRatingsPayload } from "./imdbEpisodeRatingsRepository.js";

test("maps episode IMDb ratings by season and episode", () => {
  assert.deepEqual(
    mapRatingsPayload([
      {
        episodes: [
          { season_number: 1, episode_number: 2, vote_average: 8.46 },
          { season_number: 1, episode_number: 1, vote_average: 7.94 }
        ]
      }
    ]),
    {
      1: [
        { episode: 1, rating: 7.9 },
        { episode: 2, rating: 8.5 }
      ]
    }
  );
});

test("keeps ratings for season zero specials like Android TV", () => {
  assert.deepEqual(
    mapRatingsPayload([
      {
        episodes: [{ season_number: 0, episode_number: 1, vote_average: 7.2 }]
      }
    ]),
    {
      0: [{ episode: 1, rating: 7.2 }]
    }
  );
});
