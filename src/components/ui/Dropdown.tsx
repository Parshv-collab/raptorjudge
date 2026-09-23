import React, { forwardRef, useId } from "react";

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface DropdownProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  label?: string;
  options: DropdownOption[];
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
  placeholder?: string;
}

export const Dropdown = forwardRef<HTMLSelectElement, DropdownProps>(
  ({ label, options, value, onChange, error, placeholder = "Select an option", className = "", id, required, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id || generatedId;

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-xs font-semibold text-[#1d1d1f]">
            {label} {required && <span className="text-[#e63946]">*</span>}
          </label>
        )}
        <div className="relative w-full">
          <select
            ref={ref}
            id={selectId}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            required={required}
            className={`
              w-full appearance-none pl-3.5 pr-10 py-2.5 text-sm rounded-input text-[#1d1d1f]
              bg-white/50 border border-white/80 backdrop-blur-md shadow-sm cursor-pointer
              transition-all duration-150 focus-ring-accent focus:bg-white/80
              disabled:opacity-50 disabled:cursor-not-allowed
              ${error ? "border-[#e63946]" : ""}
              ${className}
            `}
            {...props}
          >
            {placeholder && (
              <option value="" disabled className="text-[#6e6e73]">
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled} className="text-[#1d1d1f]">
                {opt.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#6e6e73]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        {error && (
          <p aria-live="polite" className="text-xs text-[#e63946] font-medium">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Dropdown.displayName = "Dropdown";
