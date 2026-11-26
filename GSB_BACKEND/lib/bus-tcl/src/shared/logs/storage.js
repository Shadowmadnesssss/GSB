// Stockage des logs : adaptateur Supabase (clé service_role, côté serveur uniquement)
// et adaptateur mémoire pour le dev local et les tests.

export function createSupabaseStorage(supabase, table) {
  return {
    async insertMany(rows, { signal } = {}) {
      let query = supabase.from(table).insert(rows);
      if (signal) query = query.abortSignal(signal); // annule la requête HTTP si elle dépasse le délai
      const { error } = await query;
      if (error) throw error;
    },

    async purgeOlderThan(days) {
      const limit = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
      const { error, count } = await supabase.from(table).delete({ count: "exact" }).lt("created_at", limit);
      if (error) throw error;
      return count ?? 0;
    },

    // RGPD : droit d'accès (full: true renvoie l'ensemble des colonnes personnelles, art. 15)
    async findByUser(idUser, { limit = 1000, offset = 0, full = false } = {}) {
      const columns = full
        ? "created_at, request_id, id_user, method, route, status, duration_ms, level, reason, action, ip, user_agent, params, body, meta"
        : "created_at, request_id, method, route, status, level, reason, action";
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .eq("id_user", String(idUser))
        .order("created_at", { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      return data;
    },

    // RGPD : effacement en gardant des statistiques anonymes
    async anonymizeByUser(idUser) {
      const { error, count } = await supabase
        .from(table)
        .update(
          { id_user: null, ip: null, user_agent: null, params: null, body: null, meta: { anonymized: true } },
          { count: "exact" },
        )
        .eq("id_user", String(idUser));
      if (error) throw error;
      return count ?? 0;
    },

    // RGPD : suppression complète
    async deleteByUser(idUser) {
      const { error, count } = await supabase.from(table).delete({ count: "exact" }).eq("id_user", String(idUser));
      if (error) throw error;
      return count ?? 0;
    },

    // Corrélation : la requête HTTP et les actions métier qui partagent le même request_id
    async findByRequestId(requestId) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("request_id", requestId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  };
}

// maxRows : en dev, on ne garde que les N dernières lignes pour ne pas saturer la mémoire
export function createMemoryStorage({ maxRows = 10000 } = {}) {
  let rows = [];
  let seq = 1;
  const pick = ({ created_at, request_id, method, route, status, level, reason, action }) =>
    ({ created_at, request_id, method, route, status, level, reason, action });

  return {
    get rows() {
      return rows;
    },
    clear() {
      rows = [];
      seq = 1;
    },
    async insertMany(batch) {
      for (const row of batch) rows.push({ id: seq++, ...row });
      if (rows.length > maxRows) rows = rows.slice(rows.length - maxRows);
    },
    async purgeOlderThan(days) {
      const limit = Date.now() - days * 24 * 3600 * 1000;
      const before = rows.length;
      rows = rows.filter((r) => new Date(r.created_at).getTime() >= limit);
      return before - rows.length;
    },
    async findByUser(idUser, { limit = 1000, offset = 0, full = false } = {}) {
      const slice = rows
        .filter((r) => r.id_user === String(idUser))
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .slice(offset, offset + limit);
      return full ? slice.map(({ id: _id, ...rest }) => rest) : slice.map(pick);
    },
    async anonymizeByUser(idUser) {
      let count = 0;
      for (const r of rows) {
        if (r.id_user === String(idUser)) {
          Object.assign(r, { id_user: null, ip: null, user_agent: null, params: null, body: null, meta: { anonymized: true } });
          count++;
        }
      }
      return count;
    },
    async deleteByUser(idUser) {
      const before = rows.length;
      rows = rows.filter((r) => r.id_user !== String(idUser));
      return before - rows.length;
    },
    async findByRequestId(requestId) {
      return rows
        .filter((r) => r.request_id === requestId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
  };
}
