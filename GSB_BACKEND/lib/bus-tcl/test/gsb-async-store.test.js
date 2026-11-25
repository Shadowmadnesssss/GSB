// [GSB] Magasin d'utilisateurs asynchrone (BDD) branché sur authenticate ET sur /auth/login.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { setupBuses, createBusApi, hashPassword } from "../src/index.js";

const SECRET = "gsb-async-store-secret";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

describe("Magasin d'utilisateurs asynchrone", () => {
  let server, base, store, failNext = false;
  const checked = [];

  before(async () => {
    const hash = await hashPassword("pw-ok");
    const rows = new Map([
      ["a1", { id: "a1", username: "a@x.fr", role: "admin", status: "active", passwordHash: hash }],
      ["b2", { id: "b2", username: "b@x.fr", role: "user", status: "banned", passwordHash: hash }],
      ["c3", { id: "c3", username: "c@x.fr", role: "user", status: "active", passwordHash: "legacy:pw-legacy" }],
    ]);
    store = {
      async findById(id) {
        await delay(5);
        if (failNext) { failNext = false; throw new Error("BDD en panne"); }
        return rows.get(String(id)) ?? null;
      },
      async findByUsername(u) { await delay(5); return [...rows.values()].find((r) => r.username === u) ?? null; },
      async getPermissions(role) { await delay(1); return role === "admin" ? ["*"] : ["bill:read"]; },
      rows,
    };
    const api = createBusApi({
      secret: SECRET,
      auth: {
        users: store,
        async verifyPassword(password, stored, user) {
          checked.push(user.id);
          if (stored.startsWith("legacy:")) return stored === `legacy:${password}`;
          const { verifyPassword } = await import("../src/index.js");
          return verifyPassword(password, stored);
        },
      },
    });
    const app = express();
    setupBuses(app, {
      auth: { secret: SECRET, publicRoutes: api.publicRoutes, users: store, logger: false },
      registerRoutes(app, ctx) {
        api.register(app, ctx);
        app.get("/admin-only", ctx.authorize("logs:read"), (req, res) => res.json({ id: req.auth.user.id }));
        app.get("/me2", (req, res) => res.json(req.auth));
      },
    });
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => server.close());

  const post = (p, body, token) => fetch(base + p, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) },
    body: JSON.stringify(body),
  });
  const get = (p, token) => fetch(base + p, { headers: token ? { authorization: `Bearer ${token}` } : {} });

  test("login + route protégée : l'utilisateur vient du magasin async", async () => {
    const res = await post("/auth/login", { username: "a@x.fr", password: "pw-ok" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.permissions, ["*"]);
    assert.equal(body.user.passwordHash, undefined);

    const me = await (await get("/me2", body.accessToken)).json();
    assert.equal(me.status, "AUTHENTICATED");
    assert.equal(me.user.id, "a1");
    assert.equal(me.user.passwordHash, undefined);
    assert.deepEqual(me.permissions, ["*"]);

    assert.equal((await get("/admin-only", body.accessToken)).status, 200);
    assert.equal((await get("/auth/me", body.accessToken)).status, 200);
  });

  test("verifyPassword injecté : ancien format accepté, reçoit l'utilisateur", async () => {
    checked.length = 0;
    const ok = await post("/auth/login", { username: "c@x.fr", password: "pw-legacy" });
    assert.equal(ok.status, 200);
    const bad = await post("/auth/login", { username: "c@x.fr", password: "nope" });
    assert.equal(bad.status, 401);
    assert.deepEqual(checked, ["c3", "c3"]);
  });

  test("permissions async : 403 pour un user sans la permission", async () => {
    const { accessToken } = await (await post("/auth/login", { username: "c@x.fr", password: "pw-legacy" })).json();
    assert.equal((await get("/admin-only", accessToken)).status, 403);
  });

  test("utilisateur supprimé entre-temps : 401 USER_NOT_FOUND", async () => {
    const { accessToken } = await (await post("/auth/login", { username: "a@x.fr", password: "pw-ok" })).json();
    const saved = store.rows.get("a1");
    store.rows.delete("a1");
    try {
      const res = await get("/me2", accessToken);
      assert.equal(res.status, 401);
      assert.equal((await res.json()).error, "USER_NOT_FOUND");
    } finally {
      store.rows.set("a1", saved);
    }
  });

  test("banni : refusé au login (403 USER_BANNED)", async () => {
    const res = await post("/auth/login", { username: "b@x.fr", password: "pw-ok" });
    assert.equal(res.status, 403);
  });

  test("magasin en panne : 500 INTERNAL_ERROR, pas de crash", async () => {
    const { accessToken } = await (await post("/auth/login", { username: "a@x.fr", password: "pw-ok" })).json();
    failNext = true;
    const res = await get("/me2", accessToken);
    assert.equal(res.status, 500);
    assert.equal((await res.json()).error, "INTERNAL_ERROR");
    assert.equal((await get("/me2", accessToken)).status, 200);
  });

  test("route publique : pas d'appel au magasin", async () => {
    assert.equal((await get("/health")).status, 200);
  });
});
