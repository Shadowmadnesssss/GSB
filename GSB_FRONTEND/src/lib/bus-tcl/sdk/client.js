// Client HTTP du Bus TCL : un seul client pour tous les bus (Auth, Log, Monitoring) et tes routes.
// Documentation : docs/sdk.md.
import { missingPermissions } from "../src/shared/auth/permissions.js";
import { BusError, errorFromResponse } from "./errors.js";
import { memoryStorage } from "./storage.js";

const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const DEFAULT_ROUTES = Object.freeze({
  login: "/auth/login",
  refresh: "/auth/refresh",
  logout: "/auth/logout",
  logoutAll: "/auth/logout-all",
  me: "/auth/me",
  myLogs: "/auth/me/logs",
  health: "/health",
  logs: "/admin/logs",
  monitoring: "/admin/monitoring",
});

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Contenu du JWT (sans vérifier la signature : c'est le rôle du serveur).
function jwtPayload(token) {
  try {
    const part = token.split(".")[1];
    return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}
function jwtExpiresAt(token) {
  const exp = jwtPayload(token)?.exp;
  return Number.isFinite(exp) ? exp * 1000 : null;
}
const subOf = (token) => (token ? jwtPayload(token)?.sub ?? null : null);

// --- Verrou entre onglets -------------------------------------------------------------------
// Web Locks API (navigateur) : un seul onglet à la fois dans la section critique.
// Sinon (Node, vieux navigateurs) : verrou local, valable pour les clients d'un même processus.
const localLocks = new Map();
async function withLocalLock(name, fn) {
  const previous = localLocks.get(name) ?? Promise.resolve();
  let release;
  const mine = new Promise((resolve) => { release = resolve; });
  const tail = previous.then(() => mine);
  localLocks.set(name, tail);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (localLocks.get(name) === tail) localLocks.delete(name);
  }
}
function withLock(name, fn) {
  const locks = globalThis.navigator?.locks;
  return typeof locks?.request === "function" ? locks.request(name, () => fn()) : withLocalLock(name, fn);
}

function isPlainBody(body) {
  return body !== null && typeof body === "object"
    && !(body instanceof ArrayBuffer) && !ArrayBuffer.isView(body)
    && !(typeof FormData !== "undefined" && body instanceof FormData)
    && !(typeof Blob !== "undefined" && body instanceof Blob)
    && !(typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams)
    && !(typeof ReadableStream !== "undefined" && body instanceof ReadableStream);
}

async function readBody(res) {
  if (res.status === 204 || res.status === 205) return null;
  const text = await res.text();
  if (!text) return null;
  if ((res.headers.get("content-type") || "").includes("json")) {
    try { return JSON.parse(text); } catch { return text; }
  }
  return text;
}

const seg = (value) => encodeURIComponent(String(value));

// Parcourt une API paginée (limit / offset) page par page, élément par élément.
export async function* paginate(fetchPage, { pageSize = 100, max = Infinity, offset = 0 } = {}) {
  if (!(pageSize >= 1)) throw new RangeError("paginate : pageSize doit être >= 1");
  let yielded = 0;
  for (let current = offset; yielded < max; current += pageSize) {
    const page = await fetchPage({ limit: pageSize, offset: current });
    const items = Array.isArray(page) ? page : page?.items ?? [];
    for (const item of items) {
      if (yielded >= max) return;
      yield item;
      yielded++;
    }
    if (items.length < pageSize) return;
  }
}

export function createBusClient(options = {}) {
  const {
    baseUrl = "",                   // "" = même origine
    storage = memoryStorage(),      // où garder la session (voir storage.js)
    token: initialToken = null,     // access token de départ (si pas de session en stockage)
    refreshToken: customRefresh = null, // async () => token | { accessToken, refreshToken } | null
    autoRefresh = true,             // rafraîchit avant expiration (et sur TOKEN_EXPIRED)
    refreshSkewMs = 30_000,         // marge avant l'expiration de l'access token
    sync = true,                    // synchronise la session entre onglets (si le stockage est partagé)
    syncKey = storage.syncKey ?? null,
    onSessionChange = null,         // (session | null, { source: "local" | "remote" }) => void
    onTokenChange = null,           // (accessToken | null) => void
    onAuthError = null,             // (BusError) => void : session perdue, rediriger vers le login
    onResponse = null,              // ({ method, path, status, ok, requestId, durationMs, attempt }) => void
    interceptors = [],              // [{ beforeRequest, afterResponse, onError }]
    timeoutMs = 10_000,
    retries = 1,                    // réessais auto des GET/HEAD/OPTIONS (réseau, timeout, 429, 502-504)
    maxRetryDelayMs = 5_000,
    headers: defaultHeaders = {},
    routes: customRoutes = {},
    fetch: fetchImpl = globalThis.fetch?.bind(globalThis),
  } = options;

  if (typeof fetchImpl !== "function") {
    throw new Error("createBusClient : aucun fetch disponible, passe l'option 'fetch'");
  }
  const routes = { ...DEFAULT_ROUTES, ...customRoutes };
  const root = String(baseUrl).replace(/\/+$/, "");
  const instanceId = uuid();
  const hooks = [...interceptors];

  let session = null;               // { accessToken, refreshToken, expiresAt }
  let profile = null;               // { user, permissions }
  let refreshing = null;            // promesse partagée : un seul refresh à la fois
  let lastRequestId = null;

  const safe = (fn, ...args) => {
    try {
      const out = fn?.(...args);
      if (out && typeof out.catch === "function") out.catch(() => {});
    } catch { /* un hook du front ne casse pas l'appel */ }
  };

  // --- État réactif (React useSyncExternalStore, Vue, Svelte...) ---
  const listeners = new Set();
  const computeState = () => Object.freeze({
    status: session ? "authenticated" : "anonymous",
    user: profile?.user ?? null,
    permissions: profile?.permissions ?? [],
    session: session ? Object.freeze({ ...session }) : null,
  });
  let state = computeState();
  function notify() {
    state = computeState();
    for (const listener of [...listeners]) safe(listener, state);
  }

  // --- Synchronisation entre onglets ---
  // Le stockage est partagé (localStorage) ; BroadcastChannel prévient les autres onglets
  // d'un login / refresh / logout, et le verrou empêche deux refresh simultanés.
  const lockName = `bus-tcl:refresh:${syncKey ?? instanceId}`;
  let channel = null;
  if (sync && syncKey && typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(`bus-tcl:${syncKey}`);
    channel.unref?.(); // Node : ne garde pas le processus en vie
    channel.onmessage = (event) => {
      const msg = event.data;
      if (msg?.type === "session" && msg.from !== instanceId) adoptSession(msg.session ?? null);
    };
  }

  function emitSessionChange(previousToken, source) {
    safe(onSessionChange, session, { source });
    const current = session?.accessToken ?? null;
    if (current !== previousToken) safe(onTokenChange, current);
    notify();
  }

  // Session venue d'un autre onglet : déjà en stockage, on ne fait que la reprendre.
  function adoptSession(next) {
    const previousToken = session?.accessToken ?? null;
    const previousSub = subOf(previousToken);
    session = next?.accessToken ? next : null;
    if (!session || subOf(session.accessToken) !== previousSub) profile = null;
    emitSessionChange(previousToken, "remote");
  }

  // La session peut venir d'un stockage asynchrone : on la charge une fois, au premier appel.
  const ready = Promise.resolve()
    .then(() => storage.get())
    .then((stored) => {
      if (session) return; // une session a déjà été posée entre-temps (login, setToken)
      if (stored?.accessToken) session = stored;
      else if (initialToken) session = { accessToken: initialToken, refreshToken: null, expiresAt: jwtExpiresAt(initialToken) };
      if (session) notify();
    })
    .catch(() => {});

  async function setSession(next) {
    const previousToken = session?.accessToken ?? null;
    session = next?.accessToken ? next : null;
    if (!session) profile = null;
    try {
      if (session) await storage.set(session);
      else await storage.clear();
    } catch { /* stockage en panne : la session reste en mémoire */ }
    try { channel?.postMessage({ type: "session", from: instanceId, session }); } catch { /* canal fermé */ }
    emitSessionChange(previousToken, "local");
  }

  function applyTokens(data) {
    const accessToken = data.accessToken;
    const expiresAt = Number.isFinite(data.expiresIn) ? Date.now() + data.expiresIn * 1000 : jwtExpiresAt(accessToken);
    if (data.user) profile = { user: data.user, permissions: data.permissions ?? [] };
    return setSession({ accessToken, refreshToken: data.refreshToken ?? session?.refreshToken ?? null, expiresAt });
  }

  const canRefresh = () => Boolean(customRefresh || session?.refreshToken);
  const sessionMark = (s) => s?.refreshToken ?? s?.accessToken ?? null;

  async function refreshNow() {
    if (customRefresh) {
      const next = await customRefresh();
      if (!next) { await setSession(null); return false; }
      await applyTokens(typeof next === "string" ? { accessToken: next } : next);
      return true;
    }
    const refreshToken = session?.refreshToken;
    if (!refreshToken) return false;
    const data = await request("POST", routes.refresh, { body: { refreshToken }, auth: false, retries: 0 });
    await applyTokens(data);
    return true;
  }

  // true = nouvelle session ; false = session finie (effacée). Une panne réseau est relancée.
  function runRefresh() {
    if (!refreshing) {
      const before = sessionMark(session);
      refreshing = (async () => {
        try {
          return await withLock(lockName, async () => {
            // Un autre onglet a peut-être déjà rafraîchi (ou fermé) la session pendant qu'on attendait.
            if (syncKey) {
              const stored = await storage.get();
              if (stored?.accessToken && sessionMark(stored) !== before) { adoptSession(stored); return true; }
              if (!stored?.accessToken && before) { adoptSession(null); return false; }
            }
            return refreshNow();
          });
        } catch (err) {
          if (err instanceof BusError && ["network", "timeout", "server", "unavailable"].includes(err.kind)) throw err;
          await setSession(null);
          return false;
        } finally {
          refreshing = null;
        }
      })();
    }
    return refreshing;
  }

  function buildUrl(path, query) {
    const url = /^https?:\/\//i.test(path) ? path : `${root}${path.startsWith("/") ? "" : "/"}${path}`;
    if (!query) return url;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      for (const v of Array.isArray(value) ? value : [value]) params.append(key, String(v));
    }
    const qs = params.toString();
    return qs ? `${url}${url.includes("?") ? "&" : "?"}${qs}` : url;
  }

  async function attemptOnce(method, path, opts, attempt) {
    const requestId = uuid();
    lastRequestId = requestId;
    const headers = { accept: "application/json", ...defaultHeaders, ...opts.headers, "x-request-id": requestId };

    let body = opts.body;
    if (body !== undefined && isPlainBody(body)) {
      body = JSON.stringify(body);
      if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) headers["content-type"] = "application/json";
    }
    const usedToken = opts.auth !== false ? session?.accessToken ?? null : null;
    if (usedToken) headers.authorization = `Bearer ${usedToken}`;

    // Intercepteurs : peuvent modifier url, headers et body. Une erreur ici annule la requête.
    const outgoing = { method, path, url: buildUrl(path, opts.query), headers, body, attempt, requestId };
    for (const hook of hooks) if (hook.beforeRequest) await hook.beforeRequest(outgoing);

    const controller = new AbortController();
    let timedOut = false;
    const timer = timeoutMs > 0 ? setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs) : null;
    const onUserAbort = () => controller.abort();
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener("abort", onUserAbort, { once: true });
    }

    const startedAt = Date.now();
    let res;
    try {
      res = await fetchImpl(outgoing.url, { method, headers: outgoing.headers, body: outgoing.body, signal: controller.signal });
      const data = await readBody(res);
      return { res, data, requestId, usedToken };
    } catch (cause) {
      const kind = timedOut ? "timeout" : (opts.signal?.aborted ? "aborted" : "network");
      const message = kind === "timeout" ? `Pas de réponse après ${timeoutMs} ms`
        : kind === "aborted" ? "Requête annulée" : "Serveur injoignable";
      throw new BusError({ kind, message, requestId, cause });
    } finally {
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener?.("abort", onUserAbort);
      const info = {
        method, path, attempt, requestId,
        status: res?.status ?? null,
        ok: Boolean(res?.ok),
        durationMs: Date.now() - startedAt,
      };
      safe(onResponse, info);
      for (const hook of hooks) if (hook.afterResponse) safe(hook.afterResponse, { ...info, headers: res?.headers ?? null });
    }
  }

  async function request(method, path, opts = {}) {
    await ready;
    method = method.toUpperCase();
    const withAuth = opts.auth !== false;
    const maxAttempts = 1 + (IDEMPOTENT_METHODS.has(method) ? Math.max(0, opts.retries ?? retries) : 0);
    let refreshed = false;

    // Rafraîchissement préventif : l'access token expire dans moins de refreshSkewMs.
    if (withAuth && autoRefresh && session?.expiresAt && Date.now() >= session.expiresAt - refreshSkewMs && canRefresh()) {
      refreshed = true;
      await runRefresh();
    }

    for (let attempt = 1; ; attempt++) {
      let error;
      let usedToken = null;
      try {
        const sent = await attemptOnce(method, path, opts, attempt);
        usedToken = sent.usedToken;
        if (sent.res.ok) {
          const { res, data, requestId } = sent;
          return opts.raw ? { data, status: res.status, headers: res.headers, requestId } : data;
        }
        error = errorFromResponse(sent.res, sent.data, sent.requestId);
      } catch (err) {
        if (!(err instanceof BusError) || err.kind === "aborted") {
          if (err instanceof BusError) for (const hook of hooks) if (hook.onError) safe(hook.onError, err);
          throw err;
        }
        error = err;
      }

      // Token expiré : un refresh puis on rejoue la requête une fois (quelle que soit la méthode).
      if (error.code === "TOKEN_EXPIRED" && withAuth && autoRefresh && !refreshed && canRefresh()) {
        refreshed = true;
        let ok;
        if (refreshing) ok = await refreshing;                                          // déjà en cours
        else if (session?.accessToken && session.accessToken !== usedToken) ok = true;  // déjà fait
        else ok = await runRefresh();
        if (ok) { attempt--; continue; }
      }

      if (attempt < maxAttempts && error.isRetryable) {
        const backoff = 300 * 2 ** (attempt - 1);
        await sleep(Math.min(error.retryAfterMs ?? backoff, maxRetryDelayMs));
        continue;
      }

      // Session perdue : seulement pour un appel authentifié (un mauvais mot de passe n'en est pas une).
      if (error.kind === "auth" && withAuth) {
        if (session) await setSession(null);
        safe(onAuthError, error);
      }
      for (const hook of hooks) if (hook.onError) safe(hook.onError, error);
      throw error;
    }
  }

  // Plusieurs me() en même temps (plusieurs composants, plusieurs abonnés) = une seule requête.
  let loadingProfile = null;
  function loadProfile() {
    loadingProfile ??= (async () => {
      try {
        const data = await request("GET", routes.me);
        profile = { user: data.user, permissions: data.permissions ?? [] };
        notify();
        return profile;
      } finally {
        loadingProfile = null;
      }
    })();
    return loadingProfile;
  }

  const client = {
    request,
    get: (path, opts) => request("GET", path, opts),
    delete: (path, opts) => request("DELETE", path, opts),
    post: (path, body, opts) => request("POST", path, { ...opts, body }),
    put: (path, body, opts) => request("PUT", path, { ...opts, body }),
    patch: (path, body, opts) => request("PATCH", path, { ...opts, body }),

    // Parcourt n'importe quelle route paginée (limit / offset) : for await (const x of api.paginate(...)).
    paginate,

    // Ajoute un intercepteur ; renvoie la fonction qui le retire.
    use(hook) {
      hooks.push(hook);
      return () => {
        const i = hooks.indexOf(hook);
        if (i >= 0) hooks.splice(i, 1);
      };
    },

    // État réactif : { status, user, permissions, session }, même objet tant que rien ne change.
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    // Attend que la session stockée soit chargée (utile avec un stockage asynchrone).
    ready: () => ready,
    get session() { return session ? { ...session } : null; },
    get token() { return session?.accessToken ?? null; },
    get lastRequestId() { return lastRequestId; },
    setToken: (accessToken) => {
      profile = null; // un autre token peut être un autre utilisateur
      return setSession(accessToken
        ? { accessToken, refreshToken: session?.refreshToken ?? null, expiresAt: jwtExpiresAt(accessToken) }
        : null);
    },
    clearToken: () => setSession(null),

    // Ferme le canal entre onglets et retire les abonnés (tests, démontage d'une appli).
    destroy() {
      channel?.close();
      channel = null;
      listeners.clear();
    },

    // --- Auth ---
    auth: {
      get isAuthenticated() { return Boolean(session?.accessToken); },
      get user() { return profile?.user ?? null; },
      get permissions() { return profile?.permissions ?? []; },

      async login(username, password, opts = {}) {
        await ready;
        const data = await request("POST", routes.login, { ...opts, body: { username, password }, auth: false, retries: 0 });
        await applyTokens(data);
        return { user: data.user, permissions: data.permissions ?? [] };
      },

      // Ferme la session côté serveur puis l'oublie localement (et dans les autres onglets).
      async logout({ everywhere = false } = {}) {
        await ready;
        try {
          if (everywhere && session) await request("POST", routes.logoutAll, { retries: 0 });
          else if (session?.refreshToken) {
            await request("POST", routes.logout, { body: { refreshToken: session.refreshToken }, auth: false, retries: 0 });
          }
        } catch { /* on déconnecte localement quoi qu'il arrive */ }
        await setSession(null);
      },

      async refresh() {
        await ready;
        return canRefresh() ? runRefresh() : false;
      },

      me: ({ refresh = false } = {}) => (profile && !refresh ? Promise.resolve(profile) : loadProfile()),

      // Même règle que le serveur ("*", "ressource:*") : sert à l'affichage, pas à la sécurité.
      async can(...required) {
        const { permissions } = await client.auth.me();
        return missingPermissions(permissions, required).length === 0;
      },

      // Version synchrone, sur le profil déjà chargé (false s'il ne l'est pas).
      canSync(...required) {
        return Boolean(profile) && missingPermissions(profile.permissions, required).length === 0;
      },

      // Droit d'accès RGPD (art. 15) : les logs de l'utilisateur connecté.
      myLogs: ({ limit, offset, ...opts } = {}) => request("GET", routes.myLogs, { ...opts, query: { limit, offset } }),
      iterateMyLogs: ({ pageSize = 100, max, ...opts } = {}) =>
        paginate((page) => client.auth.myLogs({ ...opts, ...page }), { pageSize: Math.min(pageSize, 1000), max }),
    },

    // --- Log Bus (administration, permissions logs:read / logs:admin) ---
    logs: {
      getStats: (opts) => request("GET", `${routes.logs}/stats`, opts),
      getRequest: (requestId, opts) => request("GET", `${routes.logs}/requests/${seg(requestId)}`, opts),
      exportUser: (userId, { limit, offset, full, ...opts } = {}) =>
        request("GET", `${routes.logs}/users/${seg(userId)}`, { ...opts, query: { limit, offset, full } }),
      iterateUser: (userId, { pageSize = 100, max, full, ...opts } = {}) =>
        paginate((page) => client.logs.exportUser(userId, { ...opts, ...page, full }), { pageSize: Math.min(pageSize, 1000), max }),
      anonymizeUser: (userId, opts) => request("POST", `${routes.logs}/users/${seg(userId)}/anonymize`, opts),
      deleteUser: (userId, opts) => request("DELETE", `${routes.logs}/users/${seg(userId)}`, opts),
      purge: ({ olderThanDays, ...opts } = {}) =>
        request("POST", `${routes.logs}/purge`, { ...opts, body: olderThanDays === undefined ? {} : { olderThanDays } }),
    },

    // --- Monitoring (permission monitoring:read) ---
    monitoring: {
      getStats: (opts) => request("GET", `${routes.monitoring}/stats`, opts),
      getAlerts: ({ limit, severity, ...opts } = {}) =>
        request("GET", `${routes.monitoring}/alerts`, { ...opts, query: { limit, severity } }),
      // Interroge les alertes à intervalle régulier ; appelle onAlert pour chaque nouvelle. Renvoie stop().
      watchAlerts(onAlert, { intervalMs = 15_000, severity, onError } = {}) {
        let lastAt = Date.now();
        let stopped = false;
        let timer = null;
        const tick = async () => {
          try {
            const { items } = await client.monitoring.getAlerts({ limit: 100, severity });
            const fresh = items.filter((a) => a.at > lastAt).sort((a, b) => a.at - b.at);
            for (const alert of fresh) safe(onAlert, alert);
            if (fresh.length) lastAt = fresh.at(-1).at;
          } catch (err) {
            safe(onError, err);
          }
          if (!stopped) timer = setTimeout(tick, intervalMs);
        };
        timer = setTimeout(tick, 0);
        return () => { stopped = true; clearTimeout(timer); };
      },
    },

    // { ok, stats, monitoring? } : santé de l'API, sans token.
    health: (opts) => request("GET", routes.health, { ...opts, auth: false }),
  };

  return client;
}
