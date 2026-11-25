// Petits outils partagés par les routes de l'API.

// Réponse d'erreur au même format que l'Auth Bus : { error: "CODE", message }.
export function sendError(res, http, code, message, { retryAfterMs } = {}) {
  if (retryAfterMs != null) res.set("retry-after", String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
  return res.status(http).json({ error: code, message });
}

export const badRequest = (res, message) => sendError(res, 400, "BAD_REQUEST", message);

// Entier borné lu dans la query string. Renvoie { value } ou { error }.
export function intParam(raw, { name, min, max, fallback }) {
  if (raw === undefined || raw === "") return { value: fallback };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    return { error: `${name} doit être un entier entre ${min} et ${max}` };
  }
  return { value: n };
}

export function boolParam(raw) {
  return raw === "true" || raw === "1" || raw === true;
}

// Identifiant d'utilisateur reçu dans une URL : court et sans caractères exotiques.
export function isValidUserId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.@:-]{1,128}$/.test(value);
}

// Les réponses qui contiennent des jetons ou des données personnelles ne doivent pas être mises en cache.
export function noStore(res) {
  res.set("cache-control", "no-store");
  res.set("pragma", "no-cache");
}
