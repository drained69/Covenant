/** @type {import('tailwindcss').Config} */
import plugin from "tailwindcss/plugin";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        // Serif italic for the private-wealth pull phrase idiom
        // (e.g. "Private balance." after "Public rails.").
        serif: ["'Instrument Serif'", "Georgia", "serif"],
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
        /* Sotto-style private-wealth palette: warm cream canvas, near-white
           raised surfaces, thin near-black hairlines. ink-950 is the page
           canvas; ink-900 is a barely-raised block; surface-raised is a
           fully white card. Values here read at once as "documents on a
           desk", the visual claim the Sotto surface makes. */
        ink: {
          950: "#f4f0e5",   // page canvas (was: full black)
          900: "#efeadc",   // barely-raised block / muted panel
          800: "#e6dfce",   // divider blocks / inline pills
          700: "#dcd4bf",   // subdued surface
          600: "#cec4ac",   // input rails
        },
        surface: {
          DEFAULT: "#f4f0e5",
          solid:   "#ffffff",
          raised:  "#ffffff",   // white cards on the cream canvas
          sunken:  "#efeadc",   // a step BELOW the canvas
        },
        line:          "rgba(30, 30, 20, 0.10)",
        "line-strong": "rgba(30, 30, 20, 0.18)",
        muted:         "#605e55",   // secondary body copy on cream (WCAG AA)
        /* The bottom hierarchy step still owes ≥4.5:1 on the lightest
           surface it lands on (surface-raised = pure white). #7f7d72 holds
           4.7:1 on white and stays a legible step below `muted`. */
        subtle:        "#7f7d72",

        /* Sotto-style dark forest — reserved for primary actions (the
           filled buttons) and the active nav tab underline. Muted top,
           near-black bottom; the whole ramp reads as ink with a green
           bias rather than a green with a hue. */
        brand: {
          50:  "#eef0e6",
          100: "#d9dcc8",
          200: "#b6bda2",
          /* 300 is the TEXT accent step — labels, links, active chips, and
             step numbers set in 10–13px type on cream or white. The old
             #8b9779 held ~2.9:1 there (a dark-theme value left on a light
             canvas); #566b47 holds 5.2:1 on cream and 5.6:1 on white while
             still reading as sage, clearly distinct from ink and from
             `muted`'s neutral grey. */
          300: "#566b47",
          400: "#405138",  // primary interactive (hover)
          500: "#2e3d28",  // primary solid (default buttons)
          600: "#1f2b1c",  // primary solid (active/pressed)
          700: "#141c12",
        },

        // Ethos brand violet — reserved EXCLUSIVELY for Ethos-attributed
        // elements (the credibility mark, score figures, attribution
        // blocks). Third-party provenance should read at a glance and never
        // blend into Covenant's own cyan: when something is violet, Ethos
        // computed it; when something is cyan, Covenant did.
        ethos: {
          300: "#c4b5fd",
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
        },

        /* Semantic colours recalibrated for the cream canvas: bright neons
           read as web-app on this surface; muted, more saturated tones read
           as institutional. All three clear WCAG AA on white. */
        compliant: { DEFAULT: "#4a7043", bg: "rgba(74, 112, 67, 0.10)", border: "rgba(74, 112, 67, 0.28)" },
        ok:   "#4a7043",
        warn: "#a3661a",
        bad:  "#9b3a2c",

        /* Tailwind's built-in slate is used ONLY for text in this app (0
           background usage, checked with grep). Overriding it here inverts
           every `text-slate-*` utility in one edit: what was a light-on-dark
           step becomes the equivalent dark-on-light step. Below 500 the
           values stay Tailwind defaults, since no dark surface remains for
           them to sit on. */
        slate: {
          50:  "#0f1109",   // was #f8fafc — headings on cream
          100: "#161911",   // was #f1f5f9 — strong body copy
          200: "#242821",   // was #e2e8f0 — body copy
          300: "#3f4238",   // was #cbd5e1 — body soft
          400: "#605e55",   // was #94a3b8 — muted equivalent
        },
      },
      boxShadow: {
        /* Depth on a light canvas is a shadow, not a glow. Softer alpha,
           tighter y-offset, near-black colour so cards read as paper on
           a desk rather than material-design floats. */
        card:         "0 1px 2px 0 rgba(20,20,10,0.06), 0 0 0 1px rgba(30,30,20,0.06)",
        "card-hover": "0 6px 20px -6px rgba(20,20,10,0.12), 0 0 0 1px rgba(30,30,20,0.10)",
        popover:      "0 18px 40px -12px rgba(20,20,10,0.16), 0 0 0 1px rgba(30,30,20,0.08)",
        "focus-ring": "0 0 0 3px rgba(46, 61, 40, 0.22)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "fade-in": { from: { opacity: 0 }, to: { opacity: 1 } },
        "fade-in-up": { from: { opacity: 0, transform: "translateY(4px)" }, to: { opacity: 1, transform: "translateY(0)" } },
        /* Route transitions end at `transform: none` — NOT `translateY(0)`.
           A retained non-none transform makes the wrapper a containing block
           for `position: fixed`, which would re-anchor CapitalModal's
           `fixed inset-0` overlay to the page column instead of the viewport
           long after the animation ended. `none` releases it. */
        "page-enter": { from: { opacity: 0, transform: "translateY(6px)" }, to: { opacity: 1, transform: "none" } },
        /* Value-change tick for live financial figures: a 3px settle-in that
           reads as a price refresh on a terminal, not a decorative bounce. */
        "num-tick": { from: { opacity: "0.4", transform: "translateY(-2px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        shimmer: "shimmer 1.8s infinite",
        "fade-in": "fade-in 0.2s ease-out both",
        "fade-in-up": "fade-in-up 0.3s cubic-bezier(0.16,1,0.3,1) both",
        "page-enter": "page-enter 0.28s cubic-bezier(0.16,1,0.3,1) both",
        "num-tick": "num-tick 0.3s cubic-bezier(0.16,1,0.3,1) both",
      },
    },
  },
  plugins: [
    /* Hover affordances are a pointer-device concept. On touch, `hover:`
       utilities match during the tap AND often stay matched afterwards
       (browsers keep the last-tapped element "hovered"), so tapped cards
       keep their elevation and tapped links keep their hover colour until
       something else is tapped. Re-registering the built-in variants
       (later registrations win — same mechanism as customizing `dark`)
       scopes every `hover:` / `group-hover:` utility in the app — in TSX
       and inside `@apply` alike — to devices that can actually hover. */
    plugin(({ addVariant }) => {
      addVariant("hover", "@media (hover: hover) { &:hover }");
      addVariant("group-hover", "@media (hover: hover) { &:is(:where(.group):hover *) }");
    }),
  ],
};
