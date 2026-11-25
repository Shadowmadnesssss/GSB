// Contrat d'entrée du bus monitoring.
// Le monitoring ne connaît AUCUN bus en particulier : il reçoit des événements
// de ce format, d'où qu'ils viennent (auth aujourd'hui, un autre bus demain).
//
//   { source: "auth", code: "TOKEN_INVALID", level: "warn", key: "192.168.1.5", at: 1732450000000, meta: {} }
//
// - source : quel bus a émis l'événement
// - code   : le statut final de la requête (ex. AuthStatus.TOKEN_INVALID.code)
// - level  : "info" | "warn" | "error"
// - key    : qui est concerné (IP, id utilisateur…), optionnel
// - at     : timestamp en ms, rempli automatiquement si absent

export const LEVELS = Object.freeze(["info", "warn", "error"]);

// Renvoie un événement propre, ou null si l'entrée est inutilisable.
// Ne lève jamais d'erreur : un événement mal formé ne doit pas casser le bus émetteur.
export function normalizeEvent(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object") return null;
  const { source, code, level, key, at, meta } = raw;
  if (typeof source !== "string" || source === "") return null;
  if (typeof code !== "string" || code === "") return null;
  if (!LEVELS.includes(level)) return null;
  return {
    source,
    code,
    level,
    key: key == null ? null : String(key),
    at: Number.isFinite(at) ? at : now,
    meta: meta && typeof meta === "object" ? meta : {},
  };
}
