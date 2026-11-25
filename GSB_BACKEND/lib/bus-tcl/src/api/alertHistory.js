// Historique des alertes du monitoring, en mémoire, pour l'API d'administration.
//
// Le monitoring envoie ses alertes à un "notifier" (un objet avec send(alert)).
// On en ajoute un de plus qui garde les N dernières alertes :
//
//   const history = createAlertHistory();
//   setupBuses(app, { monitor: { notifier: new MultiNotifier([new ConsoleNotifier(), history.notifier]) } });
//
// En production, l'historique durable reste la table Supabase monitoring_alerts (SupabaseNotifier).
export function createAlertHistory({ max = 200 } = {}) {
  let items = [];

  return {
    notifier: {
      async send(alert) {
        items.push({ ...alert, createdAt: new Date(alert.at ?? Date.now()).toISOString() });
        if (items.length > max) items = items.slice(items.length - max);
      },
    },

    // Plus récentes d'abord.
    list({ limit = 50, severity } = {}) {
      const filtered = severity ? items.filter((a) => a.severity === severity) : items;
      return filtered.slice(-limit).reverse();
    },

    clear() {
      items = [];
    },

    get size() {
      return items.length;
    },
  };
}
