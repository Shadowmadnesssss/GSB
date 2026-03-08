import React, { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { API_URL } from '../config';

const COLORS = ["#", "#", "#", "#", "#", "#", "#"];

// Colors for types (order: Transport, Accommodation, Meals, Other)
const TYPE_COLORS = ['#2196F3', '#43A047', '#FF9800', '#8E24AA'];
// Colors for statuses (order: Approved, Pending, Rejected)
const STATUS_COLORS = ['#13fb00', '#2196F3', '#E53935'];

export default function StatsCharts() {
  const [bills, setBills] = useState([]);
  const token = localStorage.getItem('token');

  useEffect(() => {
    async function fetchBills() {
      try {
        const res = await fetch(`${API_URL}/bills`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        setBills(data);
      } catch (e) {}
    }
    fetchBills();
  }, [token]);

  // Distribution by type
  const typeData = Array.from(
    bills.reduce((acc, b) => {
      acc.set(b.type, (acc.get(b.type) || 0) + 1);
      return acc;
    }, new Map()),
    ([name, value]) => ({ name, value })
  );

  // Distribution by status
  const statusData = Array.from(
    bills.reduce((acc, b) => {
      acc.set(b.status, (acc.get(b.status) || 0) + 1);
      return acc;
    }, new Map()),
    ([name, value]) => ({ name, value })
  );

  // Monthly expense evolution
  const monthlyData = (() => {
    const months = {};
    bills.forEach(b => {
      const d = new Date(b.date);
      if (isNaN(d)) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months[key] = (months[key] || 0) + (b.amount || 0);
    });
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => ({ month, total }));
  })();

  // Translation of types and statuses to English for charts
  const typeLabelMap = {
    'Transport': 'Transport',
    'Hébergement': 'Accommodation',
    'Repas': 'Meals',
    'Autre': 'Other',
  };
  const statusLabelMap = {
    'Accepté': 'Approved',
    'En attente': 'Pending',
    'Rejeté': 'Rejected',
  };

  // Distribution by amount (total spending per type)
  const amountData = Array.from(
    bills.reduce((acc, b) => {
      const amount = parseFloat(b.amount) || 0;
      acc.set(b.type, (acc.get(b.type) || 0) + amount);
      return acc;
    }, new Map()),
    ([name, value]) => ({ name, value })
  );

  // Translated data for charts
  const typeDataEn = typeData.map(({ name, value }) => ({ name: typeLabelMap[name] || name, value }));
  const statusDataEn = statusData.map(({ name, value }) => ({ name: statusLabelMap[name] || name, value }));
  const amountDataEn = amountData.map(({ name, value }) => ({ name: typeLabelMap[name] || name, value }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      {/* Pie charts */}
      <div className="flex flex-col items-center">
        <h3 className="mb-4 text-lg font-semibold text-white">Distribution by type</h3>
        <ResponsiveContainer width={320} height={320}>
          <PieChart>
            <Pie
              data={typeDataEn}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={100}
              innerRadius={60}
              label={({ value }) => value}
            >
              {typeDataEn.map((entry, index) => (
                <Cell key={`cell-type-${index}`} fill={TYPE_COLORS[index % TYPE_COLORS.length]} />
              ))}
            </Pie>
            <Legend formatter={(value) => {
              switch(value) {
                case 'Transport': return 'Transport';
                case 'Hébergement': return 'Accommodation';
                case 'Repas': return 'Meals';
                case 'Autre': return 'Other';
                default: return value;
              }
            }} />
            <Tooltip formatter={(value, name) => {
              switch(name) {
                case 'Transport': return [value, 'Transport'];
                case 'Hébergement': return [value, 'Accommodation'];
                case 'Repas': return [value, 'Meals'];
                case 'Autre': return [value, 'Other'];
                default: return [value, name];
              }
            }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col items-center">
        <h3 className="mb-4 text-lg font-semibold text-white">Distribution by status</h3>
        <ResponsiveContainer width={320} height={320}>
          <PieChart>
            <Pie
              data={statusDataEn}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={100}
              innerRadius={60}
              label={({ value }) => value}
            >
              {statusDataEn.map((entry, index) => {
                // On veut : Approved = jaune, Pending = bleu, Rejected = rouge
                let color = '#BDBDBD';
                if (entry.name === 'Approved') color = STATUS_COLORS[0];
                else if (entry.name === 'Pending') color = STATUS_COLORS[1];
                else if (entry.name === 'Rejected') color = STATUS_COLORS[2];
                return <Cell key={`cell-status-${index}`} fill={color} />;
              })}
            </Pie>
            <Legend formatter={(value) => {
              switch(value) {
                case 'Accepté': return 'Approved';
                case 'En attente': return 'Pending';
                case 'Rejeté': return 'Rejected';
                default: return value;
              }
            }} />
            <Tooltip formatter={(value, name) => {
              switch(name) {
                case 'Accepté': return [value, 'Approved'];
                case 'En attente': return [value, 'Pending'];
                case 'Rejeté': return [value, 'Rejected'];
                default: return [value, name];
              }
            }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col items-center">
        <h3 className="mb-4 text-lg font-semibold text-white">Total spending by type</h3>
        <ResponsiveContainer width={320} height={320}>
          <PieChart>
            <Pie
              data={amountDataEn}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={100}
              innerRadius={60}
              label={({ value }) => `€${value.toFixed(0)}`}
            >
              {amountDataEn.map((entry, index) => (
                <Cell key={`cell-amount-${index}`} fill={TYPE_COLORS[index % TYPE_COLORS.length]} />
              ))}
            </Pie>
            <Legend formatter={(value) => {
              switch(value) {
                case 'Transport': return 'Transport';
                case 'Hébergement': return 'Accommodation';
                case 'Repas': return 'Meals';
                case 'Autre': return 'Other';
                default: return value;
              }
            }} />
            <Tooltip formatter={(value, name) => {
              const translatedName = (() => {
                switch(name) {
                  case 'Transport': return 'Transport';
                  case 'Hébergement': return 'Accommodation';
                  case 'Repas': return 'Meals';
                  case 'Autre': return 'Other';
                  default: return name;
                }
              })();
              return [`€${value.toFixed(2)}`, translatedName];
            }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* Monthly evolution */}
      <div className="md:col-span-3 mt-10">
        <h3 className="mb-4 text-lg font-semibold text-white">Monthly expense evolution</h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={monthlyData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#223047" />
            <XAxis dataKey="month" stroke="#fff" />
            <YAxis stroke="#fff" />
            <Tooltip />
            <Bar dataKey="total" fill="#0088FE" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
} 