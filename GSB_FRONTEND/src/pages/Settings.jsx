import React, { useState } from "react";
import Header from "../components/Header";
import SettingsTabs from "../components/SettingsTabs";
import { api } from '../api';
import { logout } from '../auth';

function ProfileForm() {
  const user = JSON.parse(localStorage.getItem('user'));
  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '' });
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      await api.put('/users', form, { query: { email: user.email } });
      setMessage("Profile updated!");
      localStorage.setItem('user', JSON.stringify({ ...user, ...form }));
    } catch {
      setMessage("Error during update");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div>
        <label className="block text-white mb-1">Name</label>
        <input type="text" name="name" value={form.name} onChange={handleChange} className="w-full rounded p-2 bg-[#16213e] text-white border border-[#223047]" required />
      </div>
      <div>
        <label className="block text-white mb-1">Email</label>
        <input type="email" name="email" value={form.email} onChange={handleChange} className="w-full rounded p-2 bg-[#16213e] text-white border border-[#223047]" required />
      </div>
      {message && <div className="text-blue-400 text-sm">{message}</div>}
      <button type="submit" disabled={loading} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 w-fit">{loading ? "Saving..." : "Save"}</button>
    </form>
  );
}

function PasswordForm() {
  const user = JSON.parse(localStorage.getItem('user'));
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const validatePassword = (password) => {
    if (password.length < 8) return "Password must be at least 8 characters long";
    if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter";
    if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter";
    if (!/[0-9]/.test(password)) return "Password must contain at least one number";
    return null;
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    // Password validation
    const passwordError = validatePassword(form.newPassword);
    if (passwordError) {
      setMessage(passwordError);
      setLoading(false);
      return;
    }

    // Check if passwords match
    if (form.newPassword !== form.confirmPassword) {
      setMessage("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      await api.put('/users/password', {
        email: user.email,
        currentPassword: form.currentPassword,
        newPassword: form.newPassword
      });

      setMessage("Password changed successfully!");
      setForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
    } catch (e) {
      setMessage(e.message || "Error changing password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div>
        <label className="block text-white mb-1">Current password</label>
        <input
          type="password"
          name="currentPassword"
          value={form.currentPassword}
          onChange={handleChange}
          className="w-full rounded p-2 bg-[#16213e] text-white border border-[#223047]"
          required
        />
      </div>
      <div>
        <label className="block text-white mb-1">New password</label>
        <input
          type="password"
          name="newPassword"
          value={form.newPassword}
          onChange={handleChange}
          className="w-full rounded p-2 bg-[#16213e] text-white border border-[#223047]"
          required
        />
      </div>
      <div>
        <label className="block text-white mb-1">Confirm new password</label>
        <input
          type="password"
          name="confirmPassword"
          value={form.confirmPassword}
          onChange={handleChange}
          className="w-full rounded p-2 bg-[#16213e] text-white border border-[#223047]"
          required
        />
      </div>
      {message && (
        <div className={`text-sm ${message.includes("successfully") ? "text-green-400" : "text-red-400"}`}>
          {message}
        </div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 w-fit"
      >
        {loading ? "Updating..." : "Update password"}
      </button>
    </form>
  );
}

export default function Settings() {
  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#101828] via-[#16213e] to-[#223047] text-white">
      <Header onLogout={handleLogout} />
      <main className="p-8">
        <h1 className="text-2xl font-bold mb-8 text-white">Settings</h1>
        <SettingsTabs>
          <ProfileForm />
          <PasswordForm />
          <div className="text-white">Preferences coming soon…</div>
        </SettingsTabs>
      </main>
    </div>
  );
} 