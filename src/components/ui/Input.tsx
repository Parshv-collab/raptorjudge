import React, { forwardRef, useId } from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = "", id, required, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-xs font-semibold text-[#1d1d1f]">
            {label} {required && <span className="text-[#e63946]">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          required={required}
          className={`
            w-full px-3.5 py-2.5 text-sm rounded-input text-[#1d1d1f] placeholder-[#6e6e73]/60
            bg-white/50 border border-white/80 backdrop-blur-md shadow-sm
            transition-all duration-150 focus-ring-accent focus:bg-white/80
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? "border-[#e63946] focus:ring-[#e63946]/30" : ""}
            ${className}
          `}
          {...props}
        />
        {error ? (
          <p id={errorId} aria-live="polite" className="text-xs text-[#e63946] font-medium">
            {error}
          </p>
        ) : helperText ? (
          <p className="text-xs text-[#6e6e73]">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";
