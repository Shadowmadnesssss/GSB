// Erreur unique du SDK : toute requête qui échoue lève une BusError.

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

// Codes de l'API qui veulent dire « la session n'est pas (ou plus) valable ».
export const SESSION_CODES = new Set([
  "NO_TOKEN", "MALFORMED", "TOKEN_EXPIRED", "TOKEN_INVALID", "USER_NOT_FOUND", "USER_BANNED",
  "REFRESH_INVALID", "REFRESH_REUSED",
]);

export class BusError extends Error {
  // kind : "auth" | "forbidden" | "validation" | "rate_limit" | "server" | "unavailable"
  //      | "http" | "network" | "timeout" | "aborted"
  constructor({ kind, message, status = null, code = null, requestId = null, retryAfterMs = null, body = null, cause }) {
    super(message, cause ? { cause } : undefined);
    this.name = "BusError";
    this.kind = kind;
    this.status = status;           // code HTTP (null si la requête n'a pas abouti)
    this.code = code;               // code de l'API (ex. "TOKEN_EXPIRED", "LOGIN_FAILED"), sinon null
    this.requestId = requestId;     // à donner au support : retrouve la ligne dans les logs
    this.retryAfterMs = retryAfterMs;
    this.body = body;
  }

  get isAuthError() { return this.kind === "auth"; }
  get isForbidden() { return this.kind === "forbidden"; }
  get isValidationError() { return this.kind === "validation"; }
  get isRateLimited() { return this.kind === "rate_limit"; }
  get isRetryable() {
    return ["network", "timeout", "rate_limit"].includes(this.kind) || RETRYABLE_STATUSES.has(this.status);
  }

  toJSON() {
    return {
      name: this.name, kind: this.kind, status: this.status, code: this.code,
      message: this.message, requestId: this.requestId, retryAfterMs: this.retryAfterMs,
    };
  }
}

export function isBusError(value) {
  return value instanceof BusError;
}

// "Retry-After" en secondes ou en date HTTP -> millisecondes.
export function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

export function errorFromResponse(res, body, requestId) {
  const status = res.status;
  const obj = body && typeof body === "object" ? body : null;
  const code = typeof obj?.error === "string" && /^[A-Z][A-Z_]+$/.test(obj.error) ? obj.error : null;
  const message = obj?.message || obj?.error || (typeof body === "string" && body) || `HTTP ${status}`;

  let kind = "http";
  if (code && SESSION_CODES.has(code)) kind = "auth";
  else if (code === "LOGIN_FAILED") kind = "auth";
  else if (status === 401) kind = "auth";
  else if (status === 403) kind = "forbidden";
  else if (status === 400 || status === 422) kind = "validation";
  else if (status === 429) kind = "rate_limit";
  else if (status === 503) kind = "unavailable";
  else if (status >= 500) kind = "server";

  return new BusError({
    kind, status, code, message, body,
    requestId: obj?.request_id || res.headers.get("x-request-id") || requestId,
    retryAfterMs: parseRetryAfter(res.headers.get("retry-after")),
  });
}
