// Étape 4 : transformer une requête en statut d'authentification.
// Cette fonction ne répond jamais au client : elle se contente de dire CE QUI SE PASSE.
// C'est le bus (authBus.js) qui décide ensuite quoi faire de ce statut.
//
// [GSB] Patch : le magasin d'utilisateurs est injectable (option `users`, comme pour createAuthApi),
// ses fonctions peuvent être sync ou async. Sans `users`, comportement d'origine (fichiers JSON).
// Avec un magasin sync, le résultat reste synchrone ; avec un magasin async, c'est une Promise.
import jwt from "jsonwebtoken";
import { AuthStatus } from "./statuses.js";
import { createJsonUserStore, toPublicUser } from "./db.js";

const isThenable = (value) => value !== null && typeof value === "object" && typeof value.then === "function";
const then = (value, fn) => (isThenable(value) ? value.then(fn) : fn(value));

// Lit le header "Authorization: Bearer <token>".
function extractToken(req) {
  const header = req.headers.authorization;
  if (!header) return { status: AuthStatus.NO_TOKEN };

  const [scheme, token, ...rest] = header.split(" ");
  if (scheme !== "Bearer" || !token || rest.length > 0) {
    return { status: AuthStatus.MALFORMED, reason: "Format attendu : Bearer <token>" };
  }
  return { token };
}

export function verifyRequest(req, { secret, algorithms, users = createJsonUserStore() }) {
  const extracted = extractToken(req);
  if (extracted.status) return extracted;

  // 1. Signature + expiration du JWT
  let payload;
  try {
    // "algorithms" est imposé : sinon un attaquant pourrait choisir l'algo (ex. "none").
    payload = jwt.verify(extracted.token, secret, { algorithms });
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return { status: AuthStatus.TOKEN_EXPIRED, reason: `Expiré le ${err.expiredAt.toISOString()}` };
    }
    // JsonWebTokenError (signature fausse, token illisible...) ou NotBeforeError
    return { status: AuthStatus.TOKEN_INVALID, reason: err.message };
  }

  // 2. L'utilisateur existe-t-il encore et a-t-il le droit d'être là ?
  // toPublicUser : req.auth.user ne doit jamais contenir le hash du mot de passe.
  return then(users.findById(payload.sub), (found) => {
    const user = toPublicUser(found);
    if (!user) return { status: AuthStatus.USER_NOT_FOUND, reason: `sub=${payload.sub}` };
    if (user.status === "banned") return { status: AuthStatus.USER_BANNED, user };

    // 3. Tout est bon : on joint les permissions du rôle pour l'étape d'autorisation.
    return then(users.getPermissions(user.role), (permissions) => ({
      status: AuthStatus.AUTHENTICATED,
      user,
      permissions: permissions ?? [],
      payload,
    }));
  });
}
