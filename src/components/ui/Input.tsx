import React, { forwardRef, useId } from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  /**
   * Rendered inside the field, pinned to its left edge, with the text inset
   * automatically. Decorative: the icon is `aria-hidden`, so the field is still
   * announced by its label alone.
   */
  leadingIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leadingIcon, className = "", id, required, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    // Emitted as one of two whole paddings rather than `px-3.5` plus a `pl-*`
    // override: both would set `padding-left`, and which one wins would come
    // down to stylesheet order.
    const padding = leadingIcon ? "pl-10 pr-3.5" : "px-3.5";

    // Helper text is part of the field's description too, not just errors —
    // otherwise "How you appear on certificates" is never announced.
    const describedBy = error ? errorId : helperText ? helperId : undefined;

    const field = (
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        required={required}
        className={`
            w-full h-10 ${padding} text-sm rounded-input text-primary placeholder:text-muted
            bg-surface-1 border border-line
            transition-colors duration-fast focus:border-accent focus:outline-2 focus:outline-accent
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? "border-danger" : ""}
            ${className}
          `}
        {...props}
      />
    );

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-[13px] text-secondary">
            {label} {required && <span className="text-danger">*</span>}
          </label>
        )}
        {leadingIcon ? (
          <div className="relative w-full">
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none flex"
              aria-hidden="true"
            >
              {leadingIcon}
            </span>
            {field}
          </div>
        ) : (
          field
        )}
        {error ? (
          <p id={errorId} aria-live="polite" className="text-[13px] text-danger">
            {error}
          </p>
        ) : helperText ? (
          <p id={helperId} className="text-[13px] text-muted">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";
