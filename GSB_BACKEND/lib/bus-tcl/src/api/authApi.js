// API d'authentification : connexion, renouvellement de session, déconnexion, profil.
//
//   POST /auth/login        { username, password }  -> jetons + profil
//   POST /auth/refresh      { refreshToken }        -> nouveaux jetons (rotation)
//   POST /auth/logout       { refreshToken }        -> 204, ferme cette session
//   POST /auth/logout-all                           -> ferme toutes les sessions (token requis)
//   GET  /auth/me                                   -> { user, permissions } (token requis)
//
// Chaque issue est publiée sur le bus partagé : "auth:session" et "auth:session:<CODE>".
import { AuthStatus } from "../shared/auth/statuses.js";
import { AUTH_SESSION_EVENTS, buildEvent } from "../shared/auth/events.js";
import { createJsonUserStore, toPublicUser } from "../shared/auth/db.js";
import { verifyAgainstDummy, verifyPassword } from "../shared/auth/passwords.js";
import { createLoginLimiter } from "../shared/auth/loginLimiter.js";
import { noStore, sendError } from "./http.js";

const MESSAGES = {
  BAD_REQUEST: "Requête invalide",
  LOGIN_FAILED: "Identifiant ou mot de passe incorrect",
  LOGIN_LOCKED: "Trop de tentatives, réessaie plus tard",
  USER_BANNED: "Compte suspendu",
  REFRESH_INVALID: "Session expirée, reconnecte-toi",
  REFRESH_REUSED: "Session révoquée, reconnecte-toi",
};

export function createAuthApi({
  tokens,                              // createTokenService(...)
  users = createJsonUserStore(),       // { findById, findByUsername, getPermissions }
  limiter = createLoginLimiter(),
  prefix = "/auth",
  // [GSB] Vérification du mot de passe injectable : (password, passwordHash, user) => boolean | Promise<boolean>.
  // Sert à accepter d'anciens formats de hash et à les migrer vers scrypt au login.
  verifyPassword: checkPassword = verifyPassword,
} = {}) {
  if (!tokens) throw new Error("createAuthApi : l'option 'tokens' (createTokenService) est obligatoire");

  const path = (p) => `${prefix}${p}`;

  function publish(ctx, req, status, startedAt, extra = {}) {
    if (!ctx.events) return;
    try {
      const event = buildEvent("session", req, { status, ...extra }, startedAt);
      ctx.events.publish(AUTH_SESSION_EVENTS.ALL, event);
      ctx.events.publish(AUTH_SESSION_EVENTS.of(status.code), event);
    } catch (err) {
      console.error("API auth : publication impossible", err);
    }
  }

  function fail(ctx, req, res, status, startedAt, { reason, user, retryAfterMs, message } = {}) {
    publish(ctx, req, status, startedAt, { reason, user });
    return sendError(res, status.http, status.code, message ?? MESSAGES[status.code], { retryAfterMs });
  }

  async function profileOf(user) {
    return { user: toPublicUser(user), permissions: (await users.getPermissions(user.role)) ?? [] };
  }

  // Attribue la ligne du Log Bus à l'utilisateur qui vient de s'identifier.
  function attachUser(req, profile) {
    req.auth = { ...(req.auth ?? {}), user: profile.user, permissions: profile.permissions };
  }

  function register(app, ctx) {
    app.post(path("/login"), async (req, res) => {
      const startedAt = process.hrtime.bigint();
      noStore(res);
      const { username, password } = req.body ?? {};
      if (typeof username !== "string" || !username.trim() || username.length > 128
        || typeof password !== "string" || !password) {
        return fail(ctx, req, res, AuthStatus.BAD_REQUEST, startedAt, {
          message: "Les champs 'username' et 'password' sont requis",
        });
      }

      const gate = limiter.check(req.ip, username);
      if (!gate.allowed) {
        return fail(ctx, req, res, AuthStatus.LOGIN_LOCKED, startedAt, {
          retryAfterMs: gate.retryAfterMs, reason: "trop d'échecs pour cette IP / cet identifiant",
        });
      }

      const user = await users.findByUsername(username);
      const ok = user ? await checkPassword(password, user.passwordHash, user) : await verifyAgainstDummy(password);
      if (!ok) {
        limiter.fail(req.ip, username);
        return fail(ctx, req, res, AuthStatus.LOGIN_FAILED, startedAt, {
          reason: user ? "mauvais mot de passe" : "identifiant inconnu",
          user: user ? toPublicUser(user) : null,
        });
      }
      limiter.succeed(req.ip, username);

      // Le banni n'apprend qu'il est banni qu'avec le bon mot de passe.
      if (user.status === "banned") {
        return fail(ctx, req, res, AuthStatus.USER_BANNED, startedAt, { user: toPublicUser(user) });
      }

      const profile = await profileOf(user);
      const session = await tokens.issue(user);
      attachUser(req, profile);
      publish(ctx, req, AuthStatus.LOGIN_SUCCESS, startedAt, { user: profile.user });
      res.json({ ...session, ...profile });
    });

    app.post(path("/refresh"), async (req, res) => {
      const startedAt = process.hrtime.bigint();
      noStore(res);
      const { refreshToken } = req.body ?? {};
      if (typeof refreshToken !== "string" || !refreshToken) {
        return fail(ctx, req, res, AuthStatus.BAD_REQUEST, startedAt, { message: "Le champ 'refreshToken' est requis" });
      }

      let rotated;
      try {
        rotated = await tokens.rotate(refreshToken, (id) => users.findById(id));
      } catch (err) {
        if (err?.name !== "TokenError") throw err;
        return fail(ctx, req, res, AuthStatus[err.code], startedAt, { reason: err.message });
      }

      if (rotated.user.status === "banned") {
        await tokens.revoke(rotated.tokens.refreshToken);
        return fail(ctx, req, res, AuthStatus.USER_BANNED, startedAt, { user: toPublicUser(rotated.user) });
      }

      const profile = await profileOf(rotated.user);
      attachUser(req, profile);
      publish(ctx, req, AuthStatus.TOKEN_REFRESHED, startedAt, { user: profile.user });
      res.json({ ...rotated.tokens, ...profile });
    });

    // Idempotent : un refresh token inconnu ou déjà révoqué répond aussi 204.
    app.post(path("/logout"), async (req, res) => {
      const startedAt = process.hrtime.bigint();
      const { refreshToken } = req.body ?? {};
      if (typeof refreshToken !== "string" || !refreshToken) {
        return fail(ctx, req, res, AuthStatus.BAD_REQUEST, startedAt, { message: "Le champ 'refreshToken' est requis" });
      }
      const { userId } = await tokens.revoke(refreshToken);
      const user = userId != null ? toPublicUser(await users.findById(userId)) : null;
      publish(ctx, req, AuthStatus.LOGGED_OUT, startedAt, { user });
      res.status(204).end();
    });

    // Route protégée : authenticate est déjà passé, req.auth.user est rempli.
    app.post(path("/logout-all"), async (req, res) => {
      const startedAt = process.hrtime.bigint();
      const revoked = await tokens.revokeAllForUser(req.auth.user.id);
      publish(ctx, req, AuthStatus.LOGGED_OUT, startedAt, { user: req.auth.user, reason: "toutes les sessions" });
      res.json({ revoked });
    });

    app.get(path("/me"), (req, res) => {
      noStore(res);
      res.json({ user: req.auth.user, permissions: req.auth.permissions });
    });
  }

  return {
    // À ajouter aux publicRoutes de l'Auth Bus : on s'y présente sans access token.
    publicRoutes: [path("/login"), path("/refresh"), path("/logout")],
    register,
  };
}
