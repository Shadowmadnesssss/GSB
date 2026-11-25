// Format des événements publiés par la partie auth, et noms sous lesquels ils sont publiés.
// C'est le "contrat" à partager avec l'équipe.
import { normalizePath, protectIp, redactString } from "../logs/privacy.js";

// Noms d'événements sur le bus d'événements (createEventBus) :
//  - "auth:status"          -> TOUS les statuts (pour le Log bus)
//  - "auth:status:<CODE>"   -> un seul cas (ex. l'Anti-fraude sur TOKEN_INVALID)
// Via createAuthBus().on(), les noms courts "status" / "status:<CODE>" restent acceptés.
export const AUTH_EVENTS = Object.freeze({
  ALL: "auth:status",
  of: (code) => `auth:status:${code}`,
});

// Événements de session (login, refresh, logout) publiés par l'API /auth.
// Canal séparé de "auth:status" : le monitoring compte "auth:status" comme une requête,
// et la requête de login y est déjà comptée (PUBLIC_ROUTE) ; on ne la compte pas deux fois.
export const AUTH_SESSION_EVENTS = Object.freeze({
  ALL: "auth:session",
  of: (code) => `auth:session:${code}`,
});

// source = "authenticate" ou "authorize" : le middleware qui a produit le statut.
export function buildEvent(source, req, result, startedAt) {
  return {
    source,
    requestId: req.requestId ?? null,    // posé par le Log Bus : relie cet événement à sa ligne de log
    status: result.status.code,          // ex. "TOKEN_EXPIRED"
    level: result.status.level,          // info | warn | error
    http: result.status.http,            // code HTTP renvoyé
    reason: result.reason ?? null,       // détail lisible (pas renvoyé au client)
    userId: result.user?.id ?? null,
    role: result.user?.role ?? null,
    method: req.method,
    path: req.originalUrl ?? req.url,
    ip: req.ip ?? req.socket?.remoteAddress ?? null,
    userAgent: req.headers["user-agent"] ?? null,
    required: result.required ?? null,   // permissions demandées (autorisation)
    durationMs: Number((process.hrtime.bigint() - startedAt) / 1000n) / 1000,
    timestamp: new Date().toISOString(),
  };
}

// Logger par défaut : une ligne JSON nettoyée par statut (sans query string ni IP complète).
// À désactiver (logger: false) quand le Log bus de l'équipe prend le relais.
export function defaultLogger(event) {
  const safeEvent = {
    ...event,
    path: event.path ? normalizePath(String(event.path).split("?")[0]) : null,
    ip: protectIp(event.ip, "truncate"),
    reason: event.reason ? redactString(String(event.reason)) : null,
  };
  const line = JSON.stringify(safeEvent);
  if (event.level === "error") console.error(line);
  else if (event.level === "warn") console.warn(line);
  else console.log(line);
}
