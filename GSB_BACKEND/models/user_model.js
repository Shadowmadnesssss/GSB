import mongoose from 'mongoose'
import { hashPassword } from '../lib/bus-tcl/src/index.js'

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        required: true,
    },
    createdAt: {
        type: String,
        default: Date.now(),
    },
})

// Le hash du mot de passe ne sort jamais dans les réponses de l'API
const hidePassword = { transform: (_doc, ret) => { delete ret.password; return ret } }
userSchema.set('toJSON', hidePassword)
userSchema.set('toObject', hidePassword)

userSchema.pre('save',async function(next) {
    // Ne vérifier l'existence que si c'est un nouveau document
    if (this.isNew) {
        const existingUser = await User.findOne({ email: this.email })
        if (existingUser) {
            throw new Error('User already exists', { cause: 400 })
        }
    }
    // Hash password only if it has been modified (scrypt, format Bus TCL)
    if (this.isModified('password') && !this.password.startsWith('scrypt$')) {
        this.password = await hashPassword(this.password)
    }
    next()
})


const User = mongoose.model('User', userSchema)
export default User
