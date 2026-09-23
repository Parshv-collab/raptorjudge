import React from "react";

export interface TabItem {
  id: string;
  label: string;
  badge?: string | number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onChange, className = "" }) => {
  return (
    <div
      role="tablist"
      className={`inline-flex p-1 gap-1 rounded-input bg-white/40 border border-white/70 backdrop-blur-md ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`
              inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-button transition-all duration-150 focus-ring-accent
              ${
                isActive
                  ? "bg-white text-[#1d1d1f] shadow-sm font-bold"
                  : "text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-white/40"
              }
            `}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span
                className={`px-1.5 py-0.5 text-[10px] rounded-full ${
                  isActive ? "bg-[#ff0055]/10 text-[#ff0055]" : "bg-black/5 text-[#6e6e73]"
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
