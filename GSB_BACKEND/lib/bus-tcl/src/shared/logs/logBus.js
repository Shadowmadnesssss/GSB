// Log Bus : journalisation sélective Express, conforme RGPD et résiliente.
//
//   const logBus = createLogBus();
//   app.use(logBus.middleware);      // avant l'Auth Bus : pose x-request-id et capte 401/403
//   app.use(authBus.authenticate());
//   ...routes...  logBus.logAction(req, "order.create", { order_id });
//   app.use(logBus.errorHandler);    // en dernier : capture 4xx/5xx
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { STATUS_CODES } from "node:http";
import { createClient } from "@supabase/supabase-js";

import { DEFAULTS, validateConfig } from "./config.js";
import { decide, WRITE_METHODS } from "./rules.js";
import { redact, redactString, truncate, protectIp, isValidUuid, sanitizeString, normalizePath } from "./privacy.js";
import { createSupabaseStorage } from "./storage.js";
import { createMetrics } from "./metrics.js";
import { createAlertThrottler } from "./alerts.js";
import { createLogBuffer } from "./buffer.js";

const VALID_LEVELS = new Set(["info", "warn", "error"]);
const PASSING_AUTH_STATUSES = new Set(["PUBLIC_ROUTE", "AUTHENTICATED", "AUTHORIZED"]);

function resolveStorage(cfg) {
  if (cfg.storage) return cfg.storage;
  let supabase = cfg.supabase;
  if (!supabase) {
    const url = cfg.supabaseUrl || process.env.SUPABASE_URL;
    const key = cfg.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Log Bus : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis (ou fournissez l'option 'storage').");
    }
    supabase = createClient(url, key, { auth: { persistSession: false } });
  }
  return createSupabaseStorage(supabase, cfg.table);
}

export function createLogBus(options = {}) {
  const cfg = {
    ...DEFAULTS,
    ...options,
    hashSalt: options.hashSalt ?? process.env.LOG_HASH_SALT ?? "",
  };
  validateConfig(cfg);

  const sensitive = new Set((cfg.sensitiveKeys || []).map((k) => k.toLowerCase()));
  const storage = resolveStorage(cfg);
  const bus = new EventEmitter();
  const metrics = createMetrics({ windowMs: cfg.statsWindowMs, bucketMs: cfg.statsBucketMs, maxSamples: cfg.statsMaxSamples });

  function emitSafe(event, ...args) {
    // Isole les abonnés synchrones ET asynchrones pour ne jamais faire planter l'API
    for (const listener of bus.listeners(event)) {
      try {
        const res = listener(...args);
        if (res && typeof res.then === "function") {
          res.catch((err) => {
            metrics.counters.internal_errors++;
            if (event !== "internal_error") emitSafe("internal_error", err);
          });
        }
      } catch (err) {
        metrics.counters.internal_errors++;
        if (event !== "internal_error") emitSafe("internal_error", err);
      }
    }
  }

  const maybeAlert = createAlertThrottler({
    reasons: cfg.alertReasons,
    throttleMs: cfg.alertThrottleMs,
    onEmit: (entry, meta) => emitSafe("alert", entry, meta),
    onSuppress: () => { metrics.counters.alerts_suppressed++; },
  });

  const buffer = createLogBuffer({ storage, cfg, counters: metrics.counters, emit: emitSafe });

  function push(entry) {
    if (cfg.console) {
      const stream = entry.level === "error" ? process.stderr : process.stdout;
      stream.write(`${JSON.stringify(entry)}\n`);
    }
    emitSafe("log", entry);
    maybeAlert(entry);
    buffer.enqueue(entry);
  }

  function extractRoute(req) {
    if (!req) return null;
    // baseUrl peut contenir des paramètres résolus (/users/jean@x.fr) : on le normalise toujours
    const raw = req.route?.path
      ? `${normalizePath(req.baseUrl || "")}${req.route.path}`
      : normalizePath((req.originalUrl || req.url || "").split("?")[0]);
    return sanitizeString(raw, 255);
  }

  function baseEntry(req, precomputed = null) {
    let userId = null;
    try {
      const rawId = req ? cfg.getUserId(req) : null;
      userId = rawId == null ? null : sanitizeString(rawId, 128);
    } catch {
      userId = null;
    }
    const rawUa = req ? (req.get?.("user-agent") || req.headers?.["user-agent"] || "") : "";
    return {
      created_at: new Date().toISOString(),
      request_id: req?.requestId && isValidUuid(req.requestId) ? req.requestId : null,
      id_user: userId,
      method: precomputed ? precomputed.method : (req?.method ? sanitizeString(req.method, 10) : null),
      route: precomputed ? precomputed.route : extractRoute(req),
      ip: req ? protectIp(req.ip || req.socket?.remoteAddress, cfg.ipMode, cfg.hashSalt) : null,
      user_agent: rawUa ? sanitizeString(rawUa, 255) : null,
    };
  }

  function middleware(req, res, next) {
    const start = process.hrtime.bigint();
    const incomingId = req.get?.("x-request-id") || req.headers?.["x-request-id"];
    if (isValidUuid(incomingId)) {
      req.requestId = incomingId.trim();
    } else {
      req.requestId = crypto.randomUUID();
      if (incomingId) req.clientRequestId = sanitizeString(incomingId, 128);
    }
    res.setHeader("x-request-id", req.requestId);

    let recorded = false;
    function recordOutcome(aborted) {
      if (recorded) return;
      recorded = true;
      try {
        const durationMs = Math.round(Number(process.hrtime.bigint() - start) / 1e4) / 100;
        const status = aborted ? 499 : res.statusCode;
        const route = extractRoute(req);
        const method = req?.method ? sanitizeString(req.method, 10) : null;

        // Décide AVANT de construire baseEntry (évite IP/HMAC, Date et user-agent sur les GET 200 ignorés)
        const base = cfg.customDecide ? baseEntry(req, { route, method }) : null;
        const candidate = base
          ? { ...base, status, duration_ms: durationMs, aborted }
          : { route, method, status, duration_ms: durationMs, aborted };

        const decision = decide(candidate, cfg);
        metrics.recordRequest({ status, duration_ms: durationMs, logged: decision.log, reason: decision.reason, aborted });
        if (!decision.log) return;

        const entry = {
          ...(base || baseEntry(req, { route, method })),
          status,
          duration_ms: durationMs,
          level: VALID_LEVELS.has(decision.level) ? decision.level : "info",
          reason: sanitizeString(decision.reason, 40),
        };

        const rawParams = { ...(req.params || {}), ...(req.query || {}) };
        entry.params = Object.keys(rawParams).length ? truncate(redact(rawParams, sensitive), cfg.maxBodyLength) : null;

        if (entry.level !== "info" || WRITE_METHODS.includes(req.method)) {
          entry.body = req.body !== undefined ? truncate(redact(req.body, sensitive), cfg.maxBodyLength) : null;
        }

        const meta = {};
        const errInfo = res.locals?.logError;
        if (errInfo) {
          meta.error = redactString(String(errInfo.message ?? errInfo)).slice(0, 500);
          if (errInfo.name) meta.error_name = sanitizeString(errInfo.name, 64);
          if (errInfo.code) meta.error_code = sanitizeString(errInfo.code, 64);
        }
        if (req.auth?.status) meta.auth_status = sanitizeString(req.auth.status, 40);
        if (req.clientRequestId) meta.client_request_id = req.clientRequestId;
        if (aborted) meta.aborted = true;
        if (Object.keys(meta).length) entry.meta = meta;

        push(entry);
      } catch (err) {
        metrics.counters.internal_errors++;
        emitSafe("internal_error", err);
      }
    }

    res.on("finish", () => recordOutcome(false));
    res.on("close", () => { if (!res.writableEnded) recordOutcome(true); });
    next();
  }

  function errorHandler(err, req, res, next) {
    const rawStatus = Number(err?.status || err?.statusCode);
    const status = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;
    res.locals = res.locals || {};
    res.locals.logError = { name: err?.name || "Error", message: err?.message || String(err), code: err?.code };
    if (res.headersSent) return next(err);

    const clientMessage = status >= 500
      ? "Internal Server Error"
      : (err?.expose && err?.message ? sanitizeString(err.message, 200) : STATUS_CODES[status] || "Error");
    res.status(status).json({ error: clientMessage, request_id: req.requestId });
  }

  function logAction(req, action, details = {}, level = "info") {
    const entry = {
      ...baseEntry(req),
      level: VALID_LEVELS.has(level) ? level : "info",
      reason: "business_action",
      action: sanitizeString(action, 100),
      meta: details && Object.keys(details).length ? truncate(redact(details, sensitive), cfg.maxBodyLength) : null,
    };
    push(entry);
    return entry;
  }

  function write(event, { includePassing = false } = {}) {
    if (!event || typeof event !== "object") return null;
    const isAuthEvent = typeof event.status === "string" && typeof event.http === "number";
    if (isAuthEvent && !includePassing && PASSING_AUTH_STATUSES.has(event.status)) return null;

    const rawStatus = isAuthEvent ? event.http : event.status;
    const httpStatus = Number.isInteger(rawStatus) && rawStatus >= 100 && rawStatus <= 599 ? rawStatus : null;
    const rawTs = event.timestamp || event.created_at;
    const createdAt = rawTs && Number.isFinite(Date.parse(rawTs)) ? new Date(rawTs).toISOString() : new Date().toISOString();
    const rawPath = (event.route ?? event.path ?? "").split("?")[0];
    const reqId = event.request_id || event.requestId;
    const rawUser = event.id_user ?? event.userId;
    const dur = event.duration_ms ?? event.durationMs;

    const meta = {};
    if (isAuthEvent) meta.auth_status = sanitizeString(event.status, 40);
    if (event.reason && isAuthEvent) meta.detail = redactString(String(event.reason)).slice(0, 500);
    if (event.role) meta.role = sanitizeString(event.role, 64);
    if (Array.isArray(event.required) && event.required.length) meta.required = event.required.slice(0, 20);
    if (event.meta && typeof event.meta === "object") Object.assign(meta, redact(event.meta, sensitive));

    const entry = {
      created_at: createdAt,
      request_id: isValidUuid(reqId) ? reqId.trim() : null,
      id_user: rawUser == null ? null : sanitizeString(rawUser, 128),
      method: event.method ? sanitizeString(event.method, 10) : null,
      route: rawPath ? sanitizeString(normalizePath(rawPath), 255) : null,
      status: httpStatus,
      duration_ms: typeof dur === "number" ? Math.round(dur * 100) / 100 : null,
      level: VALID_LEVELS.has(event.level) ? event.level : (httpStatus >= 500 ? "error" : (httpStatus >= 400 ? "warn" : "info")),
      reason: isAuthEvent
        ? (httpStatus >= 500 ? "server_error" : (httpStatus === 401 || httpStatus === 403 ? "auth_failure" : "auth_event"))
        : sanitizeString(event.reason || "bus_event", 40),
      action: sanitizeString(event.action || (isAuthEvent ? `auth.${event.status}` : null), 100),
      ip: protectIp(event.ip, cfg.ipMode, cfg.hashSalt),
      user_agent: event.userAgent || event.user_agent ? sanitizeString(event.userAgent || event.user_agent, 255) : null,
      meta: Object.keys(meta).length ? truncate(meta, cfg.maxBodyLength) : null,
    };

    push(entry);
    return entry;
  }

  return Object.assign(bus, {
    middleware,
    errorHandler,
    logAction,
    write,
    flush: () => buffer.flush(),
    shutdown: () => buffer.shutdown(),
    getStats: () => metrics.snapshot(buffer.sizes()),
    resetStats: () => metrics.reset(),
    purge: (days = cfg.retentionDays) => storage.purgeOlderThan(days),
    exportUserLogs: (idUser, opts) => storage.findByUser(idUser, opts),
    anonymizeUserLogs: (idUser) => storage.anonymizeByUser(idUser),
    deleteUserLogs: (idUser) => storage.deleteByUser(idUser),
    getRequestLogs: (requestId) => storage.findByRequestId(requestId),
  });
}
