function normalizedId(value) {
  return String(value || "").trim();
}

function currentTizenAppInfo(runtime) {
  try {
    return runtime?.tizen?.application?.getCurrentApplication?.()?.appInfo || null;
  } catch (_) {
    return null;
  }
}

/**
 * Return the service identifiers that can describe the current installed WGT.
 *
 * The generated main.js identifier is the authoritative candidate for an
 * untouched package. The runtime package/application metadata is also useful
 * when a third-party installer has rewritten config.xml before signing. Keep
 * the list deterministic and de-duplicated so normal installs retain exactly
 * the current startup behavior.
 */
export function getTizenServiceIdCandidates(
  suffix,
  { configuredId = "", runtime = globalThis } = {}
) {
  const serviceSuffix = normalizedId(suffix);
  if (!serviceSuffix) return [];

  const appInfo = currentTizenAppInfo(runtime);
  const packageId = normalizedId(appInfo?.packageId);
  const appId = normalizedId(appInfo?.id);
  const candidates = [
    packageId ? `${packageId}.${serviceSuffix}` : "",
    normalizedId(configuredId),
    appId ? `${appId}.${serviceSuffix}` : ""
  ];

  return Array.from(new Set(candidates.filter(Boolean)));
}
