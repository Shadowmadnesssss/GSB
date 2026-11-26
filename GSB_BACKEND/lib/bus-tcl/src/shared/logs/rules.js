// Règles "intelligentes" : décide si une requête mérite d'être journalisée.
// Retourne { log: boolean, level?: 'info'|'warn'|'error', reason?: string }

export const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

export function defaultDecide(entry, cfg) {
  const { route = "", method, status, duration_ms, aborted } = entry;

  // Les routes de bruit (/health, /metrics) sont ignorées, sauf panne 5xx (configurable)
  const isIgnored = (cfg.ignoreRoutes || []).some((r) => r.test(route));
  if (isIgnored && (cfg.ignoreErrorsOnIgnoredRoutes || !(status >= 500))) return { log: false };

  if (status >= 500) return { log: true, level: "error", reason: "server_error" };
  if (status === 401 || status === 403) return { log: true, level: "warn", reason: "auth_failure" };
  if (status === 429) return { log: true, level: "warn", reason: "rate_limited" };

  const isSensitive = (cfg.alwaysLogRoutes || []).some((r) => r.test(route));
  const isWrite = WRITE_METHODS.includes(method);
  const isSlow = typeof duration_ms === "number" && duration_ms > cfg.slowThresholdMs;

  // Client déconnecté avant la fin de la réponse : utile seulement si la requête comptait
  if (aborted) {
    if (cfg.logAbortedRequests !== false && (isWrite || isSensitive || isSlow)) {
      return { log: true, level: "warn", reason: "client_aborted" };
    }
    return { log: false };
  }

  // Les 4xx passent avant les routes sensibles : un 404 sur /admin reste un warn
  if (status >= 400) return { log: true, level: "warn", reason: "client_error" };

  // Une requête lente (même écriture ou route sensible) remonte en warn
  if (isSlow) return { log: true, level: "warn", reason: "slow_request" };

  if (isSensitive) return { log: true, level: "info", reason: "sensitive_route" };
  if (isWrite) return { log: true, level: "info", reason: "write_action" };

  return { log: false }; // GET rapide et réussi : pas important
}

export function decide(entry, cfg) {
  const decision = defaultDecide(entry, cfg);
  if (typeof cfg.customDecide === "function") {
    const overridden = cfg.customDecide(entry, cfg, decision);
    if (overridden && typeof overridden.log === "boolean") return overridden;
  }
  return decision;
}
