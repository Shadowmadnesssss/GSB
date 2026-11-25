// Jetons de session :
//  - access token  : JWT court (15 min par défaut), vérifié par le middleware authenticate ;
//  - refresh token : chaîne aléatoire opaque (7 jours), stockée HACHÉE côté serveur.
//
// Rotation : chaque refresh consomme l'ancien refresh token et en donne un nouveau.
// Réutilisation d'un refresh token déjà consommé = vol probable : toute la "famille"
// (la session issue du même login) est révoquée.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

export class TokenError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TokenError";
    this.code = code; // "REFRESH_INVALID" | "REFRESH_REUSED"
  }
}

const sha256 = (value) => createHash("sha256").update(value).digest("base64url");

// Stockage des refresh tokens en mémoire (dev, une seule instance).
// Pour plusieurs instances : même interface sur Redis ou une table SQL.
export function createMemoryRefreshStore() {
  const byHash = new Map(); // hash -> { userId, familyId, expiresAt, consumedAt }

  function sweep(now) {
    for (const [hash, rec] of byHash) if (rec.expiresAt <= now) byHash.delete(hash);
  }

  return {
    async save(hash, record) {
      byHash.set(hash, { ...record, consumedAt: null });
      if (byHash.size % 500 === 0) sweep(Date.now());
    },
    async get(hash) {
      return byHash.get(hash) ?? null;
    },
    async markConsumed(hash, at) {
      const rec = byHash.get(hash);
      if (!rec || rec.consumedAt) return false; // déjà consommé (deux refresh en même temps)
      rec.consumedAt = at;
      return true;
    },
    async revokeFamily(familyId) {
      let n = 0;
      for (const [hash, rec] of byHash) if (rec.familyId === familyId) { byHash.delete(hash); n++; }
      return n;
    },
    async revokeUser(userId) {
      let n = 0;
      for (const [hash, rec] of byHash) if (String(rec.userId) === String(userId)) { byHash.delete(hash); n++; }
      return n;
    },
    async delete(hash) {
      return byHash.delete(hash);
    },
    get size() {
      return byHash.size;
    },
  };
}

export function createTokenService({
  secret,
  algorithm = "HS256",
  accessTokenTtlSec = 15 * 60,
  refreshTokenTtlMs = 7 * 24 * 3600 * 1000,
  issuer = undefined,
  store = createMemoryRefreshStore(),
  now = Date.now,
} = {}) {
  if (!secret) throw new Error("createTokenService : l'option 'secret' est obligatoire");
  if (!(accessTokenTtlSec > 0) || !(refreshTokenTtlMs > 0)) throw new RangeError("createTokenService : durées invalides");

  function signAccess(user) {
    return jwt.sign({ sub: String(user.id), role: user.role }, secret, {
      algorithm,
      expiresIn: accessTokenTtlSec,
      jwtid: randomUUID(),
      ...(issuer && { issuer }),
    });
  }

  async function newRefresh(userId, familyId) {
    const refreshToken = randomBytes(32).toString("base64url");
    await store.save(sha256(refreshToken), { userId, familyId, expiresAt: now() + refreshTokenTtlMs });
    return refreshToken;
  }

  async function pair(user, familyId) {
    return {
      tokenType: "Bearer",
      accessToken: signAccess(user),
      expiresIn: accessTokenTtlSec,
      refreshToken: await newRefresh(user.id, familyId),
      refreshExpiresIn: Math.floor(refreshTokenTtlMs / 1000),
    };
  }

  return {
    store,

    // Nouvelle session (après un login réussi).
    issue(user) {
      return pair(user, randomUUID());
    },

    // Vérifie et consomme un refresh token. Renvoie { userId, familyId } ou lève TokenError.
    // loadUser(userId) permet de refuser un compte supprimé ou banni entre-temps.
    async rotate(refreshToken, loadUser) {
      if (typeof refreshToken !== "string" || refreshToken.length < 20 || refreshToken.length > 200) {
        throw new TokenError("REFRESH_INVALID", "Refresh token invalide");
      }
      const hash = sha256(refreshToken);
      const rec = await store.get(hash);
      if (!rec || rec.expiresAt <= now()) throw new TokenError("REFRESH_INVALID", "Refresh token invalide ou expiré");

      if (rec.consumedAt || !(await store.markConsumed(hash, now()))) {
        await store.revokeFamily(rec.familyId);
        throw new TokenError("REFRESH_REUSED", "Refresh token déjà utilisé : session révoquée");
      }

      const user = await loadUser(rec.userId);
      if (!user) {
        await store.revokeFamily(rec.familyId);
        throw new TokenError("REFRESH_INVALID", "Utilisateur introuvable");
      }
      return { user, tokens: await pair(user, rec.familyId), familyId: rec.familyId };
    },

    // Déconnexion d'une session. Idempotent : un token inconnu ne lève pas d'erreur.
    async revoke(refreshToken) {
      if (typeof refreshToken !== "string") return { revoked: 0, userId: null };
      const rec = await store.get(sha256(refreshToken));
      if (!rec) return { revoked: 0, userId: null };
      return { revoked: await store.revokeFamily(rec.familyId), userId: rec.userId };
    },

    // Déconnexion de toutes les sessions d'un utilisateur.
    revokeAllForUser(userId) {
      return store.revokeUser(userId);
    },
  };
}
