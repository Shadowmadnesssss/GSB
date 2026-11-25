// L'authentification est faite par l'Auth Bus de Bus TCL (lib/bus-tcl), monté dans index.js :
//   - POST /auth/login, /auth/refresh, /auth/logout, GET /auth/me : API bus-tcl
//   - chaque requête non publique passe par authenticate(), qui remplit req.auth
//
// verifyToken garde son nom pour les routes existantes : il expose req.auth.user sous la
// forme attendue par les contrôleurs GSB (req.user = { id, role, email }).
const verifyToken = (req, res, next) => {
    const user = req.auth?.user
    if (!user) {
        return res.status(401).json({ error: 'NO_TOKEN', message: 'Authentification requise' })
    }
    req.user = { id: user.id, role: user.role, email: user.email }
    next()
}

// Middleware to check if user is admin (à placer après verifyToken)
const isAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Permission refusée' })
    }
    next()
}

export { verifyToken, isAdmin }
