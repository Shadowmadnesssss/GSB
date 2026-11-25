// CORS sans dépendance, pour un front servi sur une autre origine que l'API.
//
// À monter AVANT setupBuses() : une requête de pré-vol (OPTIONS) n'a pas de token,
// l'Auth Bus la refuserait sinon.
//
//   const app = express();
//   app.use(createCors({ origins: ["http://localhost:5173"] }));
//   setupBuses(app, { ... });
const DEFAULT_ALLOW_HEADERS = ["authorization", "content-type", "x-request-id"];
const DEFAULT_EXPOSE_HEADERS = ["x-request-id", "retry-after", "www-authenticate"];
const DEFAULT_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

export function createCors({
  origins = [],                 // liste d'origines, "*" (déconseillé), ou (origin) => boolean
  credentials = false,          // true seulement si le front envoie des cookies
  allowHeaders = DEFAULT_ALLOW_HEADERS,
  exposeHeaders = DEFAULT_EXPOSE_HEADERS,
  methods = DEFAULT_METHODS,
  maxAgeSec = 600,
} = {}) {
  if (credentials && origins === "*") {
    throw new Error("createCors : credentials avec origins '*' est interdit par les navigateurs");
  }
  const isAllowed = typeof origins === "function"
    ? origins
    : (origin) => origins === "*" || (Array.isArray(origins) && origins.includes(origin));

  return function cors(req, res, next) {
    const origin = req.headers.origin;
    res.vary?.("Origin");
    if (!origin || !isAllowed(origin)) return next(); // pas d'en-têtes : le navigateur bloquera

    res.set("access-control-allow-origin", origins === "*" ? "*" : origin);
    if (credentials) res.set("access-control-allow-credentials", "true");
    res.set("access-control-expose-headers", exposeHeaders.join(", "));

    if (req.method === "OPTIONS" && req.headers["access-control-request-method"]) {
      res.set("access-control-allow-methods", methods.join(", "));
      res.set("access-control-allow-headers", allowHeaders.join(", "));
      res.set("access-control-max-age", String(maxAgeSec));
      return res.status(204).end();
    }
    next();
  };
}
