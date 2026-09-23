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
      "inline-flex items-center justify-center font-medium transition-all duration-150 rounded-button focus-ring-accent disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]";

    const sizeStyles = {
      sm: "px-3 py-1.5 text-xs h-8 gap-1.5",
      md: "px-4 py-2.5 text-sm h-10 gap-2",
      lg: "px-6 py-3 text-base h-12 gap-2.5",
    };

    const variantStyles = {
      primary:
        "bg-[#ff0055] text-white hover:bg-[#e0004b] shadow-sm shadow-[#ff0055]/30 active:bg-[#c40041]",
      secondary:
        "bg-white/60 text-[#1d1d1f] border border-white/80 hover:bg-white/80 hover:border-white shadow-sm backdrop-blur-md",
      ghost:
        "bg-transparent text-[#1d1d1f] hover:bg-black/5 active:bg-black/10",
      danger:
        "bg-[#e63946] text-white hover:bg-[#cc2b37] shadow-sm shadow-[#e63946]/30",
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
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
