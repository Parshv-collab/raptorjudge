import React, { forwardRef, useId } from "react";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, className = "", id, required, rows = 4, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = id || generatedId;
    const errorId = `${textareaId}-error`;

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={textareaId} className="text-[13px] text-secondary">
            {label} {required && <span className="text-danger">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          required={required}
          className={`
            w-full min-h-24 px-3.5 py-2.5 text-sm rounded-input text-primary placeholder:text-muted
            bg-surface-1 border border-line resize-y
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

Textarea.displayName = "Textarea";
