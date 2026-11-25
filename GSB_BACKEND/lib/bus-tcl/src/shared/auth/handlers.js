// Étape 5b : une ACTION par statut.
// Chaque handler reçoit (req, res, next, result) et décide de la suite.
// On peut remplacer n'importe lequel via l'option "handlers" du bus (c'est le côté "paramétrable").

// Messages renvoyés au client : volontairement vagues (on ne dit pas à un attaquant
// si c'est la signature ou l'utilisateur qui pose problème). Le détail est dans les logs.
const messages = {
  NO_TOKEN: "Authentification requise",
  MALFORMED: "Header Authorization invalide",
  TOKEN_EXPIRED: "Token expiré, reconnecte-toi",
  TOKEN_INVALID: "Token invalide",
  USER_NOT_FOUND: "Token invalide",
  USER_BANNED: "Compte suspendu",
  FORBIDDEN: "Permission refusée",
  INTERNAL_ERROR: "Erreur interne d'authentification",
};

function reject(req, res, next, result) {
  const { code, http } = result.status;
  res.status(http).json({ error: code, message: messages[code] ?? "Accès refusé" });
}

function pass(req, res, next) {
  next();
}

export const defaultHandlers = {
  AUTHENTICATED: pass,
  PUBLIC_ROUTE: pass,
  AUTHORIZED: pass,

  NO_TOKEN: reject,
  MALFORMED: reject,
  TOKEN_INVALID: reject,
  USER_NOT_FOUND: reject,
  USER_BANNED: reject,
  FORBIDDEN: reject,
  INTERNAL_ERROR: reject,

  // Action spécifique : on indique au client qu'il doit rafraîchir son token.
  TOKEN_EXPIRED(req, res, next, result) {
    res.set("WWW-Authenticate", 'Bearer error="invalid_token", error_description="expired"');
    reject(req, res, next, result);
  },
};
