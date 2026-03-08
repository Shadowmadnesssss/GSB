import React from "react";
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from "recharts";

const TYPE_COLORS = ['#693dff', '#2a79cd', '#FF9800', '#538114'];
const STATUS_COLORS = {
  "Approved": "#13fb00",   // Approved = green
  "Pending": "#2196F3", // Pending = blue
  "Rejected": "#E53935"     // Rejected = red
};

const BillsStatsChart = ({ bills }) => {
  // Group by expense type
  const typeData = [
    { name: "Transport", value: bills.filter(b => b.type === "Transport").length },
    { name: "Accommodation", value: bills.filter(b => b.type === "Accommodation" || b.type === "Hébergement" || b.type === "hostellery").length },
    { name: "Meals", value: bills.filter(b => b.type === "Meals" || b.type === "Repas" || b.type === "Food expense").length },
    { name: "Other", value: bills.filter(b => b.type === "Other" || b.type === "Autre" || b.type === "Option B").length },
  ].filter(d => d.value > 0);

  // Group by status
  const statusData = [
    { name: "Approved", value: bills.filter(b => b.status === "Approved").length },
    { name: "Pending", value: bills.filter(b => b.status === "Pending").length },
    { name: "Rejected", value: bills.filter(b => b.status === "Rejected").length },
  ].filter(d => d.value > 0);

  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 40, marginBottom: 40 }}>
      <div>
        <h4 style={{ textAlign: "center" }}>Distribution by type</h4>
        <ResponsiveContainer width={250} height={250}>
          <PieChart>
            <Pie
              data={typeData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label
            >
              {typeData.map((entry, index) => (
                <Cell key={`cell-type-${index}`} fill={TYPE_COLORS[index % TYPE_COLORS.length]} />
              ))}
            </Pie>
            <Legend />
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h4 style={{ textAlign: "center" }}>Distribution by status</h4>
        <ResponsiveContainer width={250} height={250}>
          <PieChart>
            <Pie
              data={statusData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label
            >
              {statusData.map((entry, index) => (
                <Cell key={`cell-status-${index}`} fill={STATUS_COLORS[entry.name] || "#BDBDBD"} />
              ))}
            </Pie>
            <Legend />
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default BillsStatsChart; 