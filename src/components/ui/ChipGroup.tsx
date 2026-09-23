import React from "react";

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  label: string;
}

export const Chip: React.FC<ChipProps> = ({ selected = false, label, className = "", ...props }) => {
  return (
    <button
      type="button"
      className={`
        inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-150 focus-ring-accent
        ${
          selected
            ? "bg-[#ff0055] text-white shadow-sm shadow-[#ff0055]/30"
            : "bg-white/50 text-[#1d1d1f] border border-white/80 hover:bg-white/80"
        }
        ${className}
      `}
      {...props}
    >
      {label}
    </button>
  );
};

export interface ChipGroupProps {
  label?: string;
  options: { id: string; label: string }[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  maxSelectable?: number;
  className?: string;
}

export const ChipGroup: React.FC<ChipGroupProps> = ({
  label,
  options,
  selectedIds,
  onChange,
  maxSelectable,
  className = "",
}) => {
  const toggleChip = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((item) => item !== id));
    } else {
      if (maxSelectable && selectedIds.length >= maxSelectable) return;
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className={`w-full flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-xs font-semibold text-[#1d1d1f]">
          {label} {maxSelectable && <span className="text-[#6e6e73] font-normal">(Max {maxSelectable})</span>}
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <Chip
            key={opt.id}
            label={opt.label}
            selected={selectedIds.includes(opt.id)}
            onClick={() => toggleChip(opt.id)}
          />
        ))}
      </div>
    </div>
  );
};
