import React from "react";

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "info" | "error" | "success" | "warning";
  title?: string;
  onClose?: () => void;
}

const variantStyles = {
  info: "border-line-strong bg-surface-2 text-secondary",
  error: "border-danger/40 bg-danger/5 text-danger",
  success: "border-success/40 bg-success/5 text-success",
  warning: "border-warning/40 bg-warning/5 text-warning",
};

export const Alert: React.FC<AlertProps> = ({
  variant = "info",
  title,
  onClose,
  children,
  className = "",
  ...props
}) => {
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 p-4 rounded-card border ${variantStyles[variant]} ${className}`}
      {...props}
    >
      <div className="flex-1 text-sm leading-relaxed [&_a]:underline">
        {title && <h4 className="font-semibold text-primary mb-0.5">{title}</h4>}
        <div>{children}</div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="text-muted hover:text-primary p-1 rounded-btn transition-colors duration-fast"
          aria-label="Close alert"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
};
