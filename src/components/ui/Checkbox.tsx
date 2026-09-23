import React, { forwardRef, useId } from "react";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: React.ReactNode;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, error, className = "", id, ...props }, ref) => {
    const generatedId = useId();
    const checkboxId = id || generatedId;

    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={checkboxId} className="inline-flex items-center gap-2.5 cursor-pointer text-sm text-[#1d1d1f]">
          <input
            ref={ref}
            id={checkboxId}
            type="checkbox"
            className={`
              w-4 h-4 rounded text-[#ff0055] bg-white/60 border-white/90
              focus:ring-[#ff0055]/30 focus:ring-2 cursor-pointer
              ${className}
            `}
            {...props}
          />
          <span className="select-none">{label}</span>
        </label>
        {error && (
          <p aria-live="polite" className="text-xs text-[#e63946] font-medium ml-6">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Checkbox.displayName = "Checkbox";
