/* global module, require, process */
"use strict";

var SERVICE_TAG = "[Nuvio PluginService]";
var DEFAULT_PORT = 2711;
var FALLBACK_PORT = 11471;

function runtimeProcess() {
  try {
    return typeof process !== "undefined" && process ? process : null;
  } catch (_) {
    return null;
  }
}

function runtimeEnv(name) {
  var currentProcess = runtimeProcess();
  return currentProcess && currentProcess.env ? currentProcess.env[name] : null;
}

var configuredPort = normalizePort(runtimeEnv("NUVIO_PLUGIN_SERVICE_PORT"), DEFAULT_PORT);
var candidates = [configuredPort];
if (FALLBACK_PORT !== configuredPort) candidates.push(FALLBACK_PORT);
var candidateIndex = 0;
var server = null;
var activePort = 0;
var startRequested = false;
var lifecycleToken = 0;

function normalizePort(value, fallback) {
  var parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1024 && parsed <= 65535 ? parsed : fallback;
}

function errorText(error) {
  return error && error.stack ? error.stack : String(error || "Unknown plugin service error");
}

function closeServer(target) {
  if (!target || typeof target.close !== "function") return;
  try {
    target.close();
  } catch (_) {
    // A server that failed during listen may already be closed.
  }
}

function probeNodeRuntime() {
  var requiredModules = ["http", "url", "net", "dns", "https", "zlib", "buffer"];
  var missing = [];
  var http = null;
  requiredModules.forEach(function (moduleName) {
    try {
      var moduleValue = require(moduleName);
      if (moduleName === "http") http = moduleValue;
    } catch (error) {
      missing.push(moduleName + ": " + errorText(error));
    }
  });
  if (missing.length) {
    throw new Error("Missing Node-compatible modules: " + missing.join("; "));
  }

  if (!http) http = require("http");
  if (typeof http.createServer !== "function") {
    throw new Error("http.createServer is unavailable");
  }
}

function probeExistingPluginService(port, callback) {
  var http;
  try {
    http = require("http");
  } catch (_) {
    callback(false);
    return;
  }
  if (!http || typeof http.request !== "function") {
    callback(false);
    return;
  }

  var settled = false;
  var request = null;
  function finish(isPluginService) {
    if (settled) return;
    settled = true;
    callback(isPluginService === true);
  }

  try {
    request = http.request(
      {
        host: "127.0.0.1",
        port: port,
        path: "/health",
        method: "GET"
      },
      function (response) {
        var body = "";
        response.on("data", function (chunk) {
          if (body.length < 8192) body += String(chunk);
        });
        response.on("end", function () {
          if (response.statusCode !== 200) {
            finish(false);
            return;
          }
          try {
            var payload = JSON.parse(body || "{}");
            finish(
              payload &&
                payload.returnValue === true &&
                payload.service === "nuvio-plugin-network" &&
                Number(payload.protocolVersion || 0) === 1
            );
          } catch (_) {
            finish(false);
          }
        });
        response.on("error", function () {
          finish(false);
        });
      }
    );
    request.on("error", function () {
      finish(false);
    });
    if (typeof request.setTimeout === "function") {
      request.setTimeout(700, function () {
        try {
          request.destroy();
        } catch (_) {}
        finish(false);
      });
    }
    request.end();
  } catch (_) {
    finish(false);
  }
}

function failStart(token, error) {
  if (token !== lifecycleToken) return;
  startRequested = false;
  activePort = 0;
  if (server) {
    closeServer(server);
    server = null;
  }
  console.error(SERVICE_TAG + " failed to listen", errorText(error));
}

function bindCandidate(token, pluginHttp) {
  if (token !== lifecycleToken) return;
  if (candidateIndex >= candidates.length) {
    failStart(token, new Error("No available local plugin service port"));
    return;
  }

  var candidate = candidates[candidateIndex];
  var localServer;
  try {
    localServer = pluginHttp.createPluginHttpServer({ port: candidate });
    if (!localServer || typeof localServer.listen !== "function") {
      throw new Error("Plugin HTTP server is unavailable");
    }
  } catch (error) {
    failStart(token, error);
    return;
  }

  server = localServer;
  var listening = false;
  var handled = false;
  function markListening() {
    if (token !== lifecycleToken || handled) {
      closeServer(localServer);
      return;
    }
    listening = true;
    activePort = candidate;
  }
  function handleBindError(error) {
    if (token !== lifecycleToken) {
      closeServer(localServer);
      return;
    }
    if (listening) {
      console.error(SERVICE_TAG + " server error", errorText(error));
      return;
    }
    if (handled) return;
    handled = true;
    closeServer(localServer);
    server = null;
    if (error && error.code === "EADDRINUSE") {
      probeExistingPluginService(candidate, function (isExistingPluginService) {
        if (token !== lifecycleToken) return;
        if (isExistingPluginService) {
          activePort = candidate;
          console.warn(
            SERVICE_TAG +
              " port " +
              candidate +
              " is already served by a compatible PluginService; reusing it"
          );
          return;
        }
        if (candidateIndex < candidates.length - 1) {
          candidateIndex += 1;
          console.warn(
            SERVICE_TAG +
              " port " +
              candidate +
              " is already in use; trying 127.0.0.1:" +
              candidates[candidateIndex]
          );
          bindCandidate(token, pluginHttp);
          return;
        }
        failStart(token, error);
      });
      return;
    }
    failStart(token, error);
  }
  localServer.on("listening", markListening);
  localServer.on("error", handleBindError);

  try {
    // Keep the exact one-argument overload used by the working EngineFS
    // runtime. Some Tizen lightweight runtimes acknowledge the host/callback
    // overload without creating a reachable loopback listener.
    localServer.listen(candidate);
  } catch (error) {
    handleBindError(error);
  }
}

function start() {
  if (startRequested) {
    return;
  }

  startRequested = true;
  candidateIndex = 0;
  activePort = 0;
  var token = ++lifecycleToken;
  try {
    probeNodeRuntime();
    var pluginHttp = require("../plugin-http.cjs");
    if (!pluginHttp || typeof pluginHttp.createPluginHttpServer !== "function") {
      throw new Error("Plugin HTTP implementation is unavailable");
    }
    bindCandidate(token, pluginHttp);
  } catch (error) {
    failStart(token, error);
  }
}

function stop() {
  lifecycleToken += 1;
  startRequested = false;
  candidateIndex = 0;
  activePort = 0;
  var current = server;
  server = null;
  closeServer(current);
}

// Tizen Web Service applications are entered through onStart. Keeping the
// server out of module evaluation makes startup, failure reporting and
// shutdown follow the same lifecycle as the working EngineFS service.
module.exports.onStart = start;
module.exports.onExit = stop;
// Compatibility alias for older Tizen service runtimes.
module.exports.onStop = stop;
