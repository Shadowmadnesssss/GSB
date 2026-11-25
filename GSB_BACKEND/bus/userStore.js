// Branche les utilisateurs MongoDB de GSB sur Bus TCL (Auth Bus + API /auth).
//
// Interface attendue par bus-tcl : { findById, findByUsername, getPermissions } (async ici).
// L'identifiant de connexion ("username" côté bus-tcl) est l'email GSB.
import { createHash, timingSafeEqual } from 'node:crypto'
import mongoose from 'mongoose'
import User from '../models/user_model.js'
import { hashPassword, verifyPassword } from '../lib/bus-tcl/src/index.js'

// Permissions par rôle. La logique métier GSB (admin / propriétaire) reste dans les contrôleurs ;
// ces permissions servent à l'API bus-tcl (logs, monitoring) et à l'affichage côté front.
const ROLE_PERMISSIONS = {
  admin: ['*'],
}
const DEFAULT_PERMISSIONS = ['bill:read', 'bill:create', 'profile:read', 'profile:update']

// Document Mongo -> utilisateur bus-tcl. Les champs GSB (_id, name, email) sont gardés :
// le front les lit tels quels. passwordHash n'est jamais renvoyé au client (toPublicUser).
function toBusUser(doc) {
  if (!doc) return null
  const id = String(doc._id)
  return {
    id,
    _id: id,
    username: doc.email,
    name: doc.name,
    email: doc.email,
    role: doc.role,
    status: doc.status === 'banned' ? 'banned' : 'active',
    passwordHash: doc.password,
  }
}

export function createMongoUserStore() {
  return {
    async findById(id) {
      if (!mongoose.isValidObjectId(id)) return null
      return toBusUser(await User.findById(id).lean())
    },
    async findByUsername(username) {
      if (typeof username !== 'string') return null
      return toBusUser(await User.findOne({ email: username.trim() }).lean())
    },
    getPermissions(role) {
      return ROLE_PERMISSIONS[role] ?? DEFAULT_PERMISSIONS
    },
  }
}

export const isScryptHash = (stored) => typeof stored === 'string' && stored.startsWith('scrypt$')

// Ancien format GSB : sha256(password + SALT) en hexadécimal. Comparaison à temps constant.
function verifyLegacySha256(password, stored) {
  const salt = process.env.SALT
  if (!salt || typeof stored !== 'string' || !/^[0-9a-f]{64}$/i.test(stored)) return false
  const actual = createHash('sha256').update(password + salt).digest()
  return timingSafeEqual(actual, Buffer.from(stored, 'hex'))
}

// Vérifie un mot de passe (scrypt, ou ancien sha256). Un ancien hash correct est
// remplacé par un hash scrypt : les comptes migrent tout seuls, sans réinitialisation.
export async function verifyUserPassword(password, stored, user) {
  if (typeof password !== 'string') return false
  if (isScryptHash(stored)) return verifyPassword(password, stored)
  if (!verifyLegacySha256(password, stored)) return false
  const id = user?._id ?? user?.id
  if (id) {
    try {
      // Filtre sur l'ancien hash : on n'écrase pas un mot de passe changé entre-temps.
      await User.updateOne({ _id: id, password: stored }, { $set: { password: await hashPassword(password) } })
    } catch (err) {
      console.error('Migration du mot de passe vers scrypt impossible :', err.message)
    }
  }
  return true
}

export { hashPassword }
