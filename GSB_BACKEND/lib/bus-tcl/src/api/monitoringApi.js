// API du monitoring, au-dessus de monitor.stats() et de l'historique des alertes.
//
//   GET /admin/monitoring/stats                       monitoring:read  compteurs par statut
//   GET /admin/monitoring/alerts?limit=&severity=     monitoring:read  dernières alertes
//
// Si le monitoring n'est pas activé (setupBuses sans option monitor) : 503 MONITORING_DISABLED.
import { intParam, badRequest, sendError } from "./http.js";

const SEVERITIES = new Set(["info", "warn", "error"]);

export function createMonitoringApi({
  prefix = "/admin/monitoring",
  permission = "monitoring:read",
  history = null,                    // createAlertHistory()
} = {}) {
  const path = (p) => `${prefix}${p}`;

  function register(app, { monitor, authorize }) {
    const canRead = authorize(permission);

    app.get(path("/stats"), canRead, (req, res) => {
      if (!monitor) return sendError(res, 503, "MONITORING_DISABLED", "Le monitoring n'est pas activé");
      res.json(monitor.stats());
    });

    app.get(path("/alerts"), canRead, (req, res) => {
      if (!history) return sendError(res, 503, "ALERT_HISTORY_DISABLED", "Aucun historique d'alertes configuré");
      const limit = intParam(req.query.limit, { name: "limit", min: 1, max: 500, fallback: 50 });
      if (limit.error) return badRequest(res, limit.error);
      const { severity } = req.query;
      if (severity !== undefined && !SEVERITIES.has(severity)) {
        return badRequest(res, "severity doit valoir info, warn ou error");
      }
      const items = history.list({ limit: limit.value, severity });
      res.json({ count: items.length, items });
    });
  }

  return { register };
}
