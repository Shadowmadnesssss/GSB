const { sha256 } = require('js-sha256')
const User = require('../models/user_model')
const Bill = require('../models/bill_model')

const createUser = async (req, res) => {
    try {
        const { name, email, password, role } = req.body
        const user = new User({ name, email, password, role })
        await user.save()
        res.status(201).json(user)
    } catch (error) {
        if (error['cause'] === 400) {
            res.status(400).json({ message: error.message })
        } else {
            console.log(error)
            res.status(500).json({ message: "Server error" })
        }
    }
}

const getUsers = async (req, res) => {
    try {
        // if email is provided, find user by email else find all users
        const email = req.query.email ? {email: req.query.email} : {}
        const users = await User.find(email)
        // Pour chaque utilisateur, compter le nombre de notes de frais
        const usersWithBillsCount = await Promise.all(
            users.map(async (user) => {
                const billsCount = await Bill.countDocuments({ user: user._id });
                return {
                    ...user.toObject(),
                    billsCount,
                };
            })
        );
        res.status(200).json(usersWithBillsCount)
    } catch (error) {
        res.status(500).json({ message: "Server error" })
    }
}

const getUserByEmail = async (req, res) => {
    try {
        const { email } = req.query
        const user = await User.findOne({ email })
        if (!user) {
            throw new Error('User not found', { cause: 404 })
        } else {
            res.status(200).json(user)
        }
    } catch (error) {
        if (error['cause'] === 404) {
            res.status(404).json({ message: error.message })
        } else {
            res.status(500).json({ message: "Server error" })
        }
    }
}

const updateUser = async (req, res) => {
    try {
        const { email } = req.query
        const { name, newEmail, password, role } = req.body
        
        // Vérifier si l'utilisateur existe
        const existingUser = await User.findOne({ email })
        if (!existingUser) {
            throw new Error('User not found', { cause: 404 })
        }

        // Préparer les champs à mettre à jour
        const updateFields = {}
        if (name) updateFields.name = name
        if (newEmail) updateFields.email = newEmail
        if (password) updateFields.password = password
        if (role) updateFields.role = role

        // Mettre à jour l'utilisateur
        const user = await User.findOneAndUpdate(
            { email },
            updateFields,
            { new: true, runValidators: true }
        )

            res.status(200).json(user)
    } catch (error) {
        if (error['cause'] === 404) {
            res.status(404).json({ message: error.message })
        } else {
            console.error('Error updating user:', error)
            res.status(500).json({ message: "Server error" })
        }
    }
}

const deleteUser = async (req, res) => {
    try {
        const { email } = req.query
        await User.findOneAndDelete({email})
        res.status(200).json({ message: 'User deleted' })
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: "Server error" })
    }
}

const resetPassword = async (req, res) => {
    try {
        const { email, currentPassword, newPassword, isAdminReset } = req.body;

        // Vérifier si l'utilisateur existe
        const user = await User.findOne({ email });
        if (!user) {
            throw new Error('User not found', { cause: 404 });
        }

        // Si ce n'est pas un reset admin, vérifier l'identité et l'ancien mot de passe
        if (!isAdminReset) {
            // Vérifie que l'utilisateur connecté correspond à l'email
            if (req.user.email !== email) {
                throw new Error('Unauthorized', { cause: 403 });
            }
            // Vérifie l'ancien mot de passe
            const hash = require('js-sha256').sha256;
            if (user.password !== hash(currentPassword + process.env.SALT)) {
                throw new Error('Incorrect old password', { cause: 401 });
            }
        } else {
            // Si admin, vérifie le rôle
            if (req.user.role !== 'admin') {
                throw new Error('Unauthorized', { cause: 403 });
            }
        }

        // Met à jour le mot de passe (le hash sera fait par le middleware)
        user.password = newPassword;
        await user.save();

        res.status(200).json({ message: 'Password successfully updated' });
    } catch (error) {
        if (error['cause'] === 404) {
            res.status(404).json({ message: error.message });
        } else if (error['cause'] === 403) {
            res.status(403).json({ message: error.message });
        } else if (error['cause'] === 401) {
            res.status(401).json({ message: error.message });
        } else {
            console.log(error);
            res.status(500).json({ message: "Server error" });
        }
    }
};

module.exports = { createUser, getUsers, getUserByEmail, updateUser, deleteUser, resetPassword }

