/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        // Reference: TheStandard.io-style. Deep near-black background, cyan/teal primary accent,
        // support colors (green up, red down, orange highlight) for stat values.
        ink:     { 950: "#04060c", 900: "#080b16", 800: "#0c1120", 700: "#141a2c" },
        surface: { DEFAULT: "rgba(12, 17, 32, 0.72)", solid: "#0c1120", raised: "#141a2c" },
        line:    "rgba(148, 163, 184, 0.10)",
        muted:   "#8ea2b8",
        subtle:  "#5b6c85",
        brand:   {
          100: "#c8fff8", 200: "#8ff5e8", 300: "#4feadb", 400: "#22d3c2",
          500: "#0ec6b5", 600: "#0aa89a", 700: "#087a70",
        },
        ok:      "#22c55e",
        warn:    "#f59e0b",
        bad:     "#ef4444",
        pop:     "#f97316", // orange stat accent (matches reference)
      },
      boxShadow: {
        card: "0 8px 32px 0 rgba(0, 0, 0, 0.5)",
        glow: "0 0 0 1px rgba(34, 211, 194, 0.35), 0 0 24px 0 rgba(14, 198, 181, 0.35)",
        "glow-sm": "0 0 0 1px rgba(34, 211, 194, 0.25), 0 0 12px 0 rgba(14, 198, 181, 0.2)",
      },
      backgroundImage: {
        // Diagonal radial glows behind the app — left-bottom teal, right-top cool blue.
        "hero-glow":
          "radial-gradient(at 10% 60%, rgba(14, 198, 181, 0.16), transparent 45%), radial-gradient(at 90% 10%, rgba(30, 64, 175, 0.12), transparent 45%)",
        "chart-glow":
          "linear-gradient(180deg, rgba(34, 211, 194, 0.28) 0%, rgba(34, 211, 194, 0) 100%)",
      },
    },
  },
  plugins: [],
};
