import { Platform } from "../index.js";
import { TizenCapabilities } from "./tizenCapabilities.js";
import { TizenEngineFsService } from "./tizenEngineFsService.js";
import { getTizenServiceIdCandidates } from "./tizenServiceIds.js";

const LOCAL_BASE_URLS = [
  "http://127.0.0.1:2711",
  "http://localhost:2711",
  "http://127.0.0.1:11471",
  "http://localhost:11471"
];
const START_TIMEOUT_MS = 12000;
const PROBE_TIMEOUT_MS = 2500;
const SERVICE_START_CALL_TIMEOUT_MS = 4000;
// A Web Service start acknowledgement only means that Tizen queued the
// service. Give the lightweight runtime enough time to initialize on a cold
// TV boot, while keeping the same overall startup budget as EngineFS.
const START_ATTEMPT_HEALTH_TIMEOUT_MS = 8500;
const DEFAULT_OPERATION = "http://tizen.org/appcontrol/operation/default";
const PLUGIN_SERVICE_NAME = "nuvio-plugin-network";
const PLUGIN_PROTOCOL_VERSION = 1;
let startPromise = null;
let wrtServiceModulePromise = null;

function withTimeout(promise, timeoutMs, message) {
  let timer = 0;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function serviceIds() {
  return getTizenServiceIdCandidates("PluginService", {
    configuredId: globalThis.__NUVIO_TIZEN_PLUGIN_SERVICE_ID__
  });
}

function callbackCall(fn, args = []) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const success = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const failure = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    try {
      const result = fn(...args, success, failure);
      if (!settled && result !== undefined) resolve(result);
    } catch (error) {
      failure(error);
    }
  });
}

async function startWithApplicationControl(id) {
  const application = globalThis.tizen?.application;
  const ApplicationControl = globalThis.tizen?.ApplicationControl;
  if (!application?.launchAppControl || typeof ApplicationControl !== "function") {
    throw new Error("Tizen application control API unavailable");
  }
  const control = new ApplicationControl(DEFAULT_OPERATION);
  return callbackCall(application.launchAppControl.bind(application), [control, id]);
}

async function startWithApplication(id) {
  const application = globalThis.tizen?.application;
  if (!application?.launch) throw new Error("Tizen application launch API unavailable");
  return callbackCall(application.launch.bind(application), [id]);
}

function normalizeWrtServiceModule(moduleValue) {
  const candidates = [
    moduleValue,
    moduleValue?.default,
    moduleValue?.service,
    moduleValue?.default?.service
  ];
  for (const candidate of candidates) {
    if (
      candidate &&
      (typeof candidate.startService === "function" || typeof candidate.start === "function")
    ) {
      return candidate;
    }
  }
  return null;
}

async function loadWrtServiceModule() {
  const globalService =
    globalThis.__NUVIO_TIZEN_WRT_SERVICE__ ||
    globalThis.wrt?.service ||
    globalThis.webapis?.wrt?.service ||
    globalThis.webapis?.service;
  const normalizedGlobalService = normalizeWrtServiceModule(globalService);
  if (normalizedGlobalService) return normalizedGlobalService;
  if (!wrtServiceModulePromise) {
    wrtServiceModulePromise = (async () => {
      try {
        // Keep the dynamic import out of the bundle's parse path so older
        // Tizen engines can still use the application/legacy fallbacks.
        const dynamicImport = Function("specifier", "return import(specifier);");
        return normalizeWrtServiceModule(await dynamicImport("wrt:service"));
      } catch (_) {
        return null;
      }
    })();
  }
  return wrtServiceModulePromise;
}

async function startWithWrtService(id, { onVariant } = {}) {
  const service = await loadWrtServiceModule();
  if (!service) throw new Error("Tizen wrt:service API unavailable");
  if (typeof service.startService === "function") {
    try {
      onVariant?.("string");
      return await callbackCall(service.startService.bind(service), [id]);
    } catch (firstError) {
      onVariant?.("string-failed", firstError);
      onVariant?.("object");
      return callbackCall(service.startService.bind(service), [{ id }]);
    }
  }
  if (typeof service.start === "function") {
    onVariant?.("start-alias");
    return callbackCall(service.start.bind(service), [id]);
  }
  throw new Error("Tizen service start API unavailable");
}

function getStartAttempts(id, webServiceSupported) {
  const compatibleAttempts = [
    {
      method: "tizen-application-control-default",
      start: () => startWithApplicationControl(id)
    },
    {
      method: "tizen-application-launch",
      start: () => startWithApplication(id)
    },
    {
      method: "wrt-service-startService",
      start: (options) => startWithWrtService(id, options)
    }
  ];
  // Samsung warns that application-control launches can disturb the
  // foreground app when web.service is reported as unavailable. Keep the
  // same compatibility order as EngineFS: application-control, application
  // launch, then the dedicated wrt:service API. If the capability is false,
  // use the legacy-safe order used by EngineFS and skip application-control.
  const attempts =
    webServiceSupported === false
      ? compatibleAttempts.slice(2, 3).concat(compatibleAttempts.slice(1, 2))
      : compatibleAttempts;
  return attempts;
}

async function requestStartAndWaitForHealth(serviceIdsToTry, { webServiceSupported = null } = {}) {
  const ids = Array.isArray(serviceIdsToTry)
    ? serviceIdsToTry.filter(Boolean)
    : [serviceIdsToTry].filter(Boolean);
  const errors = [];
  const deadline = Date.now() + START_TIMEOUT_MS;

  for (const id of ids) {
    const attempts = getStartAttempts(id, webServiceSupported);
    for (const attempt of attempts) {
      const remainingBeforeStart = deadline - Date.now();
      if (remainingBeforeStart <= 250) break;

      let acknowledged = false;
      try {
        await withTimeout(
          attempt.start(),
          Math.min(SERVICE_START_CALL_TIMEOUT_MS, remainingBeforeStart),
          `${attempt.method} service start call timed out`
        );
        acknowledged = true;

        const remainingBeforeHealth = deadline - Date.now();
        if (remainingBeforeHealth <= 250) {
          throw new Error("startup deadline reached before the health check");
        }

        const reachable = await waitForBaseUrl(
          Math.min(START_ATTEMPT_HEALTH_TIMEOUT_MS, remainingBeforeHealth)
        );
        return { ...reachable, method: attempt.method, serviceId: id };
      } catch (error) {
        const detail = String(error?.message || error);
        const message = acknowledged
          ? `${id} ${attempt.method} acknowledged but /health was not reachable: ${detail}`
          : `${id} ${attempt.method} start failed: ${detail}`;
        errors.push(message);
        console.warn(`[Nuvio PluginService] ${message}`);
      }
    }
  }

  if (!errors.length) {
    errors.push("startup deadline reached before a service start attempt could complete");
  }
  throw new Error(errors.join("; "));
}

async function requestJson(url, options = {}, timeoutMs = PROBE_TIMEOUT_MS) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      cache: "no-store",
      signal: controller?.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Tizen plugin service HTTP ${response.status}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function probe(baseUrl, timeoutMs = PROBE_TIMEOUT_MS) {
  const payload = await requestJson(`${baseUrl}/health`, {}, timeoutMs);
  if (
    payload?.returnValue !== true ||
    payload?.service !== PLUGIN_SERVICE_NAME ||
    Number(payload?.protocolVersion || 0) !== PLUGIN_PROTOCOL_VERSION
  ) {
    throw new Error("Tizen plugin service health is incompatible");
  }
  return { baseUrl, payload };
}

async function findBaseUrl(timeoutMs = PROBE_TIMEOUT_MS) {
  const results = await Promise.all(
    LOCAL_BASE_URLS.map(async (baseUrl) => {
      try {
        return { baseUrl, result: await probe(baseUrl, timeoutMs) };
      } catch (error) {
        return { baseUrl, error };
      }
    })
  );
  const reachable = results.find((entry) => entry.result);
  if (reachable) {
    return reachable.result;
  }

  const details = results
    .map((entry) => `${entry.baseUrl}: ${String(entry.error?.message || entry.error || "failed")}`)
    .join("; ");
  throw new Error(details || "No Tizen plugin service responded");
}

async function waitForBaseUrl(timeoutMs = START_TIMEOUT_MS) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    const remaining = timeoutMs - (Date.now() - startedAt);
    if (remaining <= 0) break;
    try {
      return await findBaseUrl(Math.min(1200, remaining));
    } catch (error) {
      lastError = error;
      const delay = Math.min(350, timeoutMs - (Date.now() - startedAt));
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError || new Error("Timed out waiting for the Tizen plugin service");
}

async function startWithEngineFsCompatibilityFallback(directError) {
  const engineFs = await TizenEngineFsService.ensureStarted({ purpose: "generic" });
  if (engineFs.status !== "success") {
    throw new Error(
      `EngineFS compatibility host unavailable: ${
        engineFs.detail || "local EngineFS service did not start"
      }`
    );
  }

  // EngineFS keeps its media API on 2710. Its Tizen service also starts the
  // existing plugin-service bootstrap as a compatibility host, which keeps
  // the plugin protocol on 2711/11471 and avoids coupling the two APIs.
  const reachable = await waitForBaseUrl();
  return {
    ...reachable,
    serviceId: engineFs.serviceId || "",
    startMethod: "enginefs-plugin-compatibility",
    compatibilityFallback: true,
    directStartError: String(directError?.message || directError || "unknown")
  };
}

export const TizenPluginService = {
  getLocalBaseUrls() {
    return [...LOCAL_BASE_URLS];
  },

  async ensureStarted() {
    if (!Platform.isTizen()) return { status: "unsupported", detail: "Not running on Tizen" };
    if (globalThis.__NUVIO_TIZEN_PLUGIN_SERVICE_ENABLED__ === false) {
      return { status: "unsupported", detail: "Plugin service is not packaged" };
    }
    const capabilities = TizenCapabilities.get();
    if (!capabilities.isTizen || !capabilities.hasWebAssembly) {
      return { status: "unsupported", detail: "Tizen WebAssembly is unavailable" };
    }
    try {
      const reachable = await findBaseUrl();
      return { status: "success", ...reachable, started: false };
    } catch (_) {
      // Start below.
    }
    if (!startPromise) {
      startPromise = (async () => {
        const ids = serviceIds();
        let directError = null;
        try {
          if (!ids.length) {
            throw new Error("Tizen plugin service id is unavailable");
          }
          const startResult = await requestStartAndWaitForHealth(ids, {
            webServiceSupported: capabilities.webServiceSupported
          });
          return { ...startResult, startMethod: startResult.method };
        } catch (error) {
          directError = error;
          console.warn(
            `[Nuvio PluginService] direct startup failed; trying EngineFS compatibility host: ${String(error?.message || error)}`
          );
        }
        return startWithEngineFsCompatibilityFallback(directError);
      })().finally(() => {
        startPromise = null;
      });
    }
    try {
      return { status: "success", ...(await startPromise), started: true };
    } catch (error) {
      const detail = String(error?.message || error);
      const runtime =
        `tizen=${capabilities.tizenVersion || "unknown"}, ` +
        `chromium=${capabilities.chromiumMajorVersion || "unknown"}, ` +
        `web.service=${String(capabilities.webServiceSupported ?? "unknown")}`;
      const diagnosticDetail = `${detail} [${runtime}]`;
      console.error(`[Nuvio PluginService] startup failed: ${diagnosticDetail}`);
      return { status: "error", detail: diagnosticDetail };
    }
  },

  async health() {
    const started = await this.ensureStarted();
    if (started.status !== "success") return { returnValue: false, ...started };
    return { returnValue: true, ...started, ...(started.payload || {}) };
  },

  async capabilities() {
    const started = await this.ensureStarted();
    if (started.status !== "success") return { returnValue: false, ...started };
    return requestJson(`${started.baseUrl}/capabilities`, {}, PROBE_TIMEOUT_MS);
  },

  async diagnostics() {
    const started = await this.ensureStarted();
    if (started.status !== "success") return { returnValue: false, ...started };
    return requestJson(`${started.baseUrl}/diagnostics`, {}, PROBE_TIMEOUT_MS);
  },

  async request(method, payload = {}, { timeoutMs = 30000, signal } = {}) {
    const started = await this.ensureStarted();
    if (started.status !== "success")
      throw new Error(started.detail || "Tizen plugin service unavailable");
    const baseUrl = started.baseUrl;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const abort = () => controller?.abort();
    signal?.addEventListener?.("abort", abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    try {
      const response = await fetch(`${baseUrl}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: controller?.signal
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.returnValue === false)
        throw new Error(result.errorText || `Tizen plugin service HTTP ${response.status}`);
      return result;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", abort);
    }
  },

  fetch(payload, options) {
    return this.request("fetch", payload, options);
  },

  cancel(payload) {
    return this.request("cancel", payload, { timeoutMs: 2000 }).catch(() => false);
  },

  clearCache() {
    return this.request("cache/clear", {}, { timeoutMs: 5000 });
  }
};
