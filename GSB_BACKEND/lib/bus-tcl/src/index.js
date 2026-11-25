// Point d'entrée public de la lib Bus TCL.
export { setupBuses } from "./shared/setupBus.js";

export { createEventBus } from "./shared/eventBus.js";

export { createAuthBus } from "./shared/auth/authBus.js";
export { createAuthenticate } from "./shared/auth/authenticate.js";
export { createAuthorize } from "./shared/auth/authorize.js";
export { AuthStatus } from "./shared/auth/statuses.js";
export { AUTH_EVENTS, AUTH_SESSION_EVENTS } from "./shared/auth/events.js";
export { hashPassword, verifyPassword } from "./shared/auth/passwords.js";
export { createTokenService, createMemoryRefreshStore, TokenError } from "./shared/auth/tokens.js";
export { createLoginLimiter } from "./shared/auth/loginLimiter.js";
export { createJsonUserStore, toPublicUser } from "./shared/auth/db.js";

export { createLogBus } from "./shared/logs/logBus.js";
export { createSupabaseStorage, createMemoryStorage } from "./shared/logs/storage.js";
export { decide } from "./shared/logs/rules.js";
export { redact, protectIp, isValidUuid, normalizePath, isLikelyCardNumber } from "./shared/logs/privacy.js";

export {
  createMonitor,
  createDefaultMonitor,
  loadDefaultRules,
  normalizeEvent,
  fromAuthEvent,
  fromLogStorageError,
  ConsoleNotifier,
  FakeNotifier,
  MultiNotifier,
  SupabaseNotifier,
} from "./shared/monitoring/index.js";

// API HTTP (routes auth, logs, monitoring) et CORS.
export {
  createBusApi,
  createAuthApi,
  createLogsApi,
  createMonitoringApi,
  createAlertHistory,
  createCors,
} from "./api/index.js";
