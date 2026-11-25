// Réduction d'une clé avant qu'elle ne sorte dans une alerte (console, mail, SMS).
// Propre au monitoring : il ne dépend d'aucun autre bus.
//   IPv4 : 192.168.1.42 -> 192.168.1.0      IPv6 : 3 premiers blocs, ::1 -> ::
//   "user:<id>" (identifiant interne) et toute autre clé : inchangées.

function ipv6Prefix(ip) {
  const [head, tail] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const hextets = ip.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  const prefix = hextets.slice(0, 3);
  return prefix.every((x) => x === "0" || x === "") ? "::" : `${prefix.join(":")}::`;
}

export function truncateIp(key) {
  if (typeof key !== "string") return key;
  const raw = key.replace(/^::ffff:/i, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(raw)) return raw.replace(/\.\d{1,3}$/, ".0");
  if (/^[0-9a-f:]+$/i.test(raw) && raw.includes(":")) return ipv6Prefix(raw);
  return key;
}
