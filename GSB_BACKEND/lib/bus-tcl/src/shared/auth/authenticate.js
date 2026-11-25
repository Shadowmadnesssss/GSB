// Middleware 1 : AUTHENTIFICATION — « Qui es-tu ? »
// Vérifie le JWT et remplit req.auth. Ne regarde pas les permissions.
//
//   const authenticate = createAuthenticate({ secret, publicRoutes: ["/health"], events });
//   app.use(authenticate);
//
// Ce qu'il laisse dans req.auth (le contrat lu par authorize, ou par le middleware d'un autre bus) :
//   { status: "AUTHENTICATED", user: { id, username, role, status }, permissions: [...] }
import { AuthStatus } from "./statuses.js";
import { verifyRequest } from "./verifyToken.js";
import { defaultLogger } from "./events.js";
import { createFinisher } from "./finishStatus.js";
import { createEventBus } from "../eventBus.js";
import { createJsonUserStore } from "./db.js";

// "/docs/*" = tout ce qui commence par "/docs/" ; sinon égalité exacte.
function isPublic(path, publicRoutes) {
  return publicRoutes.some((route) =>
    route.endsWith("/*") ? path.startsWith(route.slice(0, -1)) : path === route
  );
}

export function createAuthenticate({
  secret,                       // obligatoire
  algorithms = ["HS256"],       // algos JWT acceptés
  publicRoutes = [],            // ex. ["/health", "/docs/*"]
  handlers = {},                // surcharge des actions par statut
  events = createEventBus(),    // bus partagé (sinon un bus privé)
  logger = defaultLogger,       // false pour désactiver
  users = createJsonUserStore(), // [GSB] { findById, getPermissions }, sync ou async
} = {}) {
  if (!secret) throw new Error("createAuthenticate : l'option 'secret' est obligatoire");

  const finish = createFinisher({ source: "authenticate", events, handlers, logger });

  function authenticate(req, res, next) {
    const startedAt = process.hrtime.bigint();
    const done = (result) => {
      req.auth = {
        status: result.status.code,
        user: result.user ?? null,
        permissions: result.permissions ?? [],
      };
      finish(req, res, next, result, startedAt);
    };
    const failed = (err) => ({ status: AuthStatus.INTERNAL_ERROR, reason: err?.message ?? String(err) });

    let result;
    try {
      result = isPublic(req.path, publicRoutes)
        ? { status: AuthStatus.PUBLIC_ROUTE }
        : verifyRequest(req, { secret, algorithms, users });
    } catch (err) {
      result = failed(err);
    }
    // [GSB] Magasin d'utilisateurs asynchrone (BDD) : on attend le résultat avant de conclure.
    if (result && typeof result.then === "function") {
      result.then(done, (err) => done(failed(err)));
      return;
    }
    done(result);
  }

  authenticate.events = events; // pour s'abonner quand on n'a pas passé de bus partagé
  return authenticate;
}
