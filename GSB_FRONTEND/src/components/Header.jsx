import { useState } from 'react';

export default function Header({ onLogout }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const user = JSON.parse(localStorage.getItem('user'));
  const userName = user?.name || '';

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <header className="bg-[#16213e] shadow flex items-center px-8 py-4 text-white">
      <div className="flex items-center justify-between fixed right-0 p-0">
        <div className="flex items-center">
          {userName && (
            <span className="ml-6 text-white font-semibold p-2 rounded">
              {userName}
            </span>
          )}
        </div>
        <div className="hidden md:block">
          <div className="flex items-center space-x-1">
            <div className="h-6 w-px bg-[#223047]"></div>
            <button
              onClick={onLogout}
              className="px-3 py-1 text-sm text-white hover:text-blue-300 rounded-md hover:bg-[#223047]"
            >
              Logout
            </button>
          </div>
        </div>
        
        <div className="md:hidden">
          <button
            onClick={toggleMenu}
            className="text-white hover:text-blue-300 focus:outline-none"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={isMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
              />
            </svg>
          </button>
        </div>
      </div>
      
      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="mt-3 border-t border-[#223047] pt-3 md:hidden bg-[#16213e] text-white">
          <div className="space-y-1">
            <div className="flex items-center justify-between py-2">
              {userName && <span className="text-white font-semibold">{userName}</span>}
              <button
                onClick={onLogout}
                className="px-3 py-1 text-sm text-white hover:text-blue-300 rounded-md hover:bg-[#223047]"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
} 