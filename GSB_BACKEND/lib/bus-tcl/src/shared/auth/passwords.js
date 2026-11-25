// Hachage des mots de passe avec scrypt (module crypto de Node, aucune dépendance).
//
// Format stocké : "scrypt$<N>$<r>$<p>$<sel base64url>$<hash base64url>"
// Les paramètres sont dans la chaîne : on pourra les durcir plus tard sans casser les anciens hash.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

const DEFAULTS = { N: 16384, r: 8, p: 1, keyLength: 64, saltLength: 16 };
const MAX_PASSWORD_LENGTH = 1024; // évite qu'un mot de passe géant serve à saturer le CPU

function maxmemFor(N, r) {
  return 256 * N * r; // marge au-dessus des 128 * N * r requis par scrypt
}

export async function hashPassword(password, options = {}) {
  if (typeof password !== "string" || password.length === 0) {
    throw new TypeError("hashPassword : mot de passe vide");
  }
  if (password.length > MAX_PASSWORD_LENGTH) throw new RangeError("hashPassword : mot de passe trop long");
  const { N, r, p, keyLength, saltLength } = { ...DEFAULTS, ...options };
  const salt = randomBytes(saltLength);
  const hash = await scrypt(password.normalize("NFKC"), salt, keyLength, { N, r, p, maxmem: maxmemFor(N, r) });
  return ["scrypt", N, r, p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

// Renvoie true/false, ne lève jamais pour un hash mal formé (un compte corrompu = refus, pas un crash).
export async function verifyPassword(password, stored) {
  if (typeof password !== "string" || password.length > MAX_PASSWORD_LENGTH) return false;
  if (typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (![N, r, p].every(Number.isInteger)) return false;
  try {
    const expected = Buffer.from(hashB64, "base64url");
    const actual = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64url"), expected.length, {
      N, r, p, maxmem: maxmemFor(N, r),
    });
    return expected.length > 0 && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// Hash factice : on le vérifie quand l'utilisateur n'existe pas, pour que la réponse prenne
// le même temps qu'un mauvais mot de passe (sinon on devine les comptes existants au chrono).
let dummyHash = null;
export async function verifyAgainstDummy(password) {
  dummyHash ??= await hashPassword("mot-de-passe-factice-pour-egaliser-le-temps");
  await verifyPassword(String(password ?? ""), dummyHash);
  return false;
}
