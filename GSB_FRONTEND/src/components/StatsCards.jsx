import React, { useEffect, useState } from "react";
import { api } from '../api';

export default function StatsCards() {
  const [stats, setStats] = useState({
    totalBills: 0,
    totalAmount: 0,
    users: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  useEffect(() => {
    async function fetchStats() {
      try {
        const bills = await api.get('/bills');
        const users = await api.get('/users');
        setStats({
          totalBills: bills.length,
          totalAmount: bills.reduce((sum, b) => sum + (b.amount || 0), 0),
          users: users.length,
          pending: bills.filter(b => b.status === 'Pending').length,
          approved: bills.filter(b => b.status === 'Approved').length,
          rejected: bills.filter(b => b.status === 'Rejected').length,
        });
      } catch (e) {
        // ignore for now
      }
    }
    fetchStats();
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
      <div className="bg-[#223047] rounded-xl p-6 flex flex-col items-center shadow">
        <span className="text-3xl font-bold text-blue-400">{stats.totalBills}</span>
        <span className="text-sm text-gray-200 mt-2">Expense notes</span>
      </div>
      <div className="bg-[#223047] rounded-xl p-6 flex flex-col items-center shadow">
        <span className="text-3xl font-bold text-green-400">{stats.totalAmount.toLocaleString()} €</span>
        <span className="text-sm text-gray-200 mt-2">Total amount</span>
      </div>
      <div className="bg-[#223047] rounded-xl p-6 flex flex-col items-center shadow">
        <span className="text-3xl font-bold text-yellow-400">{stats.users}</span>
        <span className="text-sm text-gray-200 mt-2">Active users</span>
      </div>
      <div className="bg-[#223047] rounded-xl p-6 flex flex-col items-center shadow w-full">
        <div className="flex flex-col items-center">
          <span className="text-xs text-gray-300">Pending</span>
          <span className="font-bold text-yellow-400">{stats.pending}</span>
        </div>
        <div className="flex flex-col items-center mt-2">
          <span className="text-xs text-gray-300">Approved</span>
          <span className="font-bold text-green-400">{stats.approved}</span>
        </div>
        <div className="flex flex-col items-center mt-2">
          <span className="text-xs text-gray-300">Rejected</span>
          <span className="font-bold text-red-400">{stats.rejected}</span>
        </div>
      </div>
    </div>
  );
} 