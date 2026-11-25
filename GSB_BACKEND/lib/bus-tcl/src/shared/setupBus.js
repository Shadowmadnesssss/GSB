// Point d'assemblage central de tous les bus sur une application Express.
//
// Garantit l'ordre de montage :
//   1. express.json() (optionnel)
//   2. logBus.middleware        (avant l'Auth Bus : pose x-request-id et capte aussi les 401/403)
//   3. authBus.authenticate()   (vérifie le JWT et remplit req.auth)
//   4. GET /health              (expose logBus.getStats() et, si activé, monitor.stats())
//   5. Routes applicatives      (via registerRoutes ou après setupBuses + finalize())
//   6. logBus.errorHandler      (en dernier : capture 4xx/5xx sans exposer les détails 500)
//
// Tous les bus publient sur UN bus d'événements partagé (ctx.events) :
//   "auth:status", "auth:status:<CODE>"            -> Auth Bus
//   "log:entry", "log:alert", "log:storage_error"  -> Log Bus (relayés depuis logBus.on(...))
// Un futur bus (Monitoring, Anti-fraude...) n'a qu'à s'abonner à ctx.events, ou recevoir
// ce même bus via l'option "events" pour y publier à son tour (préfixe à son nom).
//
// Monitoring (option `monitor`, désactivé par défaut) : s'abonne à ce bus d'événements (jamais
// directement aux autres bus), compte, et alerte quand un seuil est dépassé. Voir docs/monitoring.md.
import express from "express";
import { createAuthBus } from "./auth/authBus.js";
import { AUTH_EVENTS } from "./auth/events.js";
import { createEventBus } from "./eventBus.js";
import { createLogBus } from "./logs/logBus.js";
import { createMemoryStorage } from "./logs/storage.js";
import { createClient } from "@supabase/supabase-js";
import {
  ConsoleNotifier, MultiNotifier, SupabaseNotifier,
  createDefaultMonitor, fromAuthEvent, fromLogStorageError,
} from "./monitoring/index.js";

function resolveLogOptions(logOptions = {}) {
  const hasSupabase = Boolean(
    (logOptions.supabaseUrl || process.env.SUPABASE_URL)
    && (logOptions.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
  if (hasSupabase || logOptions.storage || logOptions.supabase) {
    return logOptions;
  }
  return { storage: createMemoryStorage(), ...logOptions };
}

// Client Supabase partagé par le Log Bus et le monitoring (null en dev sans Supabase).
function resolveSupabase(logOptions) {
  if (logOptions.supabase) return logOptions.supabase;
  if (logOptions.storage) return null; // stockage fourni par l'appelant (ou mémoire en dev) : on ne devine rien
  const url = logOptions.supabaseUrl || process.env.SUPABASE_URL;
  const key = logOptions.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

// monitor : false (défaut) | true | { rules, notifier, alertsTable, ... } | instance déjà créée (avec ingest()).
// Sans `notifier` : alertes en console, et aussi dans Supabase (table monitoring_alerts) si Supabase est configuré.
function resolveMonitor(option, supabase) {
  if (!option) return null;
  if (typeof option.ingest === "function") return option;
  const { alertsTable, ...monitorOptions } = option === true ? {} : option;
  if (!monitorOptions.notifier) {
    monitorOptions.notifier = supabase
      ? new MultiNotifier([new ConsoleNotifier(), new SupabaseNotifier(supabase, { table: alertsTable })])
      : new ConsoleNotifier();
  }
  return createDefaultMonitor(monitorOptions);
}

export function setupBuses(app = express(), options = {}) {
  const {
    auth = {},
    log = {},
    parseJson = true,
    healthRoute = "/health",
    registerRoutes = null,
    onAlert = null,
    onStorageError = null,
    onAuthStatus = null,
    events = createEventBus(),
    monitor: monitorOption = false,
  } = options;

  if (parseJson) {
    app.use(express.json());
  }

  // 1. Création des bus
  const logOptions = resolveLogOptions(log);
  const supabase = resolveSupabase(logOptions);
  // Un seul client pour les deux bus (sinon le Log Bus en crée un lui-même).
  const logBus = createLogBus(supabase && !logOptions.supabase ? { ...logOptions, supabase } : logOptions);

  const publicRoutes = new Set(auth.publicRoutes ?? []);
  if (healthRoute) publicRoutes.add(healthRoute);

  const authBus = createAuthBus({
    secret: process.env.JWT_SECRET ?? "dev-secret-a-changer",
    ...auth,
    publicRoutes: [...publicRoutes],
    events,
  });

  // Relais Log Bus -> bus partagé (le Log Bus garde son propre logBus.on(...)).
  logBus.on("log", (entry) => events.publish("log:entry", entry));
  logBus.on("alert", (entry, { suppressed = 0 } = {}) => events.publish("log:alert", { entry, suppressed }));
  logBus.on("storage_error", (error, count) => events.publish("log:storage_error", { error, count }));

  const monitor = resolveMonitor(monitorOption, supabase);

  // 2. Abonnements optionnels (Monitoring / Anti-fraude)
  // Le monitoring écoute le bus partagé : il ne connaît ni l'Auth Bus ni le Log Bus.
  // monitor.ingest() ne lève jamais et n'attend rien : il ne peut pas ralentir une requête.
  if (monitor) {
    events.on(AUTH_EVENTS.ALL, (event) => monitor.ingest(fromAuthEvent(event)));
    events.on("log:storage_error", (payload) => monitor.ingest(fromLogStorageError(payload)));
  }
  if (typeof onAlert === "function") logBus.on("alert", onAlert);
  if (typeof onStorageError === "function") logBus.on("storage_error", onStorageError);
  if (typeof onAuthStatus === "function") authBus.on("status", onAuthStatus);

  // 3. Middlewares d'entrée dans le bon ordre
  app.use(logBus.middleware);
  app.use(authBus.authenticate());

  // 4. Route de santé exposant les métriques temps réel du Log Bus
  if (healthRoute) {
    app.get(healthRoute, (_req, res) => {
      // monitoring.stats() ne contient que des compteurs par statut, jamais d'IP ni d'identifiant.
      res.json({ ok: true, stats: logBus.getStats(), ...(monitor && { monitoring: monitor.stats() }) });
    });
  }

  let finalized = false;
  function finalize() {
    if (finalized) return;
    finalized = true;
    app.use(logBus.errorHandler);
  }

  const authorize = (...permissions) => authBus.authorize(...permissions);
  const logAction = (req, action, details, level) => logBus.logAction(req, action, details, level);

  async function shutdown(server = null) {
    if (server && typeof server.close === "function") {
      await new Promise((resolve) => server.close(() => resolve()));
    }
    await monitor?.flush(); // laisse partir les alertes en cours avant de couper
    await logBus.shutdown();
  }

  const ctx = {
    app,
    events,
    authBus,
    bus: authBus, // alias rétrocompatible avec l'Auth Bus
    logBus,
    monitor, // null si le monitoring est désactivé
    authorize,
    logAction,
    finalize,
    shutdown,
  };

  // 5. Montage des routes + finalisation automatique si registerRoutes est fourni
  if (typeof registerRoutes === "function") {
    registerRoutes(app, ctx);
    finalize();
  }

  return ctx;
}
