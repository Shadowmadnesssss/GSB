import express from 'express'
import { createBill, getBills, getBillById, updateBill, deleteBill, getBillProofUrl } from '../controllers/bill_controller.js'
import { verifyToken } from '../controllers/authentication_controller.js'
import upload from '../middleware/upload.js'

const router = express.Router()

router.post('/', verifyToken, upload.single('proof'), createBill)
router.get('/', verifyToken, getBills)
router.get('/:id', verifyToken, getBillById)
router.put('/:id', verifyToken, updateBill)
router.delete('/:id', verifyToken, deleteBill)
router.get('/:id/proof-url', verifyToken, getBillProofUrl)

export default router
