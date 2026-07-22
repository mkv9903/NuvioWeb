import { SessionStore } from "../storage/sessionStore.js";
import { AuthManager } from "../auth/authManager.js";
import { fetchViaWebOsSupabaseProxy } from "../../platform/webos/webosSupabaseProxy.js";
import { Platform } from "../../platform/index.js";

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
const _originalFetch = typeof window !== 'undefined' ? window.fetch.bind(window) : fetch;

export async function proxyFetch(url, fetchInit) {
  const cloudProxyUrl = typeof window !== 'undefined' ? window.__NUVIO_ENV__?.WEBOS_CLOUD_PROXY_URL : null;
  
  if (cloudProxyUrl && Platform.isWebOS()) {
    const targetUrl = `${cloudProxyUrl}?url=${encodeURIComponent(url)}`;
    const proxyToken = typeof window !== 'undefined' ? window.__NUVIO_ENV__?.WEBOS_CLOUD_PROXY_TOKEN : null;
    const modifiedInit = { ...fetchInit };
    if (proxyToken) {
      modifiedInit.headers = { ...(modifiedInit.headers || {}), 'x-proxy-token': proxyToken };
    }
    return await _originalFetch(targetUrl, modifiedInit);
  } else {
    return (await fetchViaWebOsSupabaseProxy(url, fetchInit)) || (await _originalFetch(url, fetchInit));
  }
}

// Global fetch interceptor for webOS to ensure ALL external API requests pass through proxy.
// IMPORTANT: Only intercepts absolute external http(s):// URLs.
// Skips: relative paths, same-origin assets, data:/blob: URLs, video streams, local network.
if (typeof window !== 'undefined') {
  window.fetch = async function(url, options) {
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
      
      const isExcluded = urlPath.endsWith(".m3u8") || 
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
      const modifiedOptions = { ...(options || {}) };
      if (proxyToken) {
        modifiedOptions.headers = { ...(modifiedOptions.headers || {}), 'x-proxy-token': proxyToken };
      }
      return await _originalFetch(targetUrl, modifiedOptions);
    }
    return _originalFetch(url, options);
  };
}

export async function httpRequest(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const includeSessionAuth = options.includeSessionAuth !== false;

  const headers = toHeaderObject(options.headers);

  if (includeSessionAuth && SessionStore.refreshToken && AuthManager.isAccessTokenExpired()) {
    await AuthManager.refreshSessionIfNeeded();
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

  const { includeSessionAuth: _ignoredIncludeSessionAuth, ...fetchOptions } = options;
  const fetchInit = {
    ...fetchOptions,
    method,
    credentials: fetchOptions.credentials || "omit",
    headers
  };

  let response = await proxyFetch(url, fetchInit);

  if (response.status === 401 && includeSessionAuth && SessionStore.refreshToken) {
    const refreshed = await AuthManager.refreshSessionIfNeeded({ force: true });
    if (refreshed && SessionStore.accessToken) {
      const retryInit = {
        ...fetchInit,
        method,
        headers: {
          ...headers,
          Authorization: `Bearer ${SessionStore.accessToken}`
        }
      };
      response = await proxyFetch(url, retryInit);
    }
  }

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(text);
    error.status = response.status;
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
    } catch (parseError) {
      // Keep raw response text in error.message when payload is not JSON.
    }
    throw error;
  }

  if (response.status === 204) {
    return null;
  }
  const text = await response.text();
  const normalized = typeof text === "string" ? text.trim() : "";
  if (!normalized) {
    return null;
  }
  return JSON.parse(normalized);
}
