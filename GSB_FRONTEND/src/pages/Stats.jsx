import React from "react";
import Header from "../components/Header";
import StatsCards from "../components/StatsCards";
import StatsCharts from "../components/StatsCharts";
import { logout } from "../auth";

export default function Stats() {
  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#101828] via-[#16213e] to-[#223047] text-white">
      <Header onLogout={handleLogout} />
      <main className="p-8">
        <h1 className="text-2xl font-bold mb-8 text-white">Statistics</h1>
        <StatsCards />
        <StatsCharts />
        {/* Charts will be added here (pie charts, bar charts, etc.) */}
      </main>
    </div>
  );
} 