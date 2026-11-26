// Filtrage et anti-spam des alertes émises par le Log Bus.
// Limite à 1 alerte par (reason, méthode, route) et par fenêtre (throttleMs),
// en indiquant le nombre d'alertes identiques étouffées pendant la fenêtre précédente.

export function createAlertThrottler({ reasons = [], throttleMs = 60000, onEmit, onSuppress } = {}) {
  const alertReasons = new Set(reasons);
  const windows = new Map();

  return function maybeAlert(entry) {
    if (entry.level !== "error" && !alertReasons.has(entry.reason)) return false;

    if (!throttleMs) {
      onEmit(entry, { suppressed: 0 });
      return true;
    }

    const now = Date.now();
    const key = `${entry.reason}|${entry.method}|${entry.route}`;
    const prev = windows.get(key);

    if (prev && now - prev.since < throttleMs) {
      prev.suppressed++;
      onSuppress?.();
      return false;
    }

    windows.set(key, { since: now, suppressed: 0 });
    if (windows.size > 100) {
      for (const [k, v] of windows) {
        if (now - v.since >= throttleMs) windows.delete(k);
      }
    }

    onEmit(entry, { suppressed: prev ? prev.suppressed : 0 });
    return true;
  };
}
