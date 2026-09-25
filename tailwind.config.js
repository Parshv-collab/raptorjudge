import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    // Base unit: 4px (Tailwind default scale). Page padding 32px = p-8,
    // card padding 24px = p-6, section gap 48px = gap-12, inline gap 12px = gap-3.
    extend: {
      colors: {
        canvas: "var(--color-bg)",
        backdrop: "var(--color-backdrop)",
        surface: {
          DEFAULT: "var(--color-surface-1)",
          1: "var(--color-surface-1)",
          2: "var(--color-surface-2)",
        },
        line: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)",
        },
        primary: "var(--color-text-primary)",
        secondary: "var(--color-text-secondary)",
        muted: "var(--color-text-muted)",
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
        },
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        danger: "var(--color-danger)",
      },
      borderRadius: {
        btn: "var(--radius-button)",
        input: "var(--radius-input)",
        card: "var(--radius-card)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        modal: "var(--shadow-modal)",
      },
      fontFamily: {
        sans: [
          '"Inter Tight Variable"',
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          '"JetBrains Mono Variable"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      fontSize: {
        // Editorial type scale (weight/leading/tracking baked in)
        display: ["3.5rem", { lineHeight: "1.1", letterSpacing: "-0.03em", fontWeight: "600" }],
        h1: ["2.25rem", { lineHeight: "1.15", letterSpacing: "-0.02em", fontWeight: "600" }],
        h2: ["1.5rem", { lineHeight: "1.25", letterSpacing: "-0.01em", fontWeight: "600" }],
        h3: ["1.125rem", { lineHeight: "1.4", fontWeight: "600" }],
      },
      transitionDuration: {
        fast: "150ms",
        state: "200ms",
      },
      maxWidth: {
        content: "var(--content-max)",
      },
      width: {
        sidebar: "var(--sidebar-width)",
      },
    },
  },
  plugins: [animate],
};
