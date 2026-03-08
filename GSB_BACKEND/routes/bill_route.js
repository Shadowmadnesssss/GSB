const express = require('express')
const router = express.Router()
const { createBill, getBills, getBillById, updateBill, deleteBill, getBillProofUrl } = require('../controllers/bill_controller')
const { verifyToken } = require('../controllers/authentication_controller')
const upload = require('../middleware/upload')

router.post('/', verifyToken, upload.single('proof'), createBill)
router.get('/', verifyToken, getBills)
router.get('/:id', verifyToken, getBillById)
router.put('/:id', verifyToken, updateBill)
router.delete('/:id', verifyToken, deleteBill)
router.get('/:id/proof-url', verifyToken, getBillProofUrl)

module.exports = router 