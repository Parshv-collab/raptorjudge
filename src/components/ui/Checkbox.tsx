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
        <label htmlFor={checkboxId} className="inline-flex items-center gap-2.5 cursor-pointer text-sm text-primary">
          <input
            ref={ref}
            id={checkboxId}
            type="checkbox"
            className={`
              w-4 h-4 rounded-[4px] appearance-none border border-line-strong bg-surface-1
              checked:bg-accent checked:border-accent cursor-pointer shrink-0
              bg-center bg-no-repeat transition-colors duration-fast
              ${className}
            `}
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M3.5 8.5l3 3 6-7' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
              backgroundSize: "12px 12px",
            }}
            {...props}
          />
          <span className="select-none">{label}</span>
        </label>
        {error && (
          // `ml-6.5` is not a Tailwind step, so it compiled to nothing and the
          // error sat flush against the checkbox. 26px = the 16px box plus the
          // 10px gap, so the message lines up under the label.
          <p aria-live="polite" className="text-[13px] text-danger ml-[26px]">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Checkbox.displayName = "Checkbox";
