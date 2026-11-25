// Anti-bruteforce du login : après N échecs pour une même clé (IP + identifiant) dans une
// fenêtre, la clé est bloquée un moment. Compte aussi par IP seule, pour l'attaque qui essaie
// beaucoup d'identifiants différents depuis la même machine.
//
// En mémoire : suffisant pour une instance. Plusieurs instances -> même interface sur Redis.
export function createLoginLimiter({
  maxAttempts = 5,               // échecs autorisés par (IP, identifiant)
  maxAttemptsPerIp = 50,         // échecs autorisés par IP, tous identifiants confondus
  windowMs = 15 * 60 * 1000,
  lockMs = 15 * 60 * 1000,
  now = Date.now,
} = {}) {
  const entries = new Map(); // clé -> { count, windowStart, lockedUntil }

  function entry(key, t) {
    let e = entries.get(key);
    if (!e || (t - e.windowStart >= windowMs && e.lockedUntil <= t)) {
      e = { count: 0, windowStart: t, lockedUntil: 0 };
      entries.set(key, e);
    }
    return e;
  }

  function keys(ip, username) {
    const id = String(username ?? "").trim().toLowerCase();
    return { pair: `u:${ip ?? "?"}|${id}`, ip: `ip:${ip ?? "?"}` };
  }

  function sweep(t) {
    for (const [k, e] of entries) {
      if (e.lockedUntil <= t && t - e.windowStart >= windowMs) entries.delete(k);
    }
  }

  return {
    // { allowed: true } ou { allowed: false, retryAfterMs }
    check(ip, username) {
      const t = now();
      const k = keys(ip, username);
      const wait = Math.max(entries.get(k.pair)?.lockedUntil ?? 0, entries.get(k.ip)?.lockedUntil ?? 0) - t;
      return wait > 0 ? { allowed: false, retryAfterMs: wait } : { allowed: true };
    },

    fail(ip, username) {
      const t = now();
      const k = keys(ip, username);
      for (const [key, max] of [[k.pair, maxAttempts], [k.ip, maxAttemptsPerIp]]) {
        const e = entry(key, t);
        e.count += 1;
        if (e.count >= max) e.lockedUntil = t + lockMs;
      }
      if (entries.size > 10_000) sweep(t);
    },

    // Login réussi : on efface les échecs de ce couple (pas ceux de l'IP).
    succeed(ip, username) {
      entries.delete(keys(ip, username).pair);
    },

    get size() {
      return entries.size;
    },
  };
}
