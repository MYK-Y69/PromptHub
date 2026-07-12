const REALM = "PromptHub Viewer";
const PRIVATE_PATH_PATTERNS = [
  /^\/admin(?:\.html)?$/i,
  /^\/admin\//i,
  /^\/imports(?:\/|$)/i,
  /^\/inbox(?:\/|$)/i,
  /^\/uploads(?:\/|$)/i,
  /^\/generated(?:\/|$)/i,
  /^\/converted(?:\/|$)/i,
  /^\/extracted(?:\/|$)/i,
  /^\/data\/v2\/admin(?:\/|$)/i,
];

function authResponse(message = "Authentication required") {
  return new Response(message, {
    status: 401,
    headers: {
      "Cache-Control": "no-store",
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
    },
  });
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function readBasicCredentials(header) {
  if (!header || !header.startsWith("Basic ")) return null;

  try {
    const decoded = atob(header.slice("Basic ".length));
    const separator = decoded.indexOf(":");
    if (separator === -1) return null;

    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

export async function onRequest(context) {
  const expectedUser = context.env.PROMPTHUB_VIEWER_USER || "viewer";
  const expectedPassword = context.env.PROMPTHUB_VIEWER_PASSWORD;

  if (!expectedPassword) {
    return new Response("Access is not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const credentials = readBasicCredentials(context.request.headers.get("Authorization"));
  if (
    !credentials ||
    !timingSafeEqual(credentials.username, expectedUser) ||
    !timingSafeEqual(credentials.password, expectedPassword)
  ) {
    return authResponse();
  }

  const { pathname } = new URL(context.request.url);
  if (PRIVATE_PATH_PATTERNS.some((pattern) => pattern.test(pathname))) {
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const response = await context.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
