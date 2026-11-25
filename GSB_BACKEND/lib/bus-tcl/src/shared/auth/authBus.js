// Raccourci : crée les deux middlewares d'un coup, branchés sur le même bus d'événements.
// Les deux restent utilisables séparément (createAuthenticate / createAuthorize).
//
// API (inchangée pour setupBus.js et le reste de l'équipe) :
//   const authBus = createAuthBus({ secret, publicRoutes, events });
//   app.use(authBus.authenticate());
//   app.delete("/articles/:id", authBus.authorize("article:delete"), ...);
//   authBus.on("status", fn);                 // ou "status:TOKEN_INVALID"
//   authBus.events                            // le bus d'événements utilisé
import { createAuthenticate } from "./authenticate.js";
import { createAuthorize } from "./authorize.js";
import { createEventBus } from "../eventBus.js";

// "status" -> "auth:status", "status:X" -> "auth:status:X" ; un nom déjà préfixé est gardé tel quel.
const toEventName = (name) => (name.startsWith("auth:") ? name : `auth:${name}`);

export function createAuthBus({ events = createEventBus(), handlers, logger, ...authenticateOptions } = {}) {
  const authenticateMiddleware = createAuthenticate({ ...authenticateOptions, handlers, logger, events });
  const authorize = createAuthorize({ handlers, logger, events });

  return {
    authenticate: () => authenticateMiddleware,
    authorize,
    events,
    on: (name, listener) => events.on(toEventName(name), listener),
    off: (name, listener) => events.off(toEventName(name), listener),
  };
}
