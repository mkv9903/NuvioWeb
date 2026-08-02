function parseHourCycle(hourCycle) {
  const normalized = String(hourCycle || "").toLowerCase();
  if (normalized === "h11" || normalized === "h12") {
    return true;
  }
  if (normalized === "h23" || normalized === "h24") {
    return false;
  }
  return null;
}

export function parsePlatformTimeFormat(format) {
  const normalized = String(format || "").replace(/'[^']*'/g, "");
  if (/[hK]/.test(normalized)) {
    return true;
  }
  if (/[Hk]/.test(normalized)) {
    return false;
  }
  return null;
}

export function resolveSystemHour12({ tizenApi = null, intlApi = null } = {}) {
  try {
    const platformFormat = tizenApi?.time?.getTimeFormat?.();
    const platformHour12 = parsePlatformTimeFormat(platformFormat);
    if (typeof platformHour12 === "boolean") {
      return platformHour12;
    }
  } catch (_) {
    // Fall back to the browser runtime when the platform API is unavailable.
  }

  try {
    if (typeof intlApi?.DateTimeFormat !== "function") {
      return null;
    }
    const resolved = new intlApi.DateTimeFormat(undefined, {
      hour: "numeric"
    }).resolvedOptions();
    if (typeof resolved?.hour12 === "boolean") {
      return resolved.hour12;
    }
    return parseHourCycle(resolved?.hourCycle);
  } catch (_) {
    return null;
  }
}

export function buildClockFormatOptions(hour12 = null) {
  const options = {
    hour: "2-digit",
    minute: "2-digit"
  };
  if (typeof hour12 === "boolean") {
    options.hour12 = hour12;
  }
  return options;
}
