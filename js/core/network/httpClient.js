import { SessionStore } from "../storage/sessionStore.js";
import { AuthManager } from "../auth/authManager.js";
import { fetchViaWebOsSupabaseProxy } from "../../platform/webos/webosSupabaseProxy.js";
import { Platform } from "../../platform/index.js";

const DEFAULT_HTTP_REQUEST_TIMEOUT_MS = 60_000;
const BACKEND_RETRY_MAX_DELAY_MS = 30_000;
const BACKEND_RETRY_JITTER_MS = 1_000;
const SAFE_BACKEND_READ_RPCS = new Set([
  "get_avatar_catalog",
  "get_member_profile_avatar_catalog",
  "get_member_profile_background_catalog",
  "get_my_member_access",
  "get_my_membership_overview",
  "get_sync_code",
  "get_sync_overview",
  "get_sync_owner"
]);
let backendCooldownUntilMs = 0;

function isSupabaseBackendRequest(url) {
  return /\/(?:rest\/v1|storage\/v1)\//i.test(String(url || ""));
}

function isSafeBackendRetryRequest(url, method) {
  if (!isSupabaseBackendRequest(url)) {
    return false;
  }
  if (method === "GET" || method === "HEAD") {
    return true;
  }
  if (method !== "POST") {
    return false;
  }
  const rpcName = String(url || "")
    .split("/rpc/")[1]
    ?.split(/[/?#]/)[0]
    ?.toLowerCase();
  return Boolean(
    rpcName &&
    (rpcName.startsWith("sync_pull_") ||
      rpcName.startsWith("sync_get_") ||
      SAFE_BACKEND_READ_RPCS.has(rpcName))
  );
}

function retryAfterDelayMs(headerValue, nowMs = Date.now()) {
  const value = String(headerValue || "").trim();
  if (!value) {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(0, Math.trunc(seconds * 1000));
  }
  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - nowMs) : null;
}

function recordBackendCooldown(response) {
  const status = Number(response?.status || 0);
  const retryAfter = response?.headers?.get?.("retry-after") || "";
  if (status !== 429 && !(status === 503 && retryAfter)) {
    return;
  }
  const delayMs = retryAfterDelayMs(retryAfter) ?? 1000;
  backendCooldownUntilMs = Math.max(backendCooldownUntilMs, Date.now() + delayMs);
}

async function waitForBackendCooldown() {
  while (backendCooldownUntilMs > Date.now()) {
    await new Promise((resolve) => setTimeout(resolve, backendCooldownUntilMs - Date.now()));
  }
}

async function fetchWithBackendRetry(url, fetchInit, method) {
  const safeRetry = isSafeBackendRetryRequest(url, method);
  await waitForBackendCooldown();
  let response =
    (await fetchViaWebOsSupabaseProxy(url, fetchInit)) || (await fetch(url, fetchInit));
  recordBackendCooldown(response);

  if (safeRetry && [429, 503].includes(Number(response?.status || 0))) {
    const headerDelay = retryAfterDelayMs(response?.headers?.get?.("retry-after"));
    const fallbackDelay = Math.min(BACKEND_RETRY_MAX_DELAY_MS, 1000);
    const delayMs = Math.min(
      BACKEND_RETRY_MAX_DELAY_MS + BACKEND_RETRY_JITTER_MS,
      (headerDelay ?? fallbackDelay) + Math.floor(Math.random() * (BACKEND_RETRY_JITTER_MS + 1))
    );
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await waitForBackendCooldown();
    response = (await fetchViaWebOsSupabaseProxy(url, fetchInit)) || (await fetch(url, fetchInit));
    recordBackendCooldown(response);
  }
  return response;
}

function toHeaderObject(headers) {
  if (!headers) {
    return {};
  }
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  return { ...headers };
}

function hasHeader(headers, name) {
  const target = String(name || "").toLowerCase();
  return Object.keys(headers || {}).some((key) => String(key).toLowerCase() === target);
}

// Save the original browser fetch before any overrides, at module scope.
// This lets proxyFetch call the real fetch directly without hitting the interceptor.
const _originalFetch = typeof window !== "undefined" ? window.fetch.bind(window) : fetch;

export async function proxyFetch(url, fetchInit) {
  const cloudProxyUrl =
    typeof window !== "undefined" ? window.__NUVIO_ENV__?.WEBOS_CLOUD_PROXY_URL : null;

  if (cloudProxyUrl && Platform.isWebOS()) {
    const targetUrl = `${cloudProxyUrl}?url=${encodeURIComponent(url)}`;
    const proxyToken =
      typeof window !== "undefined" ? window.__NUVIO_ENV__?.WEBOS_CLOUD_PROXY_TOKEN : null;
    const headers = toHeaderObject(fetchInit?.headers);
    if (proxyToken) {
      headers["x-proxy-token"] = proxyToken;
    }
    const modifiedInit = { ...(fetchInit || {}), headers };
    try {
      const response = await _originalFetch(targetUrl, modifiedInit);
      if (!response.ok) {
        if (response.status === 403) {
          console.error(
            `[CloudProxy 403 Forbidden] ${url} — Token mismatch. Check WEBOS_CLOUD_PROXY_TOKEN in local.properties and Cloudflare Worker.`
          );
        } else if (response.status === 502) {
          console.error(`[CloudProxy 502 Bad Gateway] ${url} — Cloudflare failed to fetch target.`);
        } else {
          console.warn(`[CloudProxy ${response.status}] ${url}`);
        }
      }
      return response;
    } catch (networkError) {
      console.error(`[CloudProxy Exception] Failed to fetch ${url}:`, networkError);
      throw networkError;
    }
  } else {
    return (
      (await fetchViaWebOsSupabaseProxy(url, fetchInit)) || (await _originalFetch(url, fetchInit))
    );
  }
}

// Global fetch interceptor for webOS to ensure ALL external API requests pass through proxy.
// IMPORTANT: Only intercepts absolute external http(s):// URLs.
// Skips: relative paths, same-origin assets, data:/blob: URLs, video streams, local network.
if (typeof window !== "undefined") {
  window.fetch = async function (url, options) {
    const cloudProxyUrl = window.__NUVIO_ENV__?.WEBOS_CLOUD_PROXY_URL;

    if (cloudProxyUrl && Platform.isWebOS()) {
      const urlStr = String(url || "");

      // Only proxy absolute http(s) URLs — never relative paths, data:, blob:, etc.
      const isAbsoluteHttp = /^https?:\/\//i.test(urlStr);
      if (!isAbsoluteHttp) {
        return _originalFetch(url, options);
      }

      // Never proxy same-origin requests (the app's own bundled assets)
      try {
        if (new URL(urlStr).origin === window.location.origin) {
          return _originalFetch(url, options);
        }
      } catch (e) {
        // If URL parsing fails, don't proxy
        return _originalFetch(url, options);
      }

      // Never proxy requests already going to the proxy (prevent infinite loop)
      if (urlStr.startsWith(cloudProxyUrl)) {
        return _originalFetch(url, options);
      }

      // Never proxy video streams or local network
      let urlPath = "";
      try {
        urlPath = new URL(urlStr).pathname.toLowerCase();
      } catch (e) {
        urlPath = "";
      }

      const isExcluded =
        urlPath.endsWith(".m3u8") ||
        urlPath.endsWith(".mp4") ||
        urlPath.endsWith(".mkv") ||
        urlPath.endsWith(".ts") ||
        urlStr.includes("127.0.0.1") ||
        urlStr.includes("localhost") ||
        urlStr.match(/^https?:\/\/(192\.168|10\.|172\.(1[6-9]|2[0-9]|3[0-1]))\./);

      if (isExcluded) {
        return _originalFetch(url, options);
      }

      // Route through Cloudflare proxy
      const targetUrl = `${cloudProxyUrl}?url=${encodeURIComponent(urlStr)}`;
      const proxyToken = window.__NUVIO_ENV__?.WEBOS_CLOUD_PROXY_TOKEN;
      const headers = toHeaderObject(options?.headers);
      if (proxyToken) {
        headers["x-proxy-token"] = proxyToken;
      }
      const modifiedOptions = { ...(options || {}), headers };
      return await _originalFetch(targetUrl, modifiedOptions);
    }
    return _originalFetch(url, options);
  };
}

function resolveTimeoutMs(value) {
  if (value === undefined) {
    return DEFAULT_HTTP_REQUEST_TIMEOUT_MS;
  }
  const timeoutMs = Number(value);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 0;
}

function createRequestTimeoutError(timeoutMs) {
  const error = new Error(`Request timed out after ${timeoutMs}ms`);
  error.code = "REQUEST_TIMEOUT";
  error.name = "TimeoutError";
  return error;
}

async function withRequestTimeout(task, timeoutMs, callerSignal) {
  if (!timeoutMs) {
    return task(callerSignal);
  }

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const requestSignal = controller?.signal || callerSignal;
  let removeAbortListener = null;
  if (controller && callerSignal) {
    const forwardAbort = () => controller.abort();
    if (callerSignal.aborted) {
      controller.abort();
    } else if (typeof callerSignal.addEventListener === "function") {
      callerSignal.addEventListener("abort", forwardAbort, { once: true });
      removeAbortListener = () => callerSignal.removeEventListener("abort", forwardAbort);
    }
  }

  let timeoutId = 0;
  let didTimeout = false;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        didTimeout = true;
        controller?.abort();
        reject(createRequestTimeoutError(timeoutMs));
      }, timeoutMs);
    });
    return await Promise.race([Promise.resolve().then(() => task(requestSignal)), timeoutPromise]);
  } catch (error) {
    if (didTimeout) {
      throw createRequestTimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    removeAbortListener?.();
  }
}
export async function httpRequest(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const includeSessionAuth = options.includeSessionAuth !== false;
  let refreshFailedTransiently = false;

  const headers = toHeaderObject(options.headers);

  if (includeSessionAuth && SessionStore.refreshToken && AuthManager.isAccessTokenExpired()) {
    await AuthManager.refreshSessionIfNeeded();
    refreshFailedTransiently = AuthManager.wasLastSessionRefreshTransientFailure?.() === true;
  }

  if (includeSessionAuth && SessionStore.accessToken && !hasHeader(headers, "Authorization")) {
    headers["Authorization"] = `Bearer ${SessionStore.accessToken}`;
  }

  const body = options.body;
  const hasBody = body != null && method !== "GET" && method !== "HEAD";
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const isBlob = typeof Blob !== "undefined" && body instanceof Blob;
  const isSearchParams = typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams;
  if (hasBody && !hasHeader(headers, "Content-Type") && !isFormData && !isBlob && !isSearchParams) {
    headers["Content-Type"] = "application/json";
  }

  const {
    includeSessionAuth: _ignoredIncludeSessionAuth,
    responseType: requestedResponseType,
    timeoutMs: requestedTimeoutMs,
    signal: callerSignal,
    ...fetchOptions
  } = options;

  const timeoutMs = resolveTimeoutMs(requestedTimeoutMs);
  return withRequestTimeout(
    async (requestSignal) => {
      const fetchInit = {
        ...fetchOptions,
        method,
        credentials: fetchOptions.credentials || "omit",
        headers,
        ...(requestSignal ? { signal: requestSignal } : {})
      };

      let response = await fetchWithBackendRetry(url, fetchInit, method);

      if (response.status === 401 && includeSessionAuth && SessionStore.refreshToken) {
        const refreshed = await AuthManager.refreshSessionIfNeeded({ force: true });
        refreshFailedTransiently = AuthManager.wasLastSessionRefreshTransientFailure?.() === true;
        if (refreshed && SessionStore.accessToken) {
          const retryInit = {
            ...fetchInit,
            method,
            headers: {
              ...headers,
              Authorization: `Bearer ${SessionStore.accessToken}`
            }
          };
          response = await fetchWithBackendRetry(url, retryInit, method);
        }
      }

      if (!response.ok) {
        if (
          response.status === 401 &&
          includeSessionAuth &&
          (SessionStore.accessToken || SessionStore.refreshToken) &&
          !refreshFailedTransiently
        ) {
          await AuthManager.signOut();
        }
        const text = await response.text();
        console.warn(`[HTTP ${method} ${response.status}] ${url}:`, text);
        const error = new Error(text);
        error.status = response.status;
        const retryAfter = response.headers?.get?.("retry-after");
        if (retryAfter) {
          const seconds = Number(retryAfter);
          const retryDate = Date.parse(retryAfter);
          if (Number.isFinite(seconds) && seconds > 0) {
            error.retryAfterMs = seconds * 1000;
          } else if (Number.isFinite(retryDate) && retryDate > Date.now()) {
            error.retryAfterMs = retryDate - Date.now();
          }
        }
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === "object") {
            if (typeof parsed.code === "string") {
              error.code = parsed.code;
            }
            if (typeof parsed.message === "string") {
              error.detail = parsed.message;
            }
          }
        } catch (_parseError) {
          // Keep raw response text in error.message when payload is not JSON.
        }
        throw error;
      }

      if (response.status === 204) {
        return null;
      }
      const responseType = String(requestedResponseType || "json")
        .trim()
        .toLowerCase();
      if (responseType === "response") {
        return response;
      }
      if (responseType === "blob") {
        return response.blob();
      }
      if (responseType === "arraybuffer" || responseType === "array_buffer") {
        return response.arrayBuffer();
      }
      if (responseType === "text") {
        return response.text();
      }
      const text = await response.text();
      const normalized = typeof text === "string" ? text.trim() : "";
      if (!normalized) {
        return null;
      }
      return JSON.parse(normalized);
    },
    timeoutMs,
    callerSignal
  );
}
