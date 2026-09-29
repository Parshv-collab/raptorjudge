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
  /** Accessible name for the tablist. Defaults to "Tabs". */
  label?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className = "",
  label = "Tabs",
}) => {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`inline-flex items-center gap-1 border-b border-line w-full overflow-x-auto ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            /* Explicit: a bare `<button>` defaults to `type="submit"`, so a
               tab dropped inside any form would submit it. */
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`
              inline-flex items-center gap-2 px-4 h-11 text-sm font-medium border-b-2 -mb-px transition-colors duration-fast whitespace-nowrap
              ${
                isActive
                  ? "border-accent text-primary"
                  : "border-transparent text-secondary hover:text-primary"
              }
            `}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span
                className={`px-1.5 py-0.5 text-[11px] rounded-pill tnum ${
                  isActive ? "bg-accent/10 text-accent" : "bg-surface-2 text-muted"
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
