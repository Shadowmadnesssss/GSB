// Canaux d'alerte. Un Notifier est un objet avec une méthode :
//
//   async send(alert)   // alert = { ruleId, severity, message, count, threshold, windowMs, key, at }
//
// Le monitoring ne sait pas si l'alerte part par mail, SMS ou autre.
// Ajouter un canal = écrire une classe avec send(), sans toucher au monitoring
// (même idée que src/shared/auth/db.js, écrit pour être remplaçable).

// Affiche l'alerte dans la console. Canal par défaut en développement.
export class ConsoleNotifier {
  async send(alert) {
    const where = alert.key ? ` [${alert.key}]` : "";
    console.warn(`[ALERTE ${alert.severity}] ${alert.message}${where}`);
  }
}

// Enregistre les alertes au lieu de les envoyer. Sert aux tests.
export class FakeNotifier {
  sent = [];
  async send(alert) {
    this.sent.push(alert);
  }
}

// Historique des alertes dans Supabase (table monitoring_alerts, voir supabase/monitoring.sql).
// Le client est fourni par l'appelant : le monitoring n'importe pas @supabase/supabase-js.
// La clé arrive déjà réduite (IP tronquée) par le monitor : rien de plus à masquer ici.
export class SupabaseNotifier {
  #supabase;
  #table;
  constructor(supabase, { table = "monitoring_alerts" } = {}) {
    if (!supabase || typeof supabase.from !== "function") {
      throw new TypeError("SupabaseNotifier : un client Supabase est requis");
    }
    this.#supabase = supabase;
    this.#table = table;
  }
  async send(alert) {
    const { error } = await this.#supabase.from(this.#table).insert({
      created_at: new Date(alert.at).toISOString(),
      rule_id: alert.ruleId,
      severity: alert.severity,
      message: alert.message,
      count: alert.count,
      threshold: alert.threshold,
      window_ms: alert.windowMs,
      key: alert.key,
    });
    if (error) throw error;
  }
}

// Envoie à plusieurs canaux. Un canal en panne n'empêche pas les autres :
// tous sont essayés, puis les échecs sont remontés ensemble (le monitor les passe à onError).
export class MultiNotifier {
  #notifiers;
  constructor(notifiers) {
    this.#notifiers = notifiers;
  }
  async send(alert) {
    const results = await Promise.allSettled(this.#notifiers.map((n) => n.send(alert)));
    const failures = results.filter((r) => r.status === "rejected").map((r) => r.reason);
    if (failures.length > 0) throw new AggregateError(failures, `${failures.length} canal(aux) d'alerte en échec`);
  }
}
