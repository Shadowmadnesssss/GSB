import User from '../models/user_model.js'
import Bill from '../models/bill_model.js'
import { hashPassword, verifyUserPassword } from '../bus/userStore.js'

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

// Inscription publique (POST /auth/register) : le rôle n'est jamais choisi par le client.
const registerUser = async (req, res) => {
    req.body = { ...(req.body ?? {}), role: 'USER' }
    return createUser(req, res)
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
        // findOneAndUpdate ne déclenche pas le hook pre('save') : on hache ici
        if (password) updateFields.password = await hashPassword(password)
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
            // Vérifie l'ancien mot de passe (scrypt, ou ancien format sha256)
            // 400 et pas 401 : un 401 signifie « session perdue » pour le SDK, qui déconnecterait.
            if (!(await verifyUserPassword(currentPassword, user.password, null))) {
                throw new Error('Incorrect old password', { cause: 400 });
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
        } else if (error['cause'] === 400) {
            res.status(400).json({ message: error.message });
        } else {
            console.log(error);
            res.status(500).json({ message: "Server error" });
        }
    }
};

export { createUser, registerUser, getUsers, getUserByEmail, updateUser, deleteUser, resetPassword }

