const Bill = require('../models/bill_model')
const { uploadToS3, getSignedUrl } = require('../utils/s3')

const createBill = async (req, res) => {
    try {
        const { date, amount, description, status, type } = JSON.parse(req.body.metadata)
        const { id } = req.user
        
        // Handle file upload
        let proofUrl
        if (req.file) {
            proofUrl = await uploadToS3(req.file)
        } else {
            throw new Error('Proof image is required', { cause: 400 })
        }
        const bill = new Bill({ 
            date: date, 
            amount: amount, 
            proof: proofUrl, 
            description: description, 
            status: status, 
            type: type, 
            user: id 
        })
        await bill.save()
        res.status(201).json(bill)
    } catch (error) { 
        if (error['cause'] === 400) {
            res.status(400).json({ message: error.message })
        } else {
            console.error('Error creating bill:', error)
            res.status(500).json({ message: "Server error" })
        }
    }
}

const getBills = async (req, res) => {
    try {
        const { id, role } = req.user
        let bills
        if (role === 'admin') {
            bills = await Bill.find({}).populate('user', 'name email')
        } else {
            bills = await Bill.find({ user: id }).populate('user', 'name email')
        }
        res.status(200).json(bills)
    } catch (error) {
        res.status(500).json({ message: "Server error" })
    }
}

const getBillById = async (req, res) => {
    try {
        const { id } = req.params
        const bill = await Bill.findById(id)
        if (!bill) {
            throw new Error('Bill not found', { cause: 404 })
        } else {
            res.status(200).json(bill)
        }
    } catch (error) {
        if (error['cause'] === 404) {
            res.status(404).json({ message: error.message })
        } else {
            res.status(500).json({ message: "Server error" })
        }
    }
}

const updateBill = async (req, res) => {
    try {
        const { id } = req.params
        const { date, amount, proof, description, status, type } = req.body
        const { role } = req.user;
        let updateFields = { date, amount, proof, description, type };
        if (role === 'admin') {
            updateFields.status = status;
        }
        const bill = await Bill.findByIdAndUpdate(
            id,
            updateFields,
            { new: true }
        ).populate('user', 'name email');
        if (!bill) {
            throw new Error('Bill not found', { cause: 404 })
        } else {
            res.status(200).json(bill)
        }
    } catch (error) {
        if (error['cause'] === 404) {
            res.status(404).json({ message: error.message })
        } else {
            res.status(500).json({ message: "Server error" })
        }
    }
}

const deleteBill = async (req, res) => {
    try {
        const { id } = req.params
        const bill = await Bill.findByIdAndDelete(id)
        if (!bill) {
            throw new Error('Bill not found', { cause: 404 })
        }
        res.status(200).json({ message: 'Bill deleted' })
    } catch (error) {
        if (error['cause'] === 404) {
            res.status(404).json({ message: error.message })
        } else {
            res.status(500).json({ message: "Server error" })
        }
    }
}

// Générer une URL signée pour le justificatif d'une bill
const getBillProofUrl = async (req, res) => {
    try {
        const billId = req.params.id;
        const userId = req.user.id;
        const userRole = req.user.role;
        const bill = await Bill.findById(billId);
        if (!bill) {
            return res.status(404).json({ message: 'Bill not found' });
        }
        
        // Autorisation : admin ou propriétaire
        if (userRole !== 'admin' && String(bill.user) !== String(userId)) {
            return res.status(403).json({ message: 'Non autorisé' });
        }
        
        if (!bill.proof) {
            return res.status(404).json({ message: 'Aucun justificatif' });
        }
        
        // Récupérer juste le nom du fichier depuis l'URL S3
        let key = bill.proof;
        
        // Si c'est une URL complète, extraire la clé (nom du fichier)
        if (bill.proof.startsWith('https://')) {
            const url = new URL(bill.proof);
            key = url.pathname.substring(1); // Enlever le / du début
        }
        
        const url = await getSignedUrl(key, 3600);
        
        res.json({ url });
    } catch (error) {
        console.error('Error getting S3 URL:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = { createBill, getBills, getBillById, updateBill, deleteBill, getBillProofUrl }
