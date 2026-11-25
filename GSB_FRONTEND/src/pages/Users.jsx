import React, { useEffect, useState } from "react";
import Header from "../components/Header";
import EditUserModal from "../components/EditUserModal";
import { api } from '../api';
import { logout } from '../auth';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editUser, setEditUser] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [resetPasswordModal, setResetPasswordModal] = useState({ isOpen: false, user: null });
  const [resetPasswordForm, setResetPasswordForm] = useState({ password: '', confirmPassword: '' });
  const [resetPasswordError, setResetPasswordError] = useState(null);

  useEffect(() => {
    async function fetchUsers() {
      setLoading(true);
      setError(null);
      try {
        const data = await api.get('/users');
        setUsers(data);
      } catch {
        setError("Error while fetching users");
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
  }, []);

  const handleEdit = (user) => {
    setEditUser(user);
    setModalOpen(true);
  };

  const handleSave = (updatedUser) => {
    setUsers(users => users.map(u => u._id === updatedUser._id ? updatedUser : u));
    setModalOpen(false);
    setEditUser(null);
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`Do you really want to delete user ${user.name || user.email}?`)) return;
    try {
      await api.delete('/users', { query: { email: user.email } });
      setUsers(users => users.filter(u => u._id !== user._id));
    } catch {
      alert("Error while deleting");
    }
  };

  const validatePassword = (password) => {
    if (password.length < 8) return "Password must contain at least 8 characters";
    if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter";
    if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter";
    if (!/[0-9]/.test(password)) return "Password must contain at least one number";
    return null;
  };

  const handleResetPassword = (user) => {
    setResetPasswordModal({ isOpen: true, user });
    setResetPasswordForm({ password: '', confirmPassword: '' });
    setResetPasswordError(null);
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    setResetPasswordError(null);

    // Password validation
    const passwordError = validatePassword(resetPasswordForm.password);
    if (passwordError) {
      setResetPasswordError(passwordError);
      return;
    }

    // Check that passwords match
    if (resetPasswordForm.password !== resetPasswordForm.confirmPassword) {
      setResetPasswordError("Passwords do not match");
      return;
    }

    try {
      await api.put('/users/password', {
        email: resetPasswordModal.user.email,
        newPassword: resetPasswordForm.password,
        isAdminReset: true
      });

      alert("Password successfully reset!");
      setResetPasswordModal({ isOpen: false, user: null });
    } catch (e) {
      setResetPasswordError(e.message || "Error while resetting password");
    }
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#101828] via-[#16213e] to-[#223047] text-white">
      <Header onLogout={handleLogout} />
      <main className="p-8">
        <h1 className="text-2xl font-bold mb-8 text-white">Users</h1>
        {loading && <div className="text-gray-300">Loading...</div>}
        {error && <div className="text-red-400">{error}</div>}
        {!loading && !error && (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-[#16213e] rounded-xl shadow divide-y divide-[#223047]">
              <thead className="bg-[#223047]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-white uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-white uppercase">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-white uppercase">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-white uppercase">Expense reports</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-white uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#223047]">
                {users.map(user => (
                  <tr key={user._id} className="hover:bg-[#223047]/60">
                    <td className="px-6 py-4 whitespace-nowrap text-white font-medium">{user.name || '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-200">{user.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-200">{user.role}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-200">{user.billsCount ?? '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 text-xs font-semibold mr-2"
                        onClick={() => handleEdit(user)}
                      >
                        Edit
                      </button>
                      <button
                        className="px-3 py-1 rounded bg-yellow-600 text-white hover:bg-yellow-700 text-xs font-semibold mr-2"
                        onClick={() => handleResetPassword(user)}
                      >
                        Reset PWD
                      </button>
                      {user.role !== 'admin' && (
                        <button
                          className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700 text-xs font-semibold"
                          onClick={() => handleDelete(user)}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <EditUserModal
          user={editUser}
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
        
        {/* Password reset modal */}
        {resetPasswordModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-[#16213e] rounded-xl p-8 w-full max-w-md shadow-2xl">
              <h2 className="text-xl font-bold mb-6 text-white">
                Reset password for {resetPasswordModal.user.name || resetPasswordModal.user.email}
              </h2>
              <form onSubmit={handleResetPasswordSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="block text-white mb-1">New password</label>
                  <input
                    type="password"
                    value={resetPasswordForm.password}
                    onChange={e => setResetPasswordForm(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full rounded p-2 bg-[#223047] text-white border border-[#223047]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-white mb-1">Confirm password</label>
                  <input
                    type="password"
                    value={resetPasswordForm.confirmPassword}
                    onChange={e => setResetPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    className="w-full rounded p-2 bg-[#223047] text-white border border-[#223047]"
                    required
                  />
                </div>
                {resetPasswordError && (
                  <div className="text-red-400 text-sm">{resetPasswordError}</div>
                )}
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setResetPasswordModal({ isOpen: false, user: null })}
                    className="px-4 py-2 rounded bg-gray-500 text-white hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Reset
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
} 