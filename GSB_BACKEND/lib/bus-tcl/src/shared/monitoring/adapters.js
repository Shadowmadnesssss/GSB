// Adaptateurs : traduisent les événements propres à chaque bus vers le contrat
// du monitoring (voir event.js). Le monitoring reste ignorant des autres bus,
// c'est ce fichier (et lui seul) qui connaît leur format.

// Auth Bus -> monitoring.
//
// Une requête protégée par authorize() publie DEUX statuts côté Auth Bus :
// d'abord l'authentification (AUTHENTICATED...), puis l'autorisation
// (AUTHORIZED / FORBIDDEN). Pour ne pas compter la même requête deux fois,
// les deux étapes ont des sources différentes, d'après le champ `source` de l'événement :
//   - "auth"  : source "authenticate", exactement 1 événement par requête
//   - "authz" : source "authorize"
// Une règle qui veut compter des requêtes cible donc source "auth".
//
// Clé : l'IP brute (comptage en mémoire, fenêtre courte). Elle est tronquée
// au moment de l'alerte, voir `redactKey` dans monitor.js.
export function fromAuthEvent(event) {
  if (!event || typeof event !== "object") return null;
  const parsedAt = Date.parse(event.timestamp);
  return {
    source: event.source === "authorize" ? "authz" : "auth",
    code: event.status,
    level: event.level,
    key: event.ip ?? (event.userId != null ? `user:${event.userId}` : null),
    at: Number.isFinite(parsedAt) ? parsedAt : undefined,
    // Volontairement ni chemin, ni user-agent, ni raison : rien de personnel dans le monitoring.
    meta: { http: event.http, method: event.method },
  };
}

// Log Bus -> monitoring : impossible d'écrire les logs (BDD en panne).
// Reçoit la charge utile de l'événement "log:storage_error" : { error, count }.
// On ne relaie PAS les 5xx du Log Bus : les erreurs internes de l'Auth Bus y
// sont déjà vues, les compter deux fois fausserait les seuils.
export function fromLogStorageError(payload) {
  return {
    source: "log",
    code: "STORAGE_ERROR",
    level: "error",
    key: null,
    meta: { lostEntries: payload?.count ?? null },
  };
}
