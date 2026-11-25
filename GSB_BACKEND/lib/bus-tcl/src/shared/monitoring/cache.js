// Cache du monitoring : compteurs en mémoire, en fenêtre fixe.
//
// Pourquoi un cache : à chaque requête on incrémente un compteur en mémoire
// au lieu d'écrire en BDD. Chaque compteur a une durée de vie (la fenêtre) :
// passé ce délai il repart de zéro, et il est purgé pour que la mémoire ne grossisse pas.
//
// Limite assumée : fenêtre fixe. Une rafale à cheval sur deux fenêtres peut passer
// sous le seuil. Une fenêtre glissante serait plus précise, mais plus coûteuse.
// Autre limite : tout est perdu au redémarrage et n'est pas partagé entre instances
// (Redis règlerait les deux, voir docs/monitoring.md).

export class CounterCache {
  #entries = new Map(); // clé -> { start, windowMs, count }

  // Ajoute 1 au compteur et renvoie sa valeur dans la fenêtre courante.
  increment(key, windowMs, now) {
    const entry = this.#entries.get(key);
    if (!entry || now - entry.start >= entry.windowMs) {
      this.#entries.set(key, { start: now, windowMs, count: 1 });
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }

  // Supprime les compteurs dont la fenêtre est terminée. Renvoie combien ont été retirés.
  purge(now) {
    let removed = 0;
    for (const [key, entry] of this.#entries) {
      if (now - entry.start >= entry.windowMs) {
        this.#entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  get size() {
    return this.#entries.size;
  }
}
