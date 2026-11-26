// Configuration par défaut et validation du Log Bus.
// Tout est surchargeable via createLogBus({ ... }).
import { VALID_IP_MODES } from "./privacy.js";

export const DEFAULTS = {
  table: "api_logs",
  retentionDays: 180,          // RGPD / CNIL : 6 mois à 1 an (à aligner avec pg_cron)
  slowThresholdMs: 1000,       // au-delà, la requête est jugée lente

  // Écriture par lots : un seul lot en vol à la fois
  batchSize: 50,
  flushIntervalMs: 2000,
  maxBufferSize: 1000,         // plafond mémoire : attente + lot en cours
  maxRetries: 2,               // 2 réessais => 3 tentatives au total
  retryBaseDelayMs: 500,       // backoff exponentiel : 500 ms puis 1000 ms
  insertTimeoutMs: 5000,       // délai max par écriture
  shutdownTimeoutMs: 10000,    // durée max de shutdown() avant repli stderr
  fallback: null,              // (entries, reason) => void ; défaut : JSON sur stderr

  maxBodyLength: 2000,
  ipMode: "truncate",          // 'none' | 'truncate' | 'hash' | 'full'
  hashSalt: null,              // lu dynamiquement via process.env.LOG_HASH_SALT dans createLogBus
  logAbortedRequests: true,
  ignoreErrorsOnIgnoredRoutes: false,

  // Alertes
  alertReasons: ["server_error", "auth_failure", "rate_limited"],
  alertThrottleMs: 60000,      // 1 alerte max / (reason, méthode, route) / minute ; 0 = désactivé

  console: false,

  // Métriques temps réel (getStats)
  statsWindowMs: 5 * 60 * 1000,
  statsBucketMs: 10 * 1000,
  statsMaxSamples: 2000,

  customDecide: null,

  // Utilisateur courant : Auth Bus (req.auth.user) ou req.user
  getUserId: (req) => req?.auth?.user?.id ?? req?.user?.id ?? null,

  ignoreRoutes: [/^\/health/, /^\/metrics/, /^\/favicon/],
  alwaysLogRoutes: [/^\/auth/, /^\/login/, /^\/admin/, /\/password/, /\/payment/],

  sensitiveKeys: [
    "password", "pass", "pwd", "mdp", "secret", "token", "access_token",
    "refresh_token", "authorization", "cookie", "set-cookie", "api_key",
    "apikey", "x-api-key", "card", "card_number", "cardnumber", "cvv", "cvc",
    "iban", "bic", "ssn", "nir", "otp", "code_2fa", "pin", "private_key",
    "client_secret", "session_id", "jwt", "webhook_secret", "signature",
  ],
};

const POSITIVE_OPTIONS = ["batchSize", "flushIntervalMs", "insertTimeoutMs", "shutdownTimeoutMs", "retentionDays"];
const NON_NEGATIVE_OPTIONS = ["maxBufferSize", "maxRetries", "retryBaseDelayMs", "alertThrottleMs"];

export function validateConfig(cfg) {
  if (!VALID_IP_MODES.has(cfg.ipMode)) {
    throw new RangeError(`Log Bus : ipMode invalide ("${cfg.ipMode}"). Valeurs autorisées : none, truncate, hash, full.`);
  }
  if (cfg.ipMode === "hash" && (!cfg.hashSalt || String(cfg.hashSalt).length < 16)) {
    throw new Error('Log Bus : ipMode="hash" exige un LOG_HASH_SALT stable d\'au moins 16 caractères.');
  }
  for (const field of POSITIVE_OPTIONS) {
    if (!Number.isFinite(cfg[field]) || cfg[field] <= 0) {
      throw new RangeError(`Log Bus : l'option "${field}" doit être un nombre strictement positif.`);
    }
  }
  for (const field of NON_NEGATIVE_OPTIONS) {
    if (!Number.isFinite(cfg[field]) || cfg[field] < 0) {
      throw new RangeError(`Log Bus : l'option "${field}" doit être un nombre >= 0.`);
    }
  }
}
