import { readFileSync } from "node:fs";
import { createMonitor } from "./monitor.js";
import { truncateIp } from "./redact.js";

export { createMonitor } from "./monitor.js";
export { normalizeEvent } from "./event.js";
export { truncateIp } from "./redact.js";
export { CounterCache } from "./cache.js";
export { fromAuthEvent, fromLogStorageError } from "./adapters.js";
export { ConsoleNotifier, FakeNotifier, MultiNotifier, SupabaseNotifier } from "./notifiers.js";

// Règles par défaut, lues dans rules.json. Les seuils sont en config, pas en dur dans le code.
export function loadDefaultRules() {
  return JSON.parse(readFileSync(new URL("./rules.json", import.meta.url)));
}

// Par défaut, les IP des alertes sont tronquées (/24 en IPv4), comme dans le Log Bus.
export function createDefaultMonitor(options = {}) {
  return createMonitor({
    rules: loadDefaultRules(),
    redactKey: truncateIp,
    ...options,
  });
}
