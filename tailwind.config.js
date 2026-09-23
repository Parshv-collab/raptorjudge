import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1.5rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        "bg-base": "#f5f5f7",
        primary: { DEFAULT: "#1d1d1f", foreground: "#ffffff" },
        secondary: { DEFAULT: "#6e6e73", foreground: "#1d1d1f" },
        accent: { DEFAULT: "#ff0055", hover: "#e0004b", foreground: "#ffffff" },
        error: "#e63946",
        glass: {
          surface: "rgba(255, 255, 255, 0.55)",
          border: "rgba(255, 255, 255, 0.7)",
        },
      },
      borderRadius: {
        card: "20px",
        input: "12px",
        button: "12px",
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
        "glass-hover": "0 12px 40px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 1)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [animate],
};
