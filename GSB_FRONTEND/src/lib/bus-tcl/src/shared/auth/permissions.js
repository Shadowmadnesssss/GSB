// Étape 6 : autorisation par rôles (RBAC).
// Une permission s'écrit "ressource:action", ex. "article:delete".
// Jokers acceptés côté rôle : "*" (tout) et "article:*" (toutes les actions sur article).

function grants(owned, required) {
  if (owned === "*" || owned === required) return true;
  if (owned.endsWith(":*")) return required.startsWith(owned.slice(0, -1));
  return false;
}

// L'utilisateur doit avoir TOUTES les permissions demandées.
// Renvoie la liste de celles qui manquent (vide = autorisé).
export function missingPermissions(ownedList, requiredList) {
  return requiredList.filter((req) => !ownedList.some((owned) => grants(owned, req)));
}
