// API des logs : administration et droits RGPD, au-dessus des fonctions du Log Bus
// (exportUserLogs, anonymizeUserLogs, deleteUserLogs, purge, getRequestLogs, getStats).
//
//   GET    /admin/logs/stats                        logs:read   métriques temps réel
//   GET    /admin/logs/requests/:requestId          logs:read   tout ce qui concerne une requête
//   GET    /admin/logs/users/:userId                logs:read   logs d'un utilisateur (art. 15 avec ?full=true)
//   POST   /admin/logs/users/:userId/anonymize      logs:admin  effacement en gardant les stats (art. 17)
//   DELETE /admin/logs/users/:userId                logs:admin  suppression complète (art. 17)
//   POST   /admin/logs/purge   { olderThanDays? }   logs:admin  purge de rétention
//   GET    /auth/me/logs                            connecté    ses propres logs (art. 15)
//
// Les actions d'administration sont elles-mêmes journalisées (logAction) : qui a effacé quoi.
import { isValidUuid } from "../shared/logs/privacy.js";
import { badRequest, boolParam, intParam, isValidUserId, noStore } from "./http.js";

export function createLogsApi({
  prefix = "/admin/logs",
  selfPath = "/auth/me/logs",       // null pour ne pas exposer la route
  readPermission = "logs:read",
  adminPermission = "logs:admin",
  maxLimit = 1000,
} = {}) {
  const path = (p) => `${prefix}${p}`;

  function pagination(req, res) {
    const limit = intParam(req.query.limit, { name: "limit", min: 1, max: maxLimit, fallback: 100 });
    const offset = intParam(req.query.offset, { name: "offset", min: 0, max: 1_000_000, fallback: 0 });
    const error = limit.error || offset.error;
    if (error) { badRequest(res, error); return null; }
    return { limit: limit.value, offset: offset.value };
  }

  function userIdOr400(req, res) {
    const { userId } = req.params;
    if (!isValidUserId(userId)) { badRequest(res, "userId invalide"); return null; }
    return userId;
  }

  function register(app, { logBus, authorize, logAction }) {
    if (!logBus) throw new Error("createLogsApi : ctx.logBus manquant (utiliser setupBuses)");
    const canRead = authorize(readPermission);
    const canAdmin = authorize(adminPermission);
    const audit = (req, action, details) => logAction?.(req, action, details, "warn");

    app.get(path("/stats"), canRead, (req, res) => {
      res.json(logBus.getStats());
    });

    app.get(path("/requests/:requestId"), canRead, async (req, res) => {
      noStore(res);
      const { requestId } = req.params;
      if (!isValidUuid(requestId)) return badRequest(res, "requestId doit être un UUID");
      await logBus.flush(); // inclut les lignes encore dans le tampon
      const items = await logBus.getRequestLogs(requestId);
      res.json({ requestId, count: items.length, items });
    });

    app.get(path("/users/:userId"), canRead, async (req, res) => {
      noStore(res);
      const userId = userIdOr400(req, res);
      if (!userId) return;
      const page = pagination(req, res);
      if (!page) return;
      const full = boolParam(req.query.full);
      await logBus.flush();
      const items = await logBus.exportUserLogs(userId, { ...page, full });
      if (full) audit(req, "logs.export", { target_user_id: userId, count: items.length });
      res.json({ userId, full, ...page, count: items.length, items });
    });

    app.post(path("/users/:userId/anonymize"), canAdmin, async (req, res) => {
      const userId = userIdOr400(req, res);
      if (!userId) return;
      await logBus.flush();
      const anonymized = await logBus.anonymizeUserLogs(userId);
      audit(req, "logs.anonymize", { target_user_id: userId, count: anonymized });
      res.json({ userId, anonymized });
    });

    app.delete(path("/users/:userId"), canAdmin, async (req, res) => {
      const userId = userIdOr400(req, res);
      if (!userId) return;
      await logBus.flush();
      const deleted = await logBus.deleteUserLogs(userId);
      audit(req, "logs.delete", { target_user_id: userId, count: deleted });
      res.json({ userId, deleted });
    });

    app.post(path("/purge"), canAdmin, async (req, res) => {
      const raw = req.body?.olderThanDays;
      if (raw !== undefined && (!Number.isInteger(raw) || raw < 1 || raw > 3650)) {
        return badRequest(res, "olderThanDays doit être un entier entre 1 et 3650");
      }
      await logBus.flush();
      const purged = raw === undefined ? await logBus.purge() : await logBus.purge(raw);
      audit(req, "logs.purge", { older_than_days: raw ?? "retention", count: purged });
      res.json({ purged, olderThanDays: raw ?? null });
    });

    if (selfPath) {
      // Droit d'accès de la personne elle-même : toutes ses colonnes (art. 15), sans permission spéciale.
      app.get(selfPath, async (req, res) => {
        noStore(res);
        const page = pagination(req, res);
        if (!page) return;
        await logBus.flush();
        const items = await logBus.exportUserLogs(String(req.auth.user.id), { ...page, full: true });
        res.json({ userId: String(req.auth.user.id), ...page, count: items.length, items });
      });
    }
  }

  return { register };
}
