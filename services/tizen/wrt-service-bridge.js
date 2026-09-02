import * as service from "wrt:service";

// Samsung documents wrt:service as a module API. Keep its namespace outside
// the application bundle so the TV module loader resolves the built-in scheme.
if (typeof window !== "undefined") {
  window.__NUVIO_TIZEN_WRT_SERVICE__ = service;
}
