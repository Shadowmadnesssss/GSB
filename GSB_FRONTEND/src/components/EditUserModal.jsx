import React, { useState } from "react";
import { api } from '../api';

const ROLES = [
  { label: "Administrator", value: "admin" },
  { label: "User", value: "utilisateur" },
  { label: "User", value: "user" }, // for potential compatibility
  { label: "USER", value: "USER" }, // for potential compatibility
];

export default function EditUserModal({ user, isOpen, onClose, onSave }) {
  const [form, setForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    role: user?.role || "utilisateur",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  React.useEffect(() => {
    setForm({
      name: user?.name || "",
      email: user?.email || "",
      role: user?.role || "utilisateur",
    });
    setError(null);
  }, [user, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const updated = await api.put('/users', form, { query: { email: user.email } });
      onSave(updated);
    } catch {
      setError("Error while updating");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-[#16213e] rounded-xl p-8 w-full max-w-md shadow-2xl">
        <h2 className="text-xl font-bold mb-6 text-white">Edit User</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="text-white">
            Name
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              className="mt-1 block w-full rounded bg-[#223047] text-white p-2 border border-[#223047] focus:outline-none"
              required
            />
          </label>
          <label className="text-white">
            Email
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              className="mt-1 block w-full rounded bg-[#223047] text-white p-2 border border-[#223047] focus:outline-none"
              required
            />
          </label>
          <label className="text-white">
            Role
            <select
              name="role"
              value={form.role}
              onChange={handleChange}
              className="mt-1 block w-full rounded bg-[#223047] text-white p-2 border border-[#223047] focus:outline-none"
              required
            >
              {ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </label>
          {error && <div className="text-red-400 text-sm">{error}</div>}
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-500 text-white hover:bg-gray-600">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 