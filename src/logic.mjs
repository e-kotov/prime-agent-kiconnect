/** Pure parsing and rendering helpers; intentionally contain no credentials or request content. */
export const CUSTOM_TYPE = "kiconnectGatewayStatus.v1";

export function normaliseHeaders(headers) {
  const result = {};
  if (!headers || typeof headers !== "object") return result;
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined && value !== null) result[String(key).toLowerCase()] = String(value);
  }
  return result;
}

function integer(value) {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function standardLimit(value) {
  return integer(typeof value === "string" ? value.split(";", 1)[0].trim() : undefined);
}

function validModel(value) {
  const model = typeof value === "string" ? value.trim() : "";
  // Header values are only display metadata. Bound it anyway, so a bad upstream
  // cannot make the terminal widget huge or inject a newline.
  return model && !/[\r\n]/.test(model) ? model.slice(0, 160) : undefined;
}

export function statusFromHeaders(headers, observedAt = Date.now()) {
  const h = normaliseHeaders(headers);
  const localGateway = h["x-gateway-ratelimit-source"] === "local-shared";
  const upstreamSource = h["x-gateway-upstream-model-source"];
  const allowedModelSource = upstreamSource === "provider-metadata" || upstreamSource === "response.model";
  const status = { observedAt };

  // Quota values are accepted only when the gateway explicitly labels them as
  // its shared SQLite state. Direct KI:connect has no equivalent truthful data.
  if (localGateway) {
    status.limit = integer(h["x-ratelimit-limit-hour"]) ?? standardLimit(h["ratelimit-limit"]);
    status.remaining = integer(h["x-ratelimit-remaining-hour"]) ?? integer(h["ratelimit-remaining"]);
    status.resetSeconds = integer(h["x-ratelimit-reset-hour"]) ?? integer(h["ratelimit-reset"]);
    status.quotaSource = "local-shared";
  }

  if (allowedModelSource) {
    const model = validModel(h["x-gateway-upstream-model"]);
    if (model) {
      status.actualModel = model;
      status.modelSource = `gateway:${upstreamSource}`;
    }
  }
  return status;
}

export function statusFromResponseModel(responseModel, observedAt = Date.now()) {
  const model = validModel(responseModel);
  return model ? { actualModel: model, modelSource: "response.body", observedAt } : {};
}

export function mergeStatus(previous, patch) {
  const next = { ...(previous || {}) };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value !== undefined) next[key] = value;
  }
  return next;
}

export function meaningfulStatus(status) {
  return Boolean(status?.actualModel || status?.limit !== undefined || status?.remaining !== undefined);
}

export function statusKey(status) {
  const s = status || {};
  return JSON.stringify({
    actualModel: s.actualModel,
    modelSource: s.modelSource,
    limit: s.limit,
    remaining: s.remaining,
    resetSeconds: s.resetSeconds,
    quotaSource: s.quotaSource,
  });
}

export function formatSeconds(seconds) {
  if (!Number.isSafeInteger(seconds) || seconds < 0) return undefined;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

export function renderStatus(status, options = {}) {
  if (!meaningfulStatus(status)) return [];
  const detailed = Boolean(options.detailed);
  const speed = Number(options.tokensPerSecond) || 0;
  const segments = [];
  if (status.actualModel) segments.push(`KI: ${status.actualModel}`);
  else segments.push("KI:connect");
  if (status.remaining !== undefined || status.limit !== undefined) {
    const remaining = status.remaining ?? "?";
    const limit = status.limit ?? "?";
    segments.push(`${remaining}/${limit}/h`);
  }
  if (!detailed && speed > 0) segments.push(`${Math.round(speed)} T/s`);
  if (!detailed) return [segments.join(" · ")];

  const lines = [segments.join(" · ")];
  if (status.modelSource) lines.push(`  actual model source: ${status.modelSource}`);
  if (status.resetSeconds !== undefined) lines.push(`  quota reset: ${formatSeconds(status.resetSeconds) ?? "?"}`);
  if (speed > 0) lines.push(`  generation speed: ${Math.round(speed)} T/s`);
  if (status.observedAt) lines.push(`  observed: ${new Date(status.observedAt).toISOString()}`);
  return lines;
}

export function restoreStatus(entries) {
  if (!Array.isArray(entries)) return undefined;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== "custom" || entry.customType !== CUSTOM_TYPE || !entry.data || typeof entry.data !== "object") continue;
    const data = entry.data;
    const restored = {
      actualModel: validModel(data.actualModel),
      modelSource: typeof data.modelSource === "string" ? data.modelSource.slice(0, 80) : undefined,
      limit: typeof data.limit === "number" && Number.isSafeInteger(data.limit) && data.limit >= 0 ? data.limit : undefined,
      remaining: typeof data.remaining === "number" && Number.isSafeInteger(data.remaining) && data.remaining >= 0 ? data.remaining : undefined,
      resetSeconds: typeof data.resetSeconds === "number" && Number.isSafeInteger(data.resetSeconds) && data.resetSeconds >= 0 ? data.resetSeconds : undefined,
      quotaSource: data.quotaSource === "local-shared" ? data.quotaSource : undefined,
      observedAt: typeof data.observedAt === "number" && Number.isFinite(data.observedAt) ? data.observedAt : undefined,
    };
    return meaningfulStatus(restored) ? restored : undefined;
  }
  return undefined;
}
