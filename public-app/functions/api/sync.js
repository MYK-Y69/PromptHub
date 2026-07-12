const SYNC_KEY_PREFIX = "prompthub-sync";
const MAX_BODY_BYTES = 1024 * 1024;
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/prompthub-viewer\.pages\.dev$/i,
  /^https:\/\/[a-z0-9-]+\.prompthub-viewer\.pages\.dev$/i,
  /^http:\/\/127\.0\.0\.1:\d+$/i,
  /^http:\/\/localhost:\d+$/i,
];

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowOrigin = !origin
    ? "https://prompthub-viewer.pages.dev"
    : ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin))
    ? origin
    : "null";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

function jsonResponse(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function readBasicUsername(header) {
  if (!header || !header.startsWith("Basic ")) return "viewer";

  try {
    const decoded = atob(header.slice("Basic ".length));
    const separator = decoded.indexOf(":");
    return separator === -1 ? "viewer" : decoded.slice(0, separator) || "viewer";
  } catch {
    return "viewer";
  }
}

function syncKeyFor(request) {
  const username = readBasicUsername(request.headers.get("Authorization"))
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .slice(0, 80) || "viewer";
  return `${SYNC_KEY_PREFIX}:${username}`;
}

function readStore(env) {
  return env.PROMPTHUB_SYNC;
}

export function onRequestOptions({ request }) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

export async function onRequestGet({ env, request }) {
  const store = readStore(env);
  if (!store) {
    return jsonResponse(request, { error: "sync_storage_not_configured" }, 503);
  }

  const stored = await store.get(syncKeyFor(request), "json");
  return jsonResponse(request, stored || { snapshot: null, serverUpdatedAt: null, revision: null });
}

export async function onRequestPost({ env, request }) {
  const store = readStore(env);
  if (!store) {
    return jsonResponse(request, { error: "sync_storage_not_configured" }, 503);
  }

  const bodySize = Number(request.headers.get("Content-Length") || 0);
  if (bodySize > MAX_BODY_BYTES) {
    return jsonResponse(request, { error: "sync_payload_too_large" }, 413);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(request, { error: "invalid_json" }, 400);
  }

  if (!payload || typeof payload !== "object" || !payload.snapshot || typeof payload.snapshot !== "object") {
    return jsonResponse(request, { error: "invalid_snapshot" }, 400);
  }

  const key = syncKeyFor(request);
  const current = await store.get(key, "json");
  if (current?.revision && payload.expectedRevision !== current.revision) {
    return jsonResponse(request, {
      error: "sync_conflict",
      revision: current.revision,
      serverUpdatedAt: current.serverUpdatedAt,
    }, 409);
  }

  const revision = crypto.randomUUID();
  const record = {
    schemaVersion: 1,
    serverUpdatedAt: new Date().toISOString(),
    revision,
    snapshot: payload.snapshot,
  };

  await store.put(key, JSON.stringify(record));
  return jsonResponse(request, { ok: true, revision, serverUpdatedAt: record.serverUpdatedAt });
}
