import assert from "node:assert/strict";
import test from "node:test";

import {
  getLatestAppUpdate,
  isRemoteAppVersionNewer,
  normalizeAppVersion,
  parseAppVersionParts,
  parseLatestRelease
} from "./appUpdateService.js";

test("normalizes and compares release versions like Android TV", () => {
  assert.equal(normalizeAppVersion(" v0.3.27-beta "), "0.3.27-beta");
  assert.deepEqual(parseAppVersionParts("0.3.27-beta"), [0, 3, 27]);
  assert.equal(isRemoteAppVersionNewer("0.3.27-beta", "0.3.26"), true);
  assert.equal(isRemoteAppVersionNewer("0.3.26-beta", "0.3.26"), false);
  assert.equal(isRemoteAppVersionNewer("0.3.25", "0.3.26"), false);
});

test("rejects draft and prerelease GitHub releases", () => {
  assert.equal(parseLatestRelease({ tag_name: "0.3.27", draft: true }), null);
  assert.equal(parseLatestRelease({ tag_name: "0.3.27", prerelease: true }), null);
});

test("returns GitHub notes only when the latest release is newer", async () => {
  const release = {
    tag_name: "0.3.27-beta",
    name: "Beta 0.3.27",
    body: "Latest fixes",
    html_url: "https://github.com/NuvioMedia/NuvioWeb/releases/tag/0.3.27-beta",
    draft: false,
    prerelease: false
  };
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    async json() {
      return release;
    }
  });

  assert.deepEqual(
    await getLatestAppUpdate({
      currentVersion: "0.3.26",
      fetchImpl
    }),
    {
      tag: "0.3.27-beta",
      title: "Beta 0.3.27",
      notes: "Latest fixes",
      releaseUrl: release.html_url
    }
  );
  assert.equal(
    await getLatestAppUpdate({
      currentVersion: "0.3.27",
      fetchImpl
    }),
    null
  );
});
