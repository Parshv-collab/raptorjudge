import React from "react";

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  label: string;
}

export const Chip: React.FC<ChipProps> = ({ selected = false, label, className = "", ...props }) => {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`
        inline-flex items-center px-3 h-8 text-[13px] font-medium rounded-pill border transition-colors duration-fast
        ${
          selected
            ? "bg-accent/10 text-accent border-accent/40"
            : "bg-surface-1 text-secondary border-line hover:border-line-strong hover:text-primary"
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
        <label className="text-[13px] text-secondary">
          {label} {maxSelectable && <span className="text-muted">(max {maxSelectable})</span>}
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
