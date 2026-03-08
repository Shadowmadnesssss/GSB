const mongoose = require('mongoose')
const sha256 = require('js-sha256')

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

userSchema.pre('save', async function(next) {
    // Ne vérifier l'existence que si c'est un nouveau document
    if (this.isNew) {
        const existingUser = await User.findOne({ email: this.email })
        if (existingUser) {
            throw new Error('User already exists', { cause: 400 })
        }
    }
    // Hash password only if it has been modified
    if (this.isModified('password')) {
        this.password = sha256(this.password + process.env.SALT)
    }
    next()
})


const User = mongoose.model('User', userSchema)
module.exports = User