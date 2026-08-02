import assert from "node:assert/strict";
import test from "node:test";

import { Platform } from "../../platform/index.js";
import { FocusEngine } from "./focusEngine.js";
import { Router } from "./router.js";

function keyEvent({ type, repeat = false }) {
  return {
    type,
    key: "Enter",
    code: "Enter",
    keyCode: 13,
    which: 13,
    repeat,
    preventDefault() {},
    stopPropagation() {},
    stopImmediatePropagation() {}
  };
}

test("a fresh keydown replaces stale duration left by a modal", () => {
  const originalDocument = globalThis.document;
  const originalDateNow = Date.now;
  const originalPlatform = Platform.current;
  const originalGetCurrentScreen = Router.getCurrentScreen;
  let now = 10_000;
  let releasedDuration = null;

  globalThis.document = {
    body: {
      classList: {
        contains() {
          return false;
        }
      }
    },
    contains() {
      return true;
    }
  };
  Date.now = () => now;
  Platform.current = {
    name: "tizen",
    normalizeKey(event) {
      return {
        key: event.key,
        code: event.code,
        keyName: "",
        keyCode: event.keyCode,
        originalKeyCode: event.keyCode
      };
    },
    isBackEvent() {
      return false;
    }
  };
  Router.getCurrentScreen = () => ({
    onKeyDown() {},
    onKeyUp(event) {
      releasedDuration = event.keyDownDurationMs;
    }
  });
  FocusEngine.activeKeyDownStartedAt = new Map([["code:13", 1_000]]);

  try {
    FocusEngine.handleKey(keyEvent({ type: "keydown" }));
    now = 10_040;
    FocusEngine.handleKeyUp(keyEvent({ type: "keyup" }));

    assert.equal(releasedDuration, 40);
    assert.equal(FocusEngine.activeKeyDownStartedAt.has("code:13"), false);
  } finally {
    FocusEngine.activeKeyDownStartedAt.clear();
    Router.getCurrentScreen = originalGetCurrentScreen;
    Platform.current = originalPlatform;
    Date.now = originalDateNow;
    globalThis.document = originalDocument;
  }
});

test("a keyup observed while a modal is active clears its duration", () => {
  const originalDocument = globalThis.document;
  const originalPlatform = Platform.current;

  globalThis.document = {
    body: {
      classList: {
        contains(name) {
          return name === "nuvio-modal-open";
        }
      }
    },
    contains() {
      return true;
    }
  };
  Platform.current = {
    name: "tizen",
    normalizeKey(event) {
      return {
        key: event.key,
        code: event.code,
        keyName: "",
        keyCode: event.keyCode,
        originalKeyCode: event.keyCode
      };
    }
  };
  FocusEngine.activeKeyDownStartedAt = new Map([["code:13", 1_000]]);

  try {
    FocusEngine.handleKeyUp(keyEvent({ type: "keyup" }));
    assert.equal(FocusEngine.activeKeyDownStartedAt.has("code:13"), false);
  } finally {
    FocusEngine.activeKeyDownStartedAt.clear();
    Platform.current = originalPlatform;
    globalThis.document = originalDocument;
  }
});
