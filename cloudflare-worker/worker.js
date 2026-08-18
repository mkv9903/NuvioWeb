export default {
  async fetch(request, env) {
    // Handle CORS preflight (OPTIONS)
    if (request.method === "OPTIONS") {
      // Chrome 53 doesn't support '*' for Access-Control-Allow-Headers
      // We must explicitly echo back whatever it requested.
      const requestedHeaders = request.headers.get("Access-Control-Request-Headers") || "*";

      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": requestedHeaders,
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    // Validate Security Token
    const EXPECTED_TOKEN = "YOUR_SUPER_SECRET_TOKEN";
    const requestToken = request.headers.get("x-proxy-token");

    if (requestToken !== EXPECTED_TOKEN) {
      return new Response("Forbidden: Invalid Proxy Token", {
        status: 403,
        headers: { "Access-Control-Allow-Origin": "*" }
      });
    }

    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    if (!targetUrl) {
      return new Response("Missing target URL", { status: 400 });
    }

    // Copy headers from original request but strip Origin/Referer/Host to avoid upstream blocks
    const newHeaders = new Headers(request.headers);
    newHeaders.delete("Origin");
    newHeaders.delete("Referer");
    newHeaders.delete("Host");
    newHeaders.delete("x-proxy-token"); // Don't forward the proxy token to the target
    // Cloudflare Workers runtime sets the correct Host header from targetUrl automatically.

    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const proxyRequest = new Request(targetUrl, {
      method: request.method,
      headers: newHeaders,
      body: hasBody ? request.body : undefined
    });

    try {
      const response = await fetch(proxyRequest);

      // 204, 205, and 304 responses must not have a body in WHATWG Response constructor
      const hasResponseBody =
        response.status !== 204 && response.status !== 205 && response.status !== 304;

      const proxyResponse = new Response(hasResponseBody ? response.body : null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });

      // Override CORS headers
      proxyResponse.headers.set("Access-Control-Allow-Origin", "*");
      proxyResponse.headers.set("Access-Control-Expose-Headers", "*");

      return proxyResponse;
    } catch (e) {
      return new Response("Proxy Error: " + e.message, {
        status: 502,
        headers: { "Access-Control-Allow-Origin": "*" }
      });
    }
  }
};
