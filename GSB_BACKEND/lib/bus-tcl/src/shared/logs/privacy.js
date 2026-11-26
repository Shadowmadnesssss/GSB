// Protection des données (RGPD) : masquage, troncature, pseudonymisation de l'IP, sanitisation.
import crypto from "node:crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ANY_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_SEGMENT_RE = /^\+?\d[\d .-]{7,}$/;
const CARD_CANDIDATE_RE = /\b\d(?:[ -]?\d){12,18}\b/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const BASIC_RE = /\bBasic\s+(?=[A-Za-z0-9+/=]{8,})(?:[A-Za-z0-9+/]*[A-Z0-9+/][A-Za-z0-9+/]*=*|[A-Za-z0-9+/]+=+)/g;
const API_KEY_RE = /\b(?:sk_(?:live|test)_[A-Za-z0-9]{16,}|sb_secret_[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g;
const CRLF_RE = /[\r\n\u2028\u2029]+/g;

export const VALID_IP_MODES = new Set(["none", "truncate", "hash", "full"]);

// Segments de clé qui déclenchent le masquage même dans un nom composé (ex: user_password, newPassword, pinCode)
const COMPOUND_SENSITIVE_SEGMENTS = new Set([
  "password", "passwd", "pwd", "mdp", "secret", "token", "apikey",
  "authorization", "cookie", "cvv", "cvc", "iban", "ssn", "nir", "otp", "jwt", "pin",
]);

// Suffixes de métadonnées non sensibles (ex: tokenCount, tokenExpiry, passwordLength)
const NON_SENSITIVE_SUFFIXES = new Set([
  "count", "length", "size", "total", "type", "ttl", "expiry", "expires", "expired", "at",
]);

export function isValidUuid(value) {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export function sanitizeString(value, maxLen) {
  if (value == null) return null;
  const cleaned = String(value).replace(CRLF_RE, " ").trim();
  if (!maxLen || cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen);
}

export function isSensitiveKey(key, sensitive) {
  const lower = String(key).toLowerCase();
  if (sensitive.has(lower)) return true;

  // Normalise camelCase / kebab-case / snake_case pour détecter ex: newPassword, clientSecret
  const normalized = String(key).replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  if (sensitive.has(normalized)) return true;

  const segments = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  if (segments.length > 1 && NON_SENSITIVE_SUFFIXES.has(segments[segments.length - 1])) {
    return false;
  }

  for (const seg of segments) {
    if (COMPOUND_SENSITIVE_SEGMENTS.has(seg)) return true;
  }

  // Paires composées courantes (ex: stripe_api_key, credit_card_number, rsa_private_key)
  return normalized.includes("api_key") || normalized.includes("card_number") || normalized.includes("private_key");
}

// --- Cartes bancaires : préfixe d'un réseau connu + somme de contrôle de Luhn ---
// Évite de masquer à tort les timestamps, numéros de téléphone ou de commande.
function luhnValid(digits) {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function hasCardNetworkPrefix(d) {
  const p2 = Number(d.slice(0, 2));
  const p4 = Number(d.slice(0, 4));
  return d[0] === "4"                                 // Visa
    || (p2 >= 51 && p2 <= 55) || (p4 >= 2221 && p4 <= 2720) // Mastercard
    || p2 === 34 || p2 === 37                         // American Express
    || p2 === 30 || p2 === 36 || p2 === 38 || p2 === 35 // Diners, JCB
    || p2 === 62 || p2 === 65 || p4 === 6011;         // UnionPay, Discover
}

export function isLikelyCardNumber(value) {
  const d = String(value).replace(/\D/g, "");
  return d.length >= 13 && d.length <= 19 && hasCardNetworkPrefix(d) && luhnValid(d);
}

export function redactString(value) {
  let out = value;
  // Prétests exacts (aucun faux négatif : chaque motif a une longueur/préfixe minimal garanti)
  if (out.includes("eyJ")) out = out.replace(JWT_RE, "***JWT***");
  if (out.length >= 8) {
    out = out
      .replace(BEARER_RE, "Bearer ***")
      .replace(BASIC_RE, "Basic ***")
      .replace(API_KEY_RE, "***SECRET***");
  }
  if (out.length >= 13 && /\d/.test(out)) {
    out = out.replace(CARD_CANDIDATE_RE, (m) => (isLikelyCardNumber(m) ? "***CARD***" : m));
  }
  return out.replace(CRLF_RE, " ");
}

export function redact(value, sensitive, depth = 0, seen = new WeakSet()) {
  if (value == null) return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object") return value;

  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return `[Binary ${value.byteLength}B]`;
  if (value instanceof Error) {
    return { name: sanitizeString(value.name, 64), message: redactString(String(value.message || "")) };
  }
  if (depth > 6) return "[MaxDepth]";
  if (seen.has(value)) return "[Circular]";

  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((v) => redact(v, sensitive, depth + 1, seen));
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = isSensitiveKey(k, sensitive) ? "***" : redact(v, sensitive, depth + 1, seen);
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

// Chemin d'une route inconnue (404, refus de l'Auth Bus avant routage) : on remplace
// les segments qui identifient une personne ou un objet pour ne stocker ni PII ni identifiant.
//   /users/jean.dupont@mail.fr/orders/42  ->  /users/:email/orders/:id
export function normalizePath(path) {
  if (!path) return path;
  return String(path)
    .split("/")
    .map((segment) => {
      if (!segment) return segment;
      let s;
      try {
        s = decodeURIComponent(segment);
      } catch {
        s = segment;
      }
      if (s.includes("@")) return ":email";
      if (ANY_UUID_RE.test(s)) return ":uuid";
      if (/^\d+$/.test(s) || PHONE_SEGMENT_RE.test(s)) return ":id";
      if (s.length >= 16 && /\d/.test(s) && /^[A-Za-z0-9._~+=-]+$/.test(s)) return ":token";
      return segment;
    })
    .join("/");
}

function safeJsonStringify(obj) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (_, val) => {
    if (typeof val === "bigint") return val.toString();
    if (val && typeof val === "object") {
      if (seen.has(val)) return "[Circular]";
      seen.add(val);
    }
    return val;
  });
}

export function truncate(obj, max) {
  if (obj == null) return null;
  try {
    const s = safeJsonStringify(obj);
    if (s == null) return null;
    return s.length > max ? { _truncated: true, original_length: s.length, preview: s.slice(0, max) } : obj;
  } catch {
    return { _truncated: true, preview: "[Unserializable]" };
  }
}

function expandIpv6(ip) {
  const clean = ip.split("%")[0]; // retire un éventuel zone index (%eth0)
  const parts = clean.split("::");
  if (parts.length > 2) return null;
  const left = parts[0] ? parts[0].split(":") : [];
  const right = parts[1] ? parts[1].split(":") : [];
  const missing = 8 - (left.length + right.length);
  if (parts.length === 1 && left.length !== 8) return null;
  if (parts.length === 2 && missing < 0) return null;
  const full = parts.length === 2 ? [...left, ...Array(missing).fill("0"), ...right] : left;
  if (full.length !== 8) return null;
  return full.map((h) => (parseInt(h || "0", 16) || 0).toString(16));
}

export function protectIp(ip, mode = "truncate", salt = "") {
  if (!VALID_IP_MODES.has(mode)) {
    throw new RangeError(`Log Bus : ipMode invalide ("${mode}"). Valeurs autorisées : none, truncate, hash, full.`);
  }
  if (!ip || mode === "none") return null;

  // Liste proxy ("client, proxy1") : on ne garde que la première IP
  const raw = String(ip).split(",")[0].trim().replace(/^::ffff:/i, "");
  if (!raw) return null;

  if (mode === "full") return sanitizeString(raw, 64);
  if (mode === "hash") return crypto.createHmac("sha256", String(salt)).update(raw).digest("hex").slice(0, 32);

  // truncate : IPv4 -> /24 (192.168.1.42 -> 192.168.1.0), IPv6 -> /48 (3 premiers blocs)
  if (raw.includes(".")) {
    const octets = raw.split(".");
    return octets.length === 4 ? `${octets[0]}.${octets[1]}.${octets[2]}.0` : sanitizeString(raw, 64);
  }
  if (raw.includes(":")) {
    const hextets = expandIpv6(raw);
    if (!hextets) return "::";
    const prefix = hextets.slice(0, 3);
    return prefix.every((h) => h === "0") ? "::" : `${prefix.join(":")}::`;
  }
  return sanitizeString(raw, 64);
}
