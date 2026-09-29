import React, { forwardRef } from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled,
      className = "",
      children,
      type = "button",
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium transition-colors duration-fast rounded-btn focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 disabled:pointer-events-none select-none";

    const sizeStyles = {
      sm: "px-3 h-8 text-[13px] gap-1.5",
      md: "px-4 h-10 text-sm gap-2",
      lg: "px-6 h-12 text-[15px] gap-2.5",
    };

    const variantStyles = {
      primary: "bg-accent text-white hover:bg-accent-hover",
      secondary:
        "bg-surface-2 text-primary border border-line hover:border-line-strong hover:bg-line/20",
      ghost: "bg-transparent text-secondary hover:text-primary hover:bg-surface-2",
      danger: "bg-danger text-white hover:brightness-110",
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin -ml-1 h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
