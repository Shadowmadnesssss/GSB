// Fausse BDD : on lit des fichiers JSON.
// Plus tard, on pourra remplacer ce fichier par une vraie BDD sans toucher au reste du bus :
// il suffit de garder les mêmes fonctions (createJsonUserStore est l'implémentation par défaut).
import { readFileSync } from "node:fs";

const users = JSON.parse(readFileSync(new URL("../../data/users.json", import.meta.url)));
const roles = JSON.parse(readFileSync(new URL("../../data/roles.json", import.meta.url)));

export function findUserById(id) {
  return users.find((u) => String(u.id) === String(id)) ?? null;
}

export function findUserByUsername(username) {
  if (typeof username !== "string") return null;
  const wanted = username.trim().toLowerCase();
  return users.find((u) => u.username.toLowerCase() === wanted) ?? null;
}

export function getPermissionsForRole(role) {
  return roles[role] ?? [];
}

// Ce qu'on peut renvoyer au client : jamais le hash du mot de passe.
export function toPublicUser(user) {
  if (!user) return null;
  const { passwordHash: _hash, ...rest } = user;
  return rest;
}

// Interface "magasin d'utilisateurs" attendue par l'API d'auth. Une vraie BDD fournira
// le même objet (fonctions sync ou async).
export function createJsonUserStore() {
  return { findById: findUserById, findByUsername: findUserByUsername, getPermissions: getPermissionsForRole };
}
