import React, { useState } from 'react';

export default function SettingsTabs({ children }) {
  const [activeTab, setActiveTab] = useState(0);
  const tabs = ['Profile', 'Password', 'Preferences'];

  return (
    <div className="bg-[#16213e] rounded-lg p-6">
      <div className="flex gap-4 mb-6 border-b border-[#223047]">
        {tabs.map((tab, index) => (
          <button
            key={tab}
            onClick={() => setActiveTab(index)}
            className={`pb-2 px-4 ${
              activeTab === index
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {React.Children.toArray(children)[activeTab]}
      </div>
    </div>
  );
} 