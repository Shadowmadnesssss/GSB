const jwt = require('jsonwebtoken');
const User = require('../models/user_model');
const sha256 = require('js-sha256')
const JWT_SECRET = 'your-secret-key'; // In production, use environment variable

// Login method that will check if the user exists and if the password is correct returns a token
const login = async (req, res) => {
    try {
    const { email, password } = req.body
        console.log('Login attempt for:', email)
        
        if (!process.env.SALT) {
            console.error('SALT not defined in environment variables')
            return res.status(500).json({ message: 'Incorrect server configuration' })
        }
    
    const user = await User.findOne({ email })
    if (!user) {
            console.log('User not found:', email)
       return res.status(401).json({ message: 'Invalid email or password' })
    }

        const hashedPassword = sha256(password + process.env.SALT)
        
        if (user.password !== hashedPassword) {
            console.log('Incorrect password for:', email)
       return res.status(401).json({ message: 'Invalid email or password' })
    }

        const token = jwt.sign(
            { id: user._id, role: user.role, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        )

        console.log('Successful login for:', email)
    res.status(200).json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    })
    } catch (error) {
        console.error('Login error:', error)
        res.status(500).json({ message: 'Server error' })
    }
}

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    if (!req.headers.authorization) {
        return res.status(401).json({ message: 'No authorization header provided' })
    }
    const token = req.headers.authorization.split(' ')[1]
    if (!token) {
        return res.status(401).json({ message: 'No token provided' })
    }
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: 'Invalid token' })
        }
        req.user = decoded
        next()
    })
}
// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
   
}

module.exports = { login, verifyToken, isAdmin }
