import express from 'express'
import * as userController from '../controllers/user_controller.js'
import { verifyToken, isAdmin } from '../controllers/authentication_controller.js'

const router = express.Router()

// L'inscription publique passe par POST /auth/register (voir index.js) ;
// créer un compte avec un rôle choisi est réservé aux admins.
router.post('/', verifyToken, isAdmin, userController.createUser)
router.get('/', verifyToken, userController.getUsers)
router.put('/', verifyToken, userController.updateUser)
router.delete('/', verifyToken, userController.deleteUser)
router.put('/password', verifyToken, userController.resetPassword)

export default router
