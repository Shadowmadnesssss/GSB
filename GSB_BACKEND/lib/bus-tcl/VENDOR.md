# bus-tcl (copie)

Source : https://github.com/B3-Nexa/bus-tcl, commit `70030fd` (v0.5.0).
Copié : `src/` sans la démo (`app.js`, `server.js`, `routes/`, `index.d.ts`).

## Modifications locales (`gsb.patch`)

Marquées `[GSB]` dans le code. Sans les nouvelles options, le comportement d'origine est inchangé
(les 162 tests de bus-tcl passent, plus `test/gsb-async-store.test.js`).

1. `shared/auth/verifyToken.js`, `shared/auth/authenticate.js` : option `users`
   (`{ findById, getPermissions }`, sync ou async). À l'origine, `authenticate` lisait toujours
   `src/data/users.json`, même quand `createBusApi` recevait un autre magasin : avec MongoDB,
   toute requête authentifiée aurait répondu 401 `USER_NOT_FOUND`.
2. `api/authApi.js` : option `verifyPassword(password, passwordHash, user)`, pour accepter les
   anciens hash sha256 de GSB et les migrer vers scrypt au login.
3. `data/users.json` et `data/roles.json` vidés : les comptes de démo (alice, bob…) ne doivent pas
   exister en production. GSB utilise MongoDB (`bus/userStore.js`).

## Mettre à jour

Recopier `src/` depuis bus-tcl, réappliquer `gsb.patch` (`git apply`), puis `npm test`.
