// Bus monitoring : reçoit les statuts des autres bus, les compte, et alerte si un seuil est dépassé.
//
//   const monitor = createMonitor({ rules, notifier });
//   monitor.ingest({ source: "auth", code: "TOKEN_INVALID", level: "warn", key: ip });
//
// Deux règles de sécurité :
// - ingest() ne lève JAMAIS d'erreur et n'attend rien : si le monitoring plante,
//   le bus qui l'appelle continue (fail-open).
// - l'envoi d'alerte est asynchrone, hors du chemin de la requête : un SMS qui
//   tombe en panne ne ralentit ni ne bloque personne.

import { CounterCache } from "./cache.js";
import { normalizeEvent } from "./event.js";
import { ConsoleNotifier } from "./notifiers.js";

const SWEEP_EVERY = 200; // purge des compteurs expirés toutes les N entrées

function matches(rule, event) {
  const m = rule.match ?? {};
  return (
    (m.source === undefined || m.source === event.source) &&
    (m.code === undefined || m.code === event.code) &&
    (m.level === undefined || m.level === event.level)
  );
}

export function createMonitor({
  rules = [],
  notifier = new ConsoleNotifier(),
  cache = new CounterCache(),
  now = Date.now,
  // Transforme la clé avant qu'elle ne sorte dans une alerte (console, mail, SMS).
  // Les compteurs, eux, gardent la clé brute en mémoire le temps d'une fenêtre.
  redactKey = (key) => key,
  onError = (err) => console.error("[monitoring]", err),
} = {}) {
  const totals = new Map(); // "source:code" -> nombre total vu
  const lastAlertAt = new Map(); // "règle|clé" -> timestamp de la dernière alerte (cooldown)
  const pending = new Set(); // envois en cours (pour flush())
  let received = 0;
  let rejected = 0;

  function dispatch(alert) {
    const job = new Promise((resolve) => setImmediate(resolve))
      .then(() => notifier.send(alert))
      .catch(onError)
      .finally(() => pending.delete(job));
    pending.add(job);
  }

  function sweep(t) {
    cache.purge(t);
    for (const [k, at] of lastAlertAt) {
      // un cooldown terminé n'a plus besoin d'être gardé
      const ruleId = k.split("|")[0];
      const rule = rules.find((r) => r.id === ruleId);
      if (!rule || t - at >= rule.cooldownMs) lastAlertAt.delete(k);
    }
  }

  function evaluate(rule, event, t) {
    // Une règle "par clé" n'a pas de sens sans clé : on l'ignore.
    if (rule.scope === "key" && event.key === null) return;
    const scopeKey = rule.scope === "key" ? event.key : "*";
    const id = `${rule.id}|${scopeKey}`;

    const count = cache.increment(id, rule.windowMs, t);
    if (count < rule.threshold) return;

    // Cooldown : une seule alerte par règle et par clé, même si le seuil reste dépassé.
    const last = lastAlertAt.get(id);
    if (last !== undefined && t - last < rule.cooldownMs) return;
    lastAlertAt.set(id, t);

    dispatch({
      ruleId: rule.id,
      severity: rule.severity,
      message: `${rule.description ?? rule.id} : ${count} événements en ${rule.windowMs / 1000}s (seuil ${rule.threshold})`,
      count,
      threshold: rule.threshold,
      windowMs: rule.windowMs,
      key: rule.scope === "key" ? redactKey(event.key) : null,
      at: t,
    });
  }

  function ingest(raw) {
    try {
      const t = now();
      const event = normalizeEvent(raw, t);
      if (!event) {
        rejected += 1;
        return false;
      }
      received += 1;
      const tk = `${event.source}:${event.code}`;
      totals.set(tk, (totals.get(tk) ?? 0) + 1);

      for (const rule of rules) {
        if (matches(rule, event)) evaluate(rule, event, t);
      }
      if (received % SWEEP_EVERY === 0) sweep(t);
      return true;
    } catch (err) {
      try {
        onError(err);
      } catch {
        /* le monitoring ne doit jamais faire tomber l'appelant */
      }
      return false;
    }
  }

  return {
    ingest,
    // Attend la fin des envois d'alertes en cours. Utile pour les tests et l'arrêt propre.
    async flush() {
      while (pending.size > 0) await Promise.allSettled([...pending]);
    },
    // Photo de l'état : combien d'événements de chaque statut ont été vus.
    stats() {
      return {
        received,
        rejected,
        totals: Object.fromEntries(totals),
        activeCounters: cache.size,
      };
    },
  };
}
