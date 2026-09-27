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
          <label htmlFor={inputId} className="text-[13px] text-secondary">
            {label} {required && <span className="text-danger">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          required={required}
          className={`
            w-full h-10 px-3.5 text-sm rounded-input text-primary placeholder:text-muted
            bg-surface-1 border border-line
            transition-colors duration-fast focus:border-accent focus:outline-2 focus:outline-accent/40
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? "border-danger" : ""}
            ${className}
          `}
          {...props}
        />
        {error ? (
          <p id={errorId} aria-live="polite" className="text-[13px] text-danger">
            {error}
          </p>
        ) : helperText ? (
          <p className="text-[13px] text-muted">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";
