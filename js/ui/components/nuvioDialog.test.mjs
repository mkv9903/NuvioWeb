import assert from "node:assert/strict";
import test from "node:test";

import { NuvioDialog } from "./nuvioDialog.js";

test("runs afterExit after the modal focus lock is removed", async () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  let modalOpen = true;

  const classList = {
    add() {},
    remove() {}
  };
  const backdrop = {
    classList,
    remove() {}
  };
  const panel = { classList };

  globalThis.window = {
    addEventListener() {},
    removeEventListener() {}
  };
  globalThis.document = {
    body: {
      classList: {
        remove(name) {
          if (name === "nuvio-modal-open") modalOpen = false;
        }
      }
    },
    querySelector() {
      return null;
    }
  };

  try {
    const dialog = new NuvioDialog({ title: "Test" });
    dialog._backdrop = backdrop;
    dialog._panel = panel;

    await new Promise((resolve) => {
      dialog.destroy({
        afterExit: () => {
          assert.equal(modalOpen, false);
          resolve();
        }
      });
    });
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});
