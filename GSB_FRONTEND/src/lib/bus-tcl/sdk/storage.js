// Où le SDK garde la session ({ accessToken, refreshToken, expiresAt }).
//
// Un stockage = { get(): session | null, set(session), clear(), syncKey? } (sync ou async).
//   memoryStorage()          : en mémoire (Node, tests, ou front qui ne veut rien persister)
//   browserStorage(options)  : localStorage / sessionStorage du navigateur
//
// syncKey : identifie un stockage PARTAGÉ entre plusieurs clients (onglets). Quand il est présent,
// le SDK synchronise la session entre eux (BroadcastChannel) et ne fait qu'un refresh à la fois.
//
// Sécurité : un token dans localStorage est lisible par tout script de la page (XSS).
// Préfère sessionStorage ou memoryStorage si l'application le permet.

export function memoryStorage(initial = null, { syncKey = null } = {}) {
  let session = initial;
  return {
    syncKey,
    get: () => session,
    set: (next) => { session = next; },
    clear: () => { session = null; },
  };
}

export function browserStorage({ key = "bus-tcl.session", storage = globalThis.localStorage } = {}) {
  if (!storage) throw new Error("browserStorage : aucun localStorage disponible (utilise memoryStorage)");
  return {
    // sessionStorage n'est pas partagé entre onglets : pas de synchronisation dans ce cas.
    syncKey: storage === globalThis.sessionStorage ? null : key,
    get() {
      try {
        const raw = storage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null; // valeur corrompue ou stockage bloqué : on repart sans session
      }
    },
    set(session) {
      try { storage.setItem(key, JSON.stringify(session)); } catch { /* quota, mode privé */ }
    },
    clear() {
      try { storage.removeItem(key); } catch { /* idem */ }
    },
  };
}
