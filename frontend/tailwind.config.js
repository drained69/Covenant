/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Refined institutional scale — tighter display, more generous body
        display: ["3.5rem", { lineHeight: "1.05", letterSpacing: "-0.03em", fontWeight: "650" }],
        h1:      ["2.5rem", { lineHeight: "1.12", letterSpacing: "-0.025em", fontWeight: "650" }],
        h2:      ["1.75rem", { lineHeight: "1.22", letterSpacing: "-0.02em", fontWeight: "600" }],
        h3:      ["1.25rem", { lineHeight: "1.3", letterSpacing: "-0.015em", fontWeight: "600" }],
        "body-lg": ["1.0625rem", { lineHeight: "1.65", letterSpacing: "-0.006em" }],
        body:      ["0.9375rem", { lineHeight: "1.6" }],
        "body-sm": ["0.8125rem", { lineHeight: "1.5" }],
        micro:     ["0.6875rem", { lineHeight: "1.4", letterSpacing: "0.06em" }],
      },
      colors: {
        // Deeper neutral base — less navy, more pure neutral
        ink:     {
          950: "#030712", // pure dark
          900: "#0a0e1a",
          800: "#111827",
          700: "#1f2937",
          600: "#374151"
        },
        surface: {
          DEFAULT: "rgba(17, 24, 39, 0.90)",
          solid: "#111827",
          raised: "#1f2937",
          sunken: "#0a0e1a"
        },
        line:    "rgba(156, 163, 175, 0.10)",
        "line-strong": "rgba(156, 163, 175, 0.18)",
        muted:   "#9ca3af",
        subtle:  "#6b7280",

        // Refined cyan — pure, desaturated, professional
        brand:   {
          50:  "#ecfeff",
          100: "#cffafe",
          200: "#a5f3fc",
          300: "#67e8f9",
          400: "#22d3ee",  // primary interactive
          500: "#06b6d4",  // primary solid
          600: "#0891b2",
          700: "#0e7490",
        },

        // Semantic colors — reserved for status only
        compliant: { DEFAULT: "#10b981", bg: "rgba(16, 185, 129, 0.08)", border: "rgba(16, 185, 129, 0.24)" },
        ok:      "#10b981",
        warn:    "#f59e0b",
        bad:     "#ef4444",
      },
      boxShadow: {
        // Subtle elevation — no glow, just depth
        card:      "0 1px 3px 0 rgba(0,0,0,0.5), 0 0.5px 0 0 rgba(255,255,255,0.02) inset",
        "card-hover": "0 8px 24px -6px rgba(0,0,0,0.6), 0 0.5px 0 0 rgba(255,255,255,0.03) inset",
        popover:   "0 20px 48px -12px rgba(0,0,0,0.65), 0 0 0 1px rgba(156,163,175,0.08)",
        "focus-ring": "0 0 0 3px rgba(34, 211, 238, 0.28)",
      },
      backgroundImage: {
        "grid-fine":
          "linear-gradient(rgba(156,163,175,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(156,163,175,0.05) 1px, transparent 1px)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "fade-in": { from: { opacity: 0 }, to: { opacity: 1 } },
        "fade-in-up": { from: { opacity: 0, transform: "translateY(4px)" }, to: { opacity: 1, transform: "translateY(0)" } },
      },
      animation: {
        shimmer: "shimmer 1.8s infinite",
        "fade-in": "fade-in 0.2s ease-out both",
        "fade-in-up": "fade-in-up 0.3s cubic-bezier(0.16,1,0.3,1) both",
      },
    },
  },
  plugins: [],
};
