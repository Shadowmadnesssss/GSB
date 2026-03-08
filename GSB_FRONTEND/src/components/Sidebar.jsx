import React from "react";
import { NavLink } from "react-router-dom";
import logo from '../assets/logoblanc.png';

const navItems = [
  { name: "Dashboard", path: "/dashboard" },
  { name: "Statistics", path: "/stats" },
  { name: "Users", path: "/users", admin: true },
  { name: "Settings", path: "/settings" },
];

const Sidebar = ({ isAdmin }) => {
  return (
    <aside className="h-screen w-64 bg-[#16213e] text-white flex flex-col py-8 px-4 shadow-2xl fixed left-0 top-0 z-30">
      <div className="mb-5 flex justify-center select-none">
        <img src={logo} alt="GSB Logo" className="h-30 w-auto" />
      </div>
      <nav className="flex-1 flex flex-col gap-2">
        {navItems.map((item) => {
          if (item.admin && !isAdmin) return null;
          return (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center px-4 py-3 rounded-lg transition-colors duration-200 font-medium text-lg hover:bg-[#223047] ${isActive ? 'bg-[#223047] text-blue-400' : ''}`
              }
              end={item.path === "/"}
            >
              {item.name}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar; 