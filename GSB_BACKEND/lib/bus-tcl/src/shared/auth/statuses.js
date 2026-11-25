// Tous les résultats possibles du bus d'auth.
// Chaque étape du bus (authentification, puis autorisation) se termine par UN de ces statuts,
// et chaque statut est émis comme événement (voir events.js).
// "level" sert au Log bus / Monitoring pour savoir si c'est normal ou suspect.

export const AuthStatus = Object.freeze({
  // --- Authentification : qui es-tu ? ---
  AUTHENTICATED: { code: "AUTHENTICATED", http: 200, level: "info" },
  PUBLIC_ROUTE:  { code: "PUBLIC_ROUTE",  http: 200, level: "info" },
  NO_TOKEN:      { code: "NO_TOKEN",      http: 401, level: "info" },
  MALFORMED:     { code: "MALFORMED",     http: 401, level: "warn" },
  TOKEN_EXPIRED: { code: "TOKEN_EXPIRED", http: 401, level: "info" },
  TOKEN_INVALID: { code: "TOKEN_INVALID", http: 401, level: "warn" },
  USER_NOT_FOUND:{ code: "USER_NOT_FOUND",http: 401, level: "warn" },
  USER_BANNED:   { code: "USER_BANNED",   http: 403, level: "warn" },

  // --- Autorisation : as-tu le droit ? ---
  AUTHORIZED:    { code: "AUTHORIZED",    http: 200, level: "info" },
  FORBIDDEN:     { code: "FORBIDDEN",     http: 403, level: "warn" },

  // --- Session : login / refresh / logout (API /auth, publiés sur "auth:session") ---
  LOGIN_SUCCESS:   { code: "LOGIN_SUCCESS",   http: 200, level: "info" },
  LOGIN_FAILED:    { code: "LOGIN_FAILED",    http: 401, level: "warn" },
  LOGIN_LOCKED:    { code: "LOGIN_LOCKED",    http: 429, level: "warn" },
  TOKEN_REFRESHED: { code: "TOKEN_REFRESHED", http: 200, level: "info" },
  REFRESH_INVALID: { code: "REFRESH_INVALID", http: 401, level: "info" },
  REFRESH_REUSED:  { code: "REFRESH_REUSED",  http: 401, level: "warn" },
  LOGGED_OUT:      { code: "LOGGED_OUT",      http: 200, level: "info" },
  BAD_REQUEST:     { code: "BAD_REQUEST",     http: 400, level: "info" },

  // --- Bug dans le bus lui-même ---
  INTERNAL_ERROR:{ code: "INTERNAL_ERROR",http: 500, level: "error" },
});

// Les statuts qui laissent passer la requête.
export const PASSING = new Set(["AUTHENTICATED", "PUBLIC_ROUTE", "AUTHORIZED"]);
