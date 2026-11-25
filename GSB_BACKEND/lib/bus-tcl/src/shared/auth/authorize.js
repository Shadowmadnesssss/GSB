// Middleware 2 : AUTORISATION — « As-tu le droit ? »
// Ne lit pas le JWT : il se contente de req.auth, rempli par un middleware d'authentification
// placé avant (le nôtre, ou n'importe quel autre qui respecte le même format).
//
//   const authorize = createAuthorize({ events });
//   app.delete("/articles/:id", authorize("article:delete"), handler);
import { AuthStatus } from "./statuses.js";
import { missingPermissions } from "./permissions.js";
import { defaultLogger } from "./events.js";
import { createFinisher } from "./finishStatus.js";
import { createEventBus } from "../eventBus.js";

export function createAuthorize({
  handlers = {},                // surcharge des actions par statut
  events = createEventBus(),    // bus partagé (sinon un bus privé)
  logger = defaultLogger,       // false pour désactiver
} = {}) {
  const finish = createFinisher({ source: "authorize", events, handlers, logger });

  function authorize(...required) {
    if (required.length === 0 || required.some((p) => typeof p !== "string" || !p)) {
      // Sans permission, authorize() laisserait tout passer : on préfère planter au démarrage.
      throw new Error("authorize() : indique au moins une permission, ex. authorize('article:read')");
    }

    return function authorizeMiddleware(req, res, next) {
      const startedAt = process.hrtime.bigint();
      let result;
      if (!req.auth) {
        // Aucun middleware d'authentification avant : erreur de config, pas du client.
        result = { status: AuthStatus.INTERNAL_ERROR, reason: "authorize() utilisé sans authentification avant", required };
      } else if (!req.auth.user) {
        // Route publique (pas de token lu) mais permission demandée.
        result = { status: AuthStatus.NO_TOKEN, reason: "Permission demandée sur une route sans utilisateur", required };
      } else {
        const missing = missingPermissions(req.auth.permissions ?? [], required);
        result = missing.length === 0
          ? { status: AuthStatus.AUTHORIZED, user: req.auth.user, required }
          : { status: AuthStatus.FORBIDDEN, user: req.auth.user, required, reason: `Manque : ${missing.join(", ")}` };
      }
      finish(req, res, next, result, startedAt);
    };
  }

  authorize.events = events;
  return authorize;
}
